import { BrowserWindow, screen } from 'electron'
import { is } from '@electron-toolkit/utils'
import { join } from 'path'
import log from 'electron-log/main'

/**
 * Ventana flotante "🎤 Escuchando".
 *
 * Características clave (ver ARCHITECTURE.md sección "Overlay window"):
 *  - frame: false, transparent: true, alwaysOnTop: true, skipTaskbar: true
 *  - 280x100, centrada horizontal, 80px desde el borde inferior de la pantalla
 *  - NO focusable: no roba foco al teclear en otra app
 *  - Se crea una sola vez y se reusa (show/hide), no se destruye en cada disparo
 */

const OVERLAY_WIDTH = 280
const OVERLAY_HEIGHT = 100
const OVERLAY_MARGIN_BOTTOM = 80

let overlayWin: BrowserWindow | null = null

export function getOrCreateOverlay(): BrowserWindow {
  if (overlayWin && !overlayWin.isDestroyed()) return overlayWin

  const primary = screen.getPrimaryDisplay()
  const { workArea } = primary
  const x = Math.round(workArea.x + (workArea.width - OVERLAY_WIDTH) / 2)
  const y = Math.round(workArea.y + workArea.height - OVERLAY_HEIGHT - OVERLAY_MARGIN_BOTTOM)

  overlayWin = new BrowserWindow({
    width: OVERLAY_WIDTH,
    height: OVERLAY_HEIGHT,
    x,
    y,
    show: false,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    focusable: false,
    hasShadow: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  overlayWin.setAlwaysOnTop(true, 'screen-saver')
  overlayWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  overlayWin.setIgnoreMouseEvents(true)

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    // En dev, electron-vite sirve overlay.html como subruta del mismo servidor.
    overlayWin.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/overlay.html`)
  } else {
    overlayWin.loadFile(join(__dirname, '../renderer/overlay.html'))
  }

  overlayWin.on('closed', () => {
    overlayWin = null
  })

  log.info('Overlay window creada')
  return overlayWin
}

export function showOverlay(): void {
  const win = getOrCreateOverlay()
  if (!win.isVisible()) {
    win.showInactive() // sin robar foco
  }
}

export function hideOverlay(): void {
  if (overlayWin && !overlayWin.isDestroyed() && overlayWin.isVisible()) {
    overlayWin.hide()
  }
}

export function sendToOverlay(channel: string, ...args: unknown[]): void {
  if (overlayWin && !overlayWin.isDestroyed()) {
    overlayWin.webContents.send(channel, ...args)
  }
}
