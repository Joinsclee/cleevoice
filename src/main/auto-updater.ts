import { app, Notification, dialog, shell } from 'electron'
import { autoUpdater } from 'electron-updater'
import log from 'electron-log/main'

/**
 * Auto-updater de CleeVoice.
 *
 * Backend: GitHub Releases (config en electron-builder.yml > publish).
 *
 * Estrategia diferenciada por plataforma:
 *
 *  Windows (NSIS) + Mac firmado con Developer ID:
 *    1) Check al boot + cada 4h
 *    2) Descarga silenciosa en background
 *    3) "Instalar ahora / Más tarde" en diálogo
 *    4) quitAndInstall → restart con la nueva versión
 *
 *  Mac SIN firma (distribución interna actual):
 *    quitAndInstall no funciona sin Developer ID — macOS rechaza aplicar
 *    el update porque no puede verificar la firma del nuevo bundle vs el
 *    actual. Como fallback:
 *    1) Detectamos que hay update disponible (sin auto-descargar el zip
 *       de 130MB que no podríamos aplicar)
 *    2) Notificamos al usuario con la versión nueva
 *    3) En el diálogo ofrecemos "Descargar e instalar" → abre el DMG
 *       directamente con shell.openExternal. El usuario hace
 *       drag-to-Applications igual que la primera vez.
 *
 *  Toggle entre los dos: detectamos firma con app.isPackaged + nuestro
 *  flag de build (asumimos no-firma en mac por ahora).
 */

const FOUR_HOURS_MS = 4 * 60 * 60 * 1000
const INITIAL_DELAY_MS = 5_000

let initialized = false
let pendingUpdate: { version: string; downloadUrl?: string } | null = null
let lastManualCheckAt = 0

/** Mac builds sin firma Developer ID no pueden auto-instalar. */
const MAC_UNSIGNED = process.platform === 'darwin'

export function setupAutoUpdater(): void {
  if (!app.isPackaged) {
    log.info('Auto-updater deshabilitado en dev (app.isPackaged=false)')
    return
  }
  if (initialized) return
  initialized = true

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  autoUpdater.logger = log as any
  // En Mac sin firma NO bajamos el zip — no podemos aplicarlo. Solo verificamos.
  autoUpdater.autoDownload = !MAC_UNSIGNED
  autoUpdater.autoInstallOnAppQuit = !MAC_UNSIGNED
  autoUpdater.allowDowngrade = false

  autoUpdater.on('checking-for-update', () => {
    log.info('Updater: chequeando releases…')
  })

  autoUpdater.on('update-available', (info) => {
    log.info(`Updater: hay update ${info.version} (actual ${app.getVersion()})`)
    pendingUpdate = {
      version: info.version,
      downloadUrl: buildDmgDownloadUrl(info.version)
    }

    // En Mac sin firma, ofrecemos descarga manual del DMG en el momento.
    if (MAC_UNSIGNED) {
      const recent = Date.now() - lastManualCheckAt < 30_000
      // Si el usuario acaba de pedir manual check, mostrar diálogo modal;
      // si fue check automático en background, solo notificación.
      if (recent) void promptManualDownload(info.version)
      else notifyUpdateAvailableMac(info.version)
    }
  })

  autoUpdater.on('update-not-available', () => {
    log.info('Updater: estás en la última versión')
  })

  autoUpdater.on('download-progress', (progress) => {
    log.info(
      `Updater: descargando ${progress.percent.toFixed(1)}% ` +
        `(${(progress.bytesPerSecond / 1024 / 1024).toFixed(2)} MB/s)`
    )
  })

  autoUpdater.on('update-downloaded', (info) => {
    log.info(`Updater: ${info.version} descargado, listo para instalar`)
    pendingUpdate = { version: info.version }
    // Mac sin firma nunca llega acá (autoDownload=false).
    notifyUpdateReady(info.version)
  })

  autoUpdater.on('error', (err) => {
    log.warn(`Updater error: ${err.message}`)
  })

  setTimeout(() => void runCheck('boot'), INITIAL_DELAY_MS)
  setInterval(() => void runCheck('periodic'), FOUR_HOURS_MS)
}

async function runCheck(reason: 'boot' | 'periodic' | 'manual'): Promise<void> {
  try {
    log.debug(`Updater: trigger=${reason}`)
    await autoUpdater.checkForUpdates()
  } catch (err) {
    log.warn(`Updater check (${reason}) falló:`, err)
  }
}

/** Construye el link de descarga directa del DMG para la versión X.Y.Z. */
function buildDmgDownloadUrl(version: string): string {
  // Mismo patrón de naming que dmg.artifactName en electron-builder.yml.
  return `https://github.com/Joinsclee/cleevoice/releases/download/v${version}/CleeVoice-${version}-arm64.dmg`
}

