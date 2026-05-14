import { app, BrowserWindow, ipcMain, Notification, shell, systemPreferences } from 'electron'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { join } from 'path'
import log from 'electron-log/main'
import { setupTray, destroyTray } from './tray'
import { DEFAULT_HOTKEY, registerToggleHotkey, unregisterAll } from './hotkey'
import {
  getOrCreateOverlay,
  hideOverlay,
  sendToOverlay,
  showOverlay
} from './overlay-window'
import { saveAndConvertWebm } from './audio'
import { transcribeLocal } from './whisper'
import { onDownloadProgress } from './model-downloader'

// electron-log como sustituto de console.* (regla del proyecto desde Fase 1).
log.initialize()
log.transports.file.level = 'info'
log.transports.console.level = 'debug'
log.info('CleeVoice main process boot')

const gotSingleInstanceLock = app.requestSingleInstanceLock()
if (!gotSingleInstanceLock) {
  log.warn('Otra instancia de CleeVoice ya está corriendo. Saliendo.')
  app.quit()
}

let mainWindow: BrowserWindow | null = null

/**
 * FSM de grabación (Fase 3).
 *
 *   idle ─hotkey─▶ recording ─hotkey─▶ processing ─audio-ready─▶ transcribing
 *                                          │                          │
 *                                          └─error/timeout─▶ idle ◀──result(text)
 *
 * El estado `transcribing` cubre desde que tenemos el WAV hasta que whisper.cpp
 * devuelve texto. Fase 4 agregará "pasting" entre transcribing y idle.
 */
type RecordingState = 'idle' | 'recording' | 'processing' | 'transcribing'
let state: RecordingState = 'idle'
let processingTimeout: NodeJS.Timeout | null = null
let overlayHideTimeout: NodeJS.Timeout | null = null

// Si el renderer del overlay no devuelve el blob en este tiempo, asumimos que algo se trabó.
const PROCESSING_TIMEOUT_MS = 5000

// Cuánto mostrar el texto transcrito en el overlay antes de ocultarlo (Fase 3).
// Fase 4 desaparece este timer: el overlay se cierra apenas se pega el texto.
const RESULT_DISPLAY_MS = 3000

function setState(next: RecordingState): void {
  log.debug(`State: ${state} → ${next}`)
  state = next
  if (processingTimeout) {
    clearTimeout(processingTimeout)
    processingTimeout = null
  }
  if (next === 'processing') {
    processingTimeout = setTimeout(() => {
      if (state === 'processing') {
        log.error(`Timeout en 'processing' tras ${PROCESSING_TIMEOUT_MS}ms — reset.`)
        notify(
          'Audio no llegó',
          'El renderer no devolvió el audio a tiempo. Revisá los logs.'
        )
        cancelToIdle('processing timeout')
      }
    }, PROCESSING_TIMEOUT_MS)
  }
}

