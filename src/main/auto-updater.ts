import { app, Notification, dialog, shell } from 'electron'
import { autoUpdater } from 'electron-updater'
import log from 'electron-log/main'

/**
 * Auto-updater de CleeVoice (Fase 9.5).
 *
 * Backend: GitHub Releases (config en electron-builder.yml > publish).
 * Estrategia:
 *   - Check al arranque (después de 5s para no competir con la UI inicial).
 *   - Check periódico cada 4 horas mientras la app esté abierta.
 *   - Si hay update: descarga en background SILENCIOSAMENTE.
 *   - Cuando termina la descarga: notificación nativa + diálogo "instalar
 *     ahora / al cerrar la app". Si elige "ahora", restart con el update.
 *
 * En desarrollo (no empaquetado) el updater está deshabilitado — `app.isPackaged`
 * lo skip-ea para que no rompa el dev flow.
 *
 * Notas:
 *  - Para repos PRIVADOS: electron-updater usa GH_TOKEN del entorno. En el
 *    distributable lo embebemos vía `app-update.yml` (lo hace electron-builder
 *    automáticamente si está set al momento del build), o via env var en runtime.
 *  - Para repos PÚBLICOS: nada extra — pega directo a la API pública de GitHub.
 */

const FOUR_HOURS_MS = 4 * 60 * 60 * 1000
const INITIAL_DELAY_MS = 5_000

let initialized = false
let pendingUpdateVersion: string | null = null

export function setupAutoUpdater(): void {
  if (!app.isPackaged) {
    log.info('Auto-updater deshabilitado en dev (app.isPackaged=false)')
    return
  }
  if (initialized) return
  initialized = true

  // Reutilizamos electron-log para el output del updater — todo va al main.log.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  autoUpdater.logger = log as any
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  // Sin firma Developer ID no podemos hacer hot-restart en macOS — caemos a
  // "install on next quit" automáticamente. Lo señalamos en el diálogo.
  autoUpdater.allowDowngrade = false

  autoUpdater.on('checking-for-update', () => {
    log.info('Updater: chequeando…')
  })

  autoUpdater.on('update-available', (info) => {
    log.info(`Updater: hay update ${info.version} (current ${app.getVersion()})`)
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
    log.info(`Updater: ${info.version} descargado y listo`)
    pendingUpdateVersion = info.version
    notifyUpdateReady(info.version)
  })

  autoUpdater.on('error', (err) => {
    // No molestamos al usuario con errores transitorios (red caída, GitHub 503).
    // Si necesitamos visibilidad: en Settings podríamos exponer last-check + error.
    log.warn(`Updater error: ${err.message}`)
  })

  // Primer check tras un pequeño delay para no robar atención al boot.
  setTimeout(() => {
    void runCheck('boot')
  }, INITIAL_DELAY_MS)

  // Check periódico mientras la app sigue abierta.
  setInterval(() => {
    void runCheck('periodic')
  }, FOUR_HOURS_MS)
}

async function runCheck(reason: 'boot' | 'periodic' | 'manual'): Promise<void> {
  try {
    log.debug(`Updater: trigger=${reason}`)
    await autoUpdater.checkForUpdates()
  } catch (err) {
    log.warn(`Updater check (${reason}) falló:`, err)
  }
}

function notifyUpdateReady(version: string): void {
  if (Notification.isSupported()) {
    new Notification({
      title: 'CleeVoice — actualización lista',
      body: `v${version} descargada. Click para instalar ahora o se aplica al cerrar.`
    })
      .on('click', () => {
        void promptInstall(version)
      })
      .show()
  }
  // Si no hay sistema de notif, igual disparamos el prompt directamente.
  void promptInstall(version)
}

async function promptInstall(version: string): Promise<void> {
  const { response } = await dialog.showMessageBox({
    type: 'info',
    title: 'CleeVoice — actualización disponible',
    message: `La versión ${version} está lista para instalarse.`,
    detail:
      'CleeVoice se va a cerrar y reabrir solo. Todas las grabaciones en curso se cancelarán.\n\n' +
      'Si preferís, podés posponerlo: la actualización se aplicará automáticamente cuando salgas de la app.',
    buttons: ['Instalar ahora', 'Más tarde'],
    defaultId: 0,
    cancelId: 1
  })

  if (response === 0) {
    log.info(`Updater: usuario eligió instalar ${version} ahora`)
    setImmediate(() => autoUpdater.quitAndInstall(false, true))
  } else {
    log.info(`Updater: usuario pospuso instalación de ${version}`)
  }
}

/**
 * Para usar desde el menú del tray ("Buscar actualizaciones…").
 * Si ya hay un update descargado, abre el diálogo para instalar.
 */
export function manualCheck(): void {
  if (pendingUpdateVersion) {
    void promptInstall(pendingUpdateVersion)
    return
  }
  void runCheck('manual').then(() => {
    if (!pendingUpdateVersion) {
      new Notification({
        title: 'CleeVoice está al día',
        body: `Versión ${app.getVersion()} es la última disponible.`
      }).show()
    }
  })
}

/** Abre la página de releases de GitHub en el browser por si el user quiere ver el changelog. */
export function openReleasesPage(): void {
  void shell.openExternal('https://github.com/Joinsclee/cleevoice/releases')
}
