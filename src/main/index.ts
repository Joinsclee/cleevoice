import { app, BrowserWindow, shell } from 'electron'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { join } from 'path'
import log from 'electron-log/main'

// Configuramos electron-log como sustituto de console.* desde Fase 0 (regla del proyecto).
log.initialize()
log.transports.file.level = 'info'
log.transports.console.level = 'debug'
log.info('CleeVoice main process boot')

/**
 * Single-instance lock: solo una CleeVoice corriendo a la vez.
 * Si el usuario re-abre la app desde el Finder o el Start Menu, en vez de levantar
 * una segunda instancia, traemos al frente la ventana principal existente.
 */
const gotSingleInstanceLock = app.requestSingleInstanceLock()
if (!gotSingleInstanceLock) {
  log.warn('Otra instancia de CleeVoice ya está corriendo. Saliendo.')
  app.quit()
}

let mainWindow: BrowserWindow | null = null

function createMainWindow(): void {
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

  // electron-vite expone ELECTRON_RENDERER_URL solo en dev; en prod cargamos el HTML buildeado.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  } else {
    createMainWindow()
  }
})

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.joinsclee.cleevoice')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  createMainWindow()

  app.on('activate', () => {
    // En macOS recrear la ventana al hacer click en el dock si no hay ventanas abiertas.
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
  })
})

// Política de cierre:
// En Fase 0 cerramos la app al cerrar todas las ventanas (comportamiento esperado durante setup).
// En Fase 1 (tray) cambiaremos esto para que la app sobreviva en la bandeja.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
