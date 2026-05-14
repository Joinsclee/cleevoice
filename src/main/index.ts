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
import {
  ensureModel,
  getModelPath,
  getModelsDir,
  isModelReady,
  onDownloadProgress,
  type WhisperModel
} from './model-downloader'
import {
  pasteText,
  hasAccessibilityPermission,
  openAccessibilitySettings,
  type PasteResult
} from './paste'
import {
  getAllSettings,
  getSetting,
  onSettingsChange,
  updateSettings,
  type CleeVoiceSettings
} from './settings'
import {
  encryptApiKey,
  decryptApiKey,
  testGroqKey,
  transcribeWithGroq,
  GroqError
} from './groq'
import { cleanupText, detectActiveApp, CleanupError } from './llm-cleanup'
import { promises as fs } from 'node:fs'
import path from 'node:path'

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
type RecordingState =
  | 'idle'
  | 'recording'
  | 'processing'
  | 'transcribing'
  | 'cleaning'
  | 'pasting'
let state: RecordingState = 'idle'
let processingTimeout: NodeJS.Timeout | null = null
let overlayHideTimeout: NodeJS.Timeout | null = null

// Si el renderer del overlay no devuelve el blob en este tiempo, asumimos que algo se trabó.
const PROCESSING_TIMEOUT_MS = 5000

// Cuánto mostrar el feedback ("✓ Pegado" o el texto si no se pudo pegar) antes
// de ocultar el overlay. Suficiente para confirmar visualmente sin estorbar.
const RESULT_DISPLAY_MS = 1500
// Tiempo extra cuando NO pudimos pegar (mostramos el texto completo para que el
// usuario lo lea o lo pegue manual con Cmd+V).
const FALLBACK_DISPLAY_MS = 4000

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
  if (Notification.isSupported() && getSetting('showNotifications')) {
    new Notification({ title, body, silent: false }).show()
  }
  log.info(`Notify: ${title} — ${body}`)
}

/** Lista de modelos con su estado actual (descargado o no). */
const MODEL_METADATA: Record<WhisperModel, { sizeMb: number }> = {
  tiny: { sizeMb: 75 },
  base: { sizeMb: 140 },
  small: { sizeMb: 460 },
  medium: { sizeMb: 1500 }
}

function listModels(): {
  name: WhisperModel
  sizeMb: number
  downloaded: boolean
  path: string
}[] {
  const dir = getModelsDir()
  return (Object.keys(MODEL_METADATA) as WhisperModel[]).map((name) => ({
    name,
    sizeMb: MODEL_METADATA[name].sizeMb,
    downloaded: isModelReady(name),
    path: path.join(dir, `ggml-${name}.bin`)
  }))
}