function notifyUpdateAvailableMac(version: string): void {
  if (!Notification.isSupported()) return
  const n = new Notification({
    title: 'CleeVoice — actualización disponible',
    body: `v${version} lista. Click acá para descargarla.`
  })
  n.on('click', () => void promptManualDownload(version))
  n.show()
}

async function promptManualDownload(version: string): Promise<void> {
  const url = buildDmgDownloadUrl(version)
  const { response } = await dialog.showMessageBox({
    type: 'info',
    title: 'CleeVoice — nueva versión disponible',
    message: `v${version} está lista para instalarse.`,
    detail:
      'En macOS sin firma de Apple Developer ID no podemos aplicar el update ' +
      'automáticamente. Te abrimos la descarga del nuevo DMG y vos arrastrás ' +
      `CleeVoice a Aplicaciones reemplazando la anterior (te lleva 30 segundos).\n\nVersión actual: ${app.getVersion()}\nNueva versión: ${version}`,
    buttons: ['Descargar DMG', 'Ver release en GitHub', 'Más tarde'],
    defaultId: 0,
    cancelId: 2
  })

  if (response === 0) {
    log.info(`Updater: usuario eligió descargar v${version}`)
    void shell.openExternal(url)
  } else if (response === 1) {
    log.info(`Updater: usuario abrió el release page de v${version}`)
    void shell.openExternal(`https://github.com/Joinsclee/cleevoice/releases/tag/v${version}`)
  } else {
    log.info(`Updater: usuario pospuso v${version}`)
  }
}

function notifyUpdateReady(version: string): void {
  // Path Windows / Mac firmado: el update ya está descargado y listo.
  if (Notification.isSupported()) {
    new Notification({
      title: 'CleeVoice — actualización lista',
      body: `v${version} descargada. Click para instalar ahora.`
    })
      .on('click', () => void promptInstall(version))
      .show()
  }
  void promptInstall(version)
}

async function promptInstall(version: string): Promise<void> {
  const { response } = await dialog.showMessageBox({
    type: 'info',
    title: 'CleeVoice — actualización disponible',
    message: `La versión ${version} está lista para instalarse.`,
    detail:
      'CleeVoice se va a cerrar y reabrir solo con la nueva versión. ' +
      'Si preferís posponerlo, se aplica automáticamente cuando cerres la app.',
    buttons: ['Instalar ahora', 'Más tarde'],
    defaultId: 0,
    cancelId: 1
  })

  if (response === 0) {
    log.info(`Updater: instalando ${version} ahora`)
    setImmediate(() => autoUpdater.quitAndInstall(false, true))
  } else {
    log.info(`Updater: usuario pospuso instalación de ${version}`)
  }
}

/**
 * Llamado desde el menú "Buscar actualizaciones…" del tray.
 * Da feedback inmediato (notificación + diálogo final) para que el usuario
 * sepa que algo está pasando.
 */
export async function manualCheck(): Promise<void> {
  lastManualCheckAt = Date.now()

  // Feedback inmediato.
  if (Notification.isSupported()) {
    new Notification({
      title: 'CleeVoice',
      body: 'Buscando actualizaciones…',
      silent: true
    }).show()
  }

  // Si ya tenemos una pendiente cacheada del último check automático, usarla
  // (es muy probable que el usuario haya clickeado por una notif previa).
  if (pendingUpdate) {
    if (MAC_UNSIGNED) {
      await promptManualDownload(pendingUpdate.version)
    } else {
      await promptInstall(pendingUpdate.version)
    }
    return
  }

  try {
    const result = await autoUpdater.checkForUpdates()
    // En Mac sin firma, autoDownload=false: si hay update, el handler
    // update-available ya disparó el diálogo (lastManualCheckAt < 30s).
    // Si no hubo update, mostramos un OK explícito.
    if (!pendingUpdate) {
      log.info(`Manual check: sin novedades (result=${JSON.stringify(result?.updateInfo?.version)})`)
      if (Notification.isSupported()) {
        new Notification({
          title: 'CleeVoice está al día',
          body: `Versión ${app.getVersion()} es la última disponible.`
        }).show()
      }
    }
  } catch (err) {
    log.error('Manual check falló:', err)
    if (Notification.isSupported()) {
      new Notification({
        title: 'No se pudo buscar actualizaciones',
        body: 'Revisá tu conexión a internet. Detalles en los logs.'
      }).show()
    }
  }
}

/** Abre la página de releases. */
export function openReleasesPage(): void {
  void shell.openExternal('https://github.com/Joinsclee/cleevoice/releases')
}