function createMainWindow(): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show()
    mainWindow.focus()
    return
  }

  mainWindow = new BrowserWindow({
    width: 900,
    height: 640,
    show: false,
    autoHideMenuBar: true,
    title: 'CleeVoice',
    backgroundColor: '#0b0b14',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.webContents.on('console-message', (_e, level, message, line, sourceId) => {
    const tag = `[main-win/${['v', 'i', 'w', 'e'][level] ?? '?'}]`
    log.info(`${tag} ${message}  (${sourceId}:${line})`)
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function notify(title: string, body: string): void {
  if (Notification.isSupported()) {
    new Notification({ title, body, silent: false }).show()
  }
  log.info(`Notify: ${title} — ${body}`)
}

function ensureMicrophonePermission(): boolean {
  if (process.platform === 'darwin') {
    const status = systemPreferences.getMediaAccessStatus('microphone')
    log.info(`Permiso de micrófono (macOS): ${status}`)
    if (status === 'denied') {
      notify(
        'Permiso de micrófono denegado',
        'Activá CleeVoice en Preferencias del Sistema → Privacidad y seguridad → Micrófono.'
      )
      return false
    }
  }
  return true
}

function clearOverlayHideTimeout(): void {
  if (overlayHideTimeout) {
    clearTimeout(overlayHideTimeout)
    overlayHideTimeout = null
  }
}

function startRecording(): void {
  if (state !== 'idle') {
    log.warn(`startRecording ignorado: estado=${state}`)
    return
  }
  if (!ensureMicrophonePermission()) return

  clearOverlayHideTimeout()
  setState('recording')
  showOverlay()
  sendToOverlay('toggle-recording', { active: true })
  sendToOverlay('start-recording')
  log.info('Grabación iniciada')
}

function stopRecording(): void {
  if (state !== 'recording') {
    log.warn(`stopRecording ignorado: estado=${state}`)
    return
  }
  setState('processing')
  sendToOverlay('toggle-recording', { active: false })
  sendToOverlay('stop-recording')
  log.info('Grabación detenida — esperando blob del renderer')
}

function cancelToIdle(reason: string): void {
  log.warn(`Reset a idle: ${reason}`)
  setState('idle')
  sendToOverlay('toggle-recording', { active: false })
  hideOverlay()
}

function scheduleOverlayHide(ms: number): void {
  clearOverlayHideTimeout()
  overlayHideTimeout = setTimeout(() => {
    cancelToIdle('display window expirado')
  }, ms)
}

function toggleRecording(): void {
  if (state === 'idle') startRecording()
  else if (state === 'recording') stopRecording()
  else log.debug(`toggleRecording ignorado: estado=${state}`)
}

/**
 * Pipeline post-WAV (Fase 3 — sólo transcribe local).
 * Fase 4: agrega paste al final. Fase 6: ramifica entre local y cloud.
 * Fase 7: agrega cleanup con LLM antes del paste.
 */
async function runPostAudioPipeline(wavPath: string, audioMs: number): Promise<void> {
  setState('transcribing')
  sendToOverlay('transcribing-started')
  log.info(`Transcribiendo ${wavPath} (audio ${audioMs}ms)…`)

  try {
    // Default Fase 3.5: modelo `small` (460MB) — notablemente mejor en español que `base`.
    // Fase 5 expondrá esto en Settings para que el usuario elija según su máquina.
    const result = await transcribeLocal(wavPath, { language: 'es', model: 'small' })
    log.info(`Texto: "${result.text}"`)
    sendToOverlay('transcribed', {
      text: result.text,
      durationMs: result.durationMs,
      engine: result.engine,
      model: result.model
    })
    notify('CleeVoice — Texto transcrito', result.text || '(sin texto)')
    scheduleOverlayHide(RESULT_DISPLAY_MS)
    setState('idle')
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    log.error('Error transcribiendo', err)
    sendToOverlay('transcribe-error', message)
    notify('Error al transcribir', message)
    scheduleOverlayHide(RESULT_DISPLAY_MS)
    setState('idle')
  }
}

app.on('second-instance', () => {
  createMainWindow()
})

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.joinsclee.cleevoice')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  if (process.platform === 'darwin') {
    app.dock?.hide()
  }

  getOrCreateOverlay()

  setupTray({
    onOpenSettings: () => createMainWindow(),
    onToggleRecording: toggleRecording,
    onQuit: () => {
      log.info('Quit desde tray menu')
      unregisterAll()
      destroyTray()
      app.quit()
    }
  })

  const hotkeyResult = registerToggleHotkey(DEFAULT_HOTKEY, toggleRecording)
  if (!hotkeyResult.registered) {
    log.error(`Hotkey ${DEFAULT_HOTKEY} no se pudo registrar: ${hotkeyResult.reason}`)
  }

  // Reenviamos progreso de descarga del modelo al overlay (UI puede mostrar barra
  // en Fase 5 cuando exista pantalla de Settings — por ahora sólo va a logs).
  onDownloadProgress((p) => {
    sendToOverlay('model-download-progress', p)
    log.info(`Modelo ${p.model}: ${p.percent}% (${p.receivedBytes}/${p.totalBytes})`)
  })

  // IPC: el renderer del overlay manda el blob crudo del MediaRecorder.
  ipcMain.handle(
    'audio-ready',
    async (
      _e,
      payload: { buffer: ArrayBuffer; mimeType: string }
    ): Promise<{ wavPath: string; durationMs: number }> => {
      if (state !== 'processing') {
        log.warn(`audio-ready llegó en estado ${state}; lo procesamos igual.`)
      }
      try {
        const saved = await saveAndConvertWebm(payload.buffer)
        // Disparamos el pipeline en background; respondemos al renderer enseguida
        // para que cierre su MediaRecorder. El pipeline maneja sus propios errores.
        void runPostAudioPipeline(saved.wavPath, saved.durationMs)
        return { wavPath: saved.wavPath, durationMs: saved.durationMs }
      } catch (err) {
        log.error('Error guardando/convirtiendo audio', err)
        notify('Error al guardar audio', String(err))
        cancelToIdle('error de conversión')
        throw err
      }
    }
  )

  ipcMain.on('audio-error', (_e, message: string) => {
    log.error(`Renderer reportó error de audio: ${message}`)
    notify('Error al grabar audio', message)
    cancelToIdle('audio-error desde renderer')
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().every((w) => !w.isVisible())) {
      createMainWindow()
    }
  })
})

// Cerrar todas las ventanas NO cierra la app — CleeVoice vive en el tray.
app.on('window-all-closed', () => {
  log.debug('window-all-closed: la app sigue viva en el tray')
})

app.on('will-quit', () => {
  unregisterAll()
})