/** Difunde el snapshot completo a todas las ventanas que tengan el listener. */
function broadcastSettings(settings: CleeVoiceSettings): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('settings:changed', settings)
  }
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
    // Settings live: el usuario puede cambiar engine/modelo/idioma sin reiniciar.
    const settings = getAllSettings()
    let result: {
      text: string
      durationMs: number
      engine: 'local' | 'groq'
      model: string
    }

    const customPrompt = settings.customPrompt.trim()
    const promptOverride = customPrompt.length > 0 ? { prompt: customPrompt } : {}

    // Router de engine. Si el usuario eligió Groq pero no hay API key, o si la
    // llamada cloud falla por error retryable, caemos a Local con notificación.
    const useGroq = settings.engine === 'groq' && settings.groqApiKey.length > 0
    if (useGroq) {
      const apiKey = decryptApiKey(settings.groqApiKey)
      try {
        result = await transcribeWithGroq(wavPath, {
          apiKey,
          language: settings.language,
          ...promptOverride
        })
      } catch (err) {
        if (err instanceof GroqError && err.retryable) {
          log.warn(`Groq retryable falló (${err.status ?? '?'}). Fallback a local.`)
          notify(
            'Cloud no disponible',
            'Groq no respondió a tiempo. Usando engine local para esta transcripción.'
          )
          result = await transcribeLocal(wavPath, {
            language: settings.language,
            model: settings.model,
            ...promptOverride
          })
        } else {
          throw err
        }
      }
    } else {
      if (settings.engine === 'groq' && !settings.groqApiKey) {
        log.warn('engine=groq pero no hay API key — usando local.')
      }
      result = await transcribeLocal(wavPath, {
        language: settings.language,
        model: settings.model,
        ...promptOverride
      })
    }

    log.info(`Texto raw: "${result.text}"`)
    sendToOverlay('transcribed', {
      text: result.text,
      durationMs: result.durationMs,
      engine: result.engine,
      model: result.model
    })

    if (!result.text.trim()) {
      notify('CleeVoice — Sin texto', 'Whisper no detectó habla en la grabación.')
      scheduleOverlayHide(RESULT_DISPLAY_MS)
      setState('idle')
      return
    }

    // ─── Cleanup con LLM (Fase 7) ──────────────────────────────────────────
    // Si está habilitado Y hay API key de Groq, pasamos el texto por Llama 3.3.
    // Si falla por red/rate-limit, seguimos con el texto raw (no bloqueamos al usuario).
    let finalText = result.text
    if (settings.cleanupEnabled && settings.groqApiKey) {
      setState('cleaning')
      sendToOverlay('cleaning-started')
      try {
        const active = await detectActiveApp()
        log.info(`Cleanup contexto: app="${active.name}" → ${active.context}`)
        const cleanup = await cleanupText({
          apiKey: decryptApiKey(settings.groqApiKey),
          rawText: result.text,
          language: settings.language,
          tone: settings.cleanupTone,
          appName: active.name,
          appContext: active.context,
          dictionary: settings.dictionary,
          customSystemPrompt: settings.cleanupSystemPrompt
        })
        finalText = cleanup.text
        log.info(`Texto limpio: "${finalText}"`)
        sendToOverlay('cleaned', { text: finalText, durationMs: cleanup.durationMs })
      } catch (err) {
        if (err instanceof CleanupError) {
          log.warn(`Cleanup falló (${err.status ?? '?'}): ${err.message}`)
          notify(
            'Limpieza con IA falló',
            'Uso el texto sin procesar. Revisá tu key de Groq o el rate limit.'
          )
        } else {
          log.error('Cleanup error inesperado', err)
        }
        // Seguimos con el texto raw.
      }
    }

    // Paste sintético en la app activa (Fase 4).
    setState('pasting')
    sendToOverlay('pasting-started')
    let pasteResult: PasteResult
    try {
      pasteResult = await pasteText(finalText)
    } catch (err) {
      log.error('pasteText lanzó', err)
      pasteResult = { pasted: false, reason: 'applescript-error' }
    }

    if (pasteResult.pasted) {
      log.info('Texto pegado en la app activa.')
      sendToOverlay('pasted', { ok: true })
      scheduleOverlayHide(RESULT_DISPLAY_MS)
    } else {
      log.warn(`Paste falló: ${pasteResult.reason} — texto disponible en clipboard.`)
      sendToOverlay('pasted', { ok: false, reason: pasteResult.reason })
      scheduleOverlayHide(FALLBACK_DISPLAY_MS)

      // Si la causa fue falta de permiso de accesibilidad, abrimos el panel de
      // Settings — la notificación + el prompt nativo + el panel abierto
      // maximizan la chance de que el usuario lo configure en el momento.
      if (pasteResult.reason === 'no-accessibility') {
        openAccessibilitySettings()
      }
    }
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

  const initialHotkey = getSetting('hotkey') || DEFAULT_HOTKEY
  const hotkeyResult = registerToggleHotkey(initialHotkey, toggleRecording)
  if (!hotkeyResult.registered) {
    log.error(`Hotkey ${initialHotkey} no se pudo registrar: ${hotkeyResult.reason}`)
    // Si el accelerator guardado colisiona, restauramos el default.
    if (initialHotkey !== DEFAULT_HOTKEY) {
      log.warn(`Restaurando hotkey al default: ${DEFAULT_HOTKEY}`)
      const fallback = registerToggleHotkey(DEFAULT_HOTKEY, toggleRecording)
      if (fallback.registered) updateSettings({ hotkey: DEFAULT_HOTKEY })
    }
  }

  // Cuando cambia un setting que necesita re-acción del runtime, lo aplicamos acá:
  //  - hotkey:    re-register
  //  - autostart: app.setLoginItemSettings
  //  - tray:      rebuild menú con engine label nuevo
  // El resto (model/language/customPrompt/dictionary) se lee al vuelo en el pipeline.
  onSettingsChange((next, prev) => {
    if (next.hotkey !== prev.hotkey) {
      const r = registerToggleHotkey(next.hotkey, toggleRecording)
      if (!r.registered) {
        log.error(`Hotkey ${next.hotkey} no se pudo registrar — volviendo a ${prev.hotkey}.`)
        registerToggleHotkey(prev.hotkey, toggleRecording)
        // Notificar al usuario por el panel de settings.
        broadcastSettings({ ...next, hotkey: prev.hotkey })
        return
      }
      log.info(`Hotkey actualizado a ${next.hotkey}`)
    }
    if (next.autostart !== prev.autostart) {
      app.setLoginItemSettings({ openAtLogin: next.autostart })
      log.info(`autostart=${next.autostart}`)
    }
    broadcastSettings(next)
  })

  // Aplica el autostart al boot por si cambió fuera del runtime (raro pero limpio).
  app.setLoginItemSettings({ openAtLogin: getSetting('autostart') })

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

  // Si el usuario toca "Abrir permisos" en el overlay (Fase 5+ tendrá UI completa).
  ipcMain.on('open-accessibility-settings', () => {
    openAccessibilitySettings()
  })

  // Logueamos el estado del permiso de accesibilidad al boot — útil para diagnóstico.
  if (process.platform === 'darwin') {
    log.info(
      `Permiso de accesibilidad: ${hasAccessibilityPermission() ? 'granted' : 'NO concedido'}`
    )
  }

  // ─── Handlers IPC de Settings (Fase 5) ────────────────────────────────────
  ipcMain.handle('settings:getAll', () => getAllSettings())
  ipcMain.handle('settings:update', (_e, patch: Partial<CleeVoiceSettings>) => {
    // Si el patch trae groqApiKey en plano (no vacío y no parece base64 largo),
    // lo ciframos antes de persistir. La UI manda siempre la key en texto plano.
    const safePatch = { ...patch }
    if (typeof safePatch.groqApiKey === 'string') {
      safePatch.groqApiKey = safePatch.groqApiKey
        ? encryptApiKey(safePatch.groqApiKey)
        : ''
    }
    return updateSettings(safePatch)
  })
  ipcMain.handle('settings:reset', () => {
    // Reset suave: borramos sólo los campos editables; los listeners re-aplican.
    return updateSettings({
      hotkey: DEFAULT_HOTKEY,
      engine: 'local',
      model: 'small',
      language: 'es',
      autostart: false,
      showNotifications: true,
      cleanupEnabled: false,
      customPrompt: ''
    })
  })

  // ─── Handlers IPC de Modelos (Fase 5) ─────────────────────────────────────
  ipcMain.handle('models:list', () => listModels())
  ipcMain.handle('models:download', async (_e, name: WhisperModel) => {
    try {
      const p = await ensureModel(name)
      return { ok: true, path: p }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })
  ipcMain.handle('models:delete', async (_e, name: WhisperModel) => {
    try {
      const p = getModelPath(name)
      await fs.unlink(p)
      log.info(`Modelo eliminado: ${p}`)
      return { ok: true }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  // ─── Handlers Groq (Fase 6) ───────────────────────────────────────────────
  ipcMain.handle('groq:testKey', async (_e, key: string) => {
    return testGroqKey(key)
  })
  // El renderer no debe ver la API key descifrada nunca (queda en main).
  // Sólo informamos si está configurada o no.
  ipcMain.handle('groq:hasKey', () => {
    return getSetting('groqApiKey').length > 0
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
