import { app, Menu, Tray, nativeImage } from 'electron'
import path from 'node:path'
import log from 'electron-log/main'

/**
 * Tray icon de CleeVoice.
 *
 * En Fase 1 usamos un PNG raster (no SVG) porque nativeImage en macOS no
 * renderiza data-URLs de SVG: lo deja como imagen vacía y el ícono queda
 * invisible en la menubar. Los PNG se generan con `node scripts/generate-tray-icon.mjs`
 * y viven en `resources/icons/`.
 *
 * El sufijo "Template" es convención macOS — Electron auto-aplica
 * template-image (negro+alfa que se invierte en dark mode). El @2x se
 * carga automáticamente para pantallas retina.
 *
 * Fase 9 reemplazará esto por el ícono oficial JoinsClee.
 */

let trayInstance: Tray | null = null

function getTrayIconPath(): string {
  // En prod (empaquetado) los íconos van a Contents/Resources/icons via
  // electron-builder.yml > extraResources. En dev, leemos directo del repo.
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'icons/trayTemplate.png')
  }
  return path.join(app.getAppPath(), 'resources/icons/trayTemplate.png')
}

export interface TrayHandlers {
  onOpenSettings: () => void
  onToggleRecording: () => void
  onCheckForUpdates: () => void | Promise<void>
  onOpenReleases: () => void
  onQuit: () => void
}

export function setupTray(handlers: TrayHandlers): Tray {
  if (trayInstance) return trayInstance

  const iconPath = getTrayIconPath()
  const icon = nativeImage.createFromPath(iconPath)

  if (icon.isEmpty()) {
    log.error(`Tray icon vacío. Path intentado: ${iconPath}`)
  } else {
    log.info(`Tray icon cargado desde ${iconPath} (${icon.getSize().width}x${icon.getSize().height})`)
  }

  // En macOS marcamos como template para auto-inversión en dark/light mode.
  if (process.platform === 'darwin') icon.setTemplateImage(true)

  trayInstance = new Tray(icon)
  trayInstance.setToolTip('CleeVoice — Dictado por voz')

  // Click izquierdo en el ícono = abrir Settings.
  // El usuario espera ver una ventana al clickear el ícono — no que empiece a grabar.
  // Para dictar usá el hotkey global (Cmd+Shift+Espacio) o el ítem
  // "Iniciar / detener dictado" del menú contextual (click derecho).
  trayInstance.on('click', () => handlers.onOpenSettings())

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
    { label: 'Buscar actualizaciones…', click: () => handlers.onCheckForUpdates() },
    { label: 'Ver releases en GitHub', click: () => handlers.onOpenReleases() },
    { type: 'separator' },
    { label: 'Salir CleeVoice', click: () => handlers.onQuit() }
  ])
  trayInstance.setContextMenu(contextMenu)
}

export function destroyTray(): void {
  trayInstance?.destroy()
  trayInstance = null
}
