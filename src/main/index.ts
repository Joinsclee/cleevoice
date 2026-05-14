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

// electron-log como sustituto de console.* (regla del proyecto desde Fase 1).
log.initialize()
log.transports.file.level = 'info'
log.transports.console.level = 'debug'
log.info('CleeVoice main process boot')

/**
 * Single-instance lock: solo una CleeVoice corriendo a la vez.
 * Re-abrir la app en lugar de levantar otra instancia trae al frente la ventana de Settings.
 */
const gotSingleInstanceLock = app.requestSingleInstanceLock()
if (!gotSingleInstanceLock) {
  log.warn('Otra instancia de CleeVoice ya está corriendo. Saliendo.')
  app.quit()
}

let mainWindow: BrowserWindow | null = null

/**
 * FSM de grabación (Fase 2).
 *
 *   idle ──hotkey──▶ recording ──hotkey──▶ processing ──audio-ready──▶ idle
 *                                       │
 *                                       └── audio-error ──▶ idle
 *
 * El estado `processing` cubre desde que pedimos al renderer detener el
 * MediaRecorder hasta que recibimos el ArrayBuffer y lo guardamos como WAV.
 * Fase 3 extenderá el camino feliz con "transcribing" y "pasting".
 */
type RecordingState = 'idle' | 'recording' | 'processing'
let state: RecordingState = 'idle'

function setState(next: RecordingState): void {
  log.debug(`State: ${state} → ${next}`)
  state = next
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
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
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
  // En macOS el primer getUserMedia dispara el prompt; aquí solo logueamos el status.
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

function startRecording(): void {
  if (state !== 'idle') {
    log.warn(`startRecording ignorado: estado=${state}`)
    return
  }
  if (!ensureMicrophonePermission()) return

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
  // El overlay sigue visible hasta que llegue 'audio-ready' o 'audio-error'.
}

function cancelToIdle(reason: string): void {
  log.warn(`Reset a idle: ${reason}`)
  setState('idle')
  sendToOverlay('toggle-recording', { active: false })
  hideOverlay()
}

function toggleRecording(): void {
  if (state === 'idle') startRecording()
  else if (state === 'recording') stopRecording()
  else log.debug(`toggleRecording ignorado: estado=${state}`)
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

  const result = registerToggleHotkey(DEFAULT_HOTKEY, toggleRecording)
  if (!result.registered) {
    log.error(`Hotkey ${DEFAULT_HOTKEY} no se pudo registrar: ${result.reason}`)
  }

  // IPC: el renderer manda el blob crudo del MediaRecorder.
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
        // Fase 2: no transcribimos todavía. Fase 3 encadenará aquí transcribe + paste.
        notify(
          'Audio capturado',
          `Duración ~${(saved.durationMs / 1000).toFixed(1)}s · ${saved.wavPath}`
        )
        cancelToIdle('audio guardado')
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
