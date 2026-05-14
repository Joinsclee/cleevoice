import { app, BrowserWindow, shell } from 'electron'
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

// Estado mínimo de "estoy mostrando el overlay" para Fase 1.
// En Fase 2 esto pasará a ser un FSM real (idle → recording → processing).
let overlayActive = false
let overlayAutoHideTimer: NodeJS.Timeout | null = null
const OVERLAY_AUTO_HIDE_MS = 2000

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

function startOverlaySession(): void {
  overlayActive = true
  showOverlay()
  // Pequeño delay para asegurar que el renderer está listo antes del primer IPC.
  setTimeout(() => sendToOverlay('toggle-recording', { active: true }), 0)
  log.info('Overlay: sesión iniciada')

  // Fase 1: el overlay se oculta solo a los 2s.
  // Fase 2: este timer desaparece; el stop será explícito al soltar/presionar de nuevo.
  if (overlayAutoHideTimer) clearTimeout(overlayAutoHideTimer)
  overlayAutoHideTimer = setTimeout(stopOverlaySession, OVERLAY_AUTO_HIDE_MS)
}

function stopOverlaySession(): void {
  if (!overlayActive) return
  overlayActive = false
  if (overlayAutoHideTimer) {
    clearTimeout(overlayAutoHideTimer)
    overlayAutoHideTimer = null
  }
  sendToOverlay('toggle-recording', { active: false })
  hideOverlay()
  log.info('Overlay: sesión finalizada')
}

function toggleOverlay(): void {
  if (overlayActive) stopOverlaySession()
  else startOverlaySession()
}

app.on('second-instance', () => {
  // Re-abrir Settings cuando el usuario hace click en el ícono otra vez.
  createMainWindow()
})

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.joinsclee.cleevoice')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // En macOS escondemos el dock: CleeVoice vive en la menubar, no es una app "de ventana".
  if (process.platform === 'darwin') {
    app.dock?.hide()
  }

  // Pre-creamos la ventana del overlay para que el primer disparo del hotkey sea instantáneo.
  // Quedará oculta hasta que showOverlay la traiga al frente.
  getOrCreateOverlay()

  setupTray({
    onOpenSettings: () => createMainWindow(),
    onToggleRecording: toggleOverlay,
    onQuit: () => {
      log.info('Quit desde tray menu')
      unregisterAll()
      destroyTray()
      app.quit()
    }
  })

  const result = registerToggleHotkey(DEFAULT_HOTKEY, toggleOverlay)
  if (!result.registered) {
    log.error(`Hotkey ${DEFAULT_HOTKEY} no se pudo registrar: ${result.reason}`)
  }

  // En Fase 0 abríamos la ventana de Settings al iniciar para verificar el setup.
  // Desde Fase 1 la app es "tray-only" — no abre ninguna ventana al arrancar.
  // El usuario abre Settings desde el menú del tray.

  app.on('activate', () => {
    // En macOS: click en el dock vuelve a abrir Settings (aunque el dock esté oculto, esto
    // se dispara cuando se lanza la app de nuevo desde Spotlight, por ejemplo).
    if (BrowserWindow.getAllWindows().every((w) => !w.isVisible())) {
      createMainWindow()
    }
  })
})

// Cerrar todas las ventanas NO cierra la app — CleeVoice vive en el tray.
// Con un handler suscrito a este evento (aunque sea vacío), Electron suprime el quit
// automático. El usuario sale explícitamente desde el menú del tray.
app.on('window-all-closed', () => {
  log.debug('window-all-closed: la app sigue viva en el tray')
})

app.on('will-quit', () => {
  unregisterAll()
})
