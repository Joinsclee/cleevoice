import { app, Menu, Tray, nativeImage, type NativeImage } from 'electron'
import log from 'electron-log/main'

/**
 * Tray icon de CleeVoice.
 *
 * En Fase 1 generamos el ícono programáticamente con SVG → PNG vía nativeImage,
 * para evitar empaquetar binarios antes de tiempo. En Fase 9 lo reemplazaremos
 * por el ícono oficial de la marca JoinsClee.
 *
 * Mac:  template image (negro + alfa) para adaptarse a dark/light de la menubar.
 * Win:  un PNG color de 16x16.
 */

let trayInstance: Tray | null = null

function buildTrayIcon(): NativeImage {
  // Template image monocromática: silueta de micrófono.
  // Se renderiza negro+alfa; macOS la invierte automáticamente en dark mode.
  const macSvg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16">
      <path fill="#000000" d="M8 1.5a2.5 2.5 0 0 0-2.5 2.5v3.5a2.5 2.5 0 0 0 5 0V4A2.5 2.5 0 0 0 8 1.5Zm-4.5 5.75a.75.75 0 0 1 1.5 0 3 3 0 0 0 6 0 .75.75 0 0 1 1.5 0 4.5 4.5 0 0 1-3.75 4.43V13.5h2a.75.75 0 0 1 0 1.5h-5.5a.75.75 0 0 1 0-1.5h2v-1.82A4.5 4.5 0 0 1 3.5 7.25Z"/>
    </svg>`
  const winSvg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16">
      <path fill="#7c3aed" d="M8 1.5a2.5 2.5 0 0 0-2.5 2.5v3.5a2.5 2.5 0 0 0 5 0V4A2.5 2.5 0 0 0 8 1.5Zm-4.5 5.75a.75.75 0 0 1 1.5 0 3 3 0 0 0 6 0 .75.75 0 0 1 1.5 0 4.5 4.5 0 0 1-3.75 4.43V13.5h2a.75.75 0 0 1 0 1.5h-5.5a.75.75 0 0 1 0-1.5h2v-1.82A4.5 4.5 0 0 1 3.5 7.25Z"/>
    </svg>`
  const svg = process.platform === 'darwin' ? macSvg : winSvg
  const img = nativeImage.createFromDataURL(
    `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`
  )
  // En macOS marcamos como template para auto-inversión negro/blanco.
  if (process.platform === 'darwin') img.setTemplateImage(true)
  return img
}

export interface TrayHandlers {
  onOpenSettings: () => void
  onToggleRecording: () => void
  onQuit: () => void
}

export function setupTray(handlers: TrayHandlers): Tray {
  if (trayInstance) return trayInstance

  const icon = buildTrayIcon()
  trayInstance = new Tray(icon)
  trayInstance.setToolTip('CleeVoice — Dictado por voz')

  rebuildMenu(handlers)
  log.info('Tray icon creado')
  return trayInstance
}

export function rebuildMenu(handlers: TrayHandlers, engineLabel = 'Local'): void {
  if (!trayInstance) return
  const contextMenu = Menu.buildFromTemplate([
    { label: `CleeVoice v${app.getVersion()}`, enabled: false },
    { label: `Engine: ${engineLabel}`, enabled: false },
    { type: 'separator' },
    { label: 'Iniciar / detener dictado', click: () => handlers.onToggleRecording() },
    { label: 'Abrir Settings', click: () => handlers.onOpenSettings() },
    { type: 'separator' },
    { label: 'Salir CleeVoice', click: () => handlers.onQuit() }
  ])
  trayInstance.setContextMenu(contextMenu)
}

export function destroyTray(): void {
  trayInstance?.destroy()
  trayInstance = null
}
