import {
  clipboard,
  Notification,
  shell,
  systemPreferences,
  type NativeImage
} from 'electron'
import { spawn } from 'node:child_process'
import log from 'electron-log/main'

/**
 * Inyección de texto donde está el cursor del usuario (Fase 4).
 *
 * Estrategia universal:
 *   1) Guardamos el clipboard previo (texto + posibles imágenes).
 *   2) Copiamos el texto nuevo al clipboard.
 *   3) Simulamos `Cmd/Ctrl+V` en la app activa.
 *   4) Tras 1s restauramos el clipboard previo (buen UX — no le borramos
 *      al usuario lo que tenía copiado).
 *
 * Mac: AppleScript via `osascript`. Requiere permiso de accesibilidad
 *      (la primera vez macOS lo pide). Si no se concede, hacemos fallback
 *      a notificación con texto ya en el portapapeles.
 *
 * Win: nut-js (Fase 9). En esta plataforma el paste sintético no requiere
 *      permisos especiales.
 */

const CLIPBOARD_RESTORE_DELAY_MS = 1000

export interface PasteResult {
  pasted: boolean
  reason?: 'no-accessibility' | 'applescript-error' | 'unsupported-platform'
}

/**
 * Verifica si la app actual (Electron en dev, CleeVoice en prod) está marcada
 * como trusted accessibility client en macOS. `false` no pide el prompt;
 * `true` lo dispara la primera vez.
 */
export function hasAccessibilityPermission(): boolean {
  if (process.platform !== 'darwin') return true
  return systemPreferences.isTrustedAccessibilityClient(false)
}

/** Abre el panel de Privacidad → Accesibilidad del System Settings. */
export function openAccessibilitySettings(): void {
  if (process.platform !== 'darwin') return
  // Deep-link al pane específico (Sonoma+ acepta esta URI).
  void shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility')
}

/**
 * Pega `text` donde esté el cursor. Si no se pudo simular el Cmd+V (sin
 * permiso o error de AppleScript), deja el texto en el clipboard y muestra
 * una notificación para que el usuario pegue manual.
 */
export async function pasteText(text: string): Promise<PasteResult> {
  if (!text.trim()) {
    log.warn('pasteText llamado con texto vacío — skip')
    return { pasted: false, reason: 'applescript-error' }
  }

  const previousText = clipboard.readText()
  const previousImage = readClipboardImageSafe()

  clipboard.writeText(text)

  // Le damos un instante al pasteboard para que la app activa lo "vea".
  await delay(60)

  if (process.platform === 'darwin') {
    if (!hasAccessibilityPermission()) {
      log.warn('Sin permiso de accesibilidad — fallback a notificación.')
      notifyFallback(text)
      scheduleClipboardRestore(previousText, previousImage)
      // Disparamos el prompt: la próxima vez ya estará permitido.
      systemPreferences.isTrustedAccessibilityClient(true)
      return { pasted: false, reason: 'no-accessibility' }
    }

    try {
      await runAppleScriptPaste()
      scheduleClipboardRestore(previousText, previousImage)
      return { pasted: true }
    } catch (err) {
      log.error('AppleScript paste falló', err)
      notifyFallback(text)
      scheduleClipboardRestore(previousText, previousImage)
      return { pasted: false, reason: 'applescript-error' }
    }
  }

  if (process.platform === 'win32') {
    // Fase 9 reemplaza este branch por nut-js.
    log.warn('Paste automático en Windows aún no implementado — fallback a notificación.')
    notifyFallback(text)
    scheduleClipboardRestore(previousText, previousImage)
    return { pasted: false, reason: 'unsupported-platform' }
  }

  // Linux y otros: por ahora sólo dejamos en el portapapeles.
  notifyFallback(text)
  scheduleClipboardRestore(previousText, previousImage)
  return { pasted: false, reason: 'unsupported-platform' }
}

function readClipboardImageSafe(): NativeImage | null {
  try {
    const img = clipboard.readImage()
    return img.isEmpty() ? null : img
  } catch {
    return null
  }
}

function scheduleClipboardRestore(previousText: string, previousImage: NativeImage | null): void {
  setTimeout(() => {
    try {
      if (previousImage) {
        clipboard.writeImage(previousImage)
      } else {
        clipboard.writeText(previousText)
      }
    } catch (err) {
      log.warn('No se pudo restaurar el clipboard previo', err)
    }
  }, CLIPBOARD_RESTORE_DELAY_MS)
}

function notifyFallback(text: string): void {
  if (!Notification.isSupported()) return
  const preview = text.length > 80 ? text.slice(0, 77) + '…' : text
  new Notification({
    title: 'CleeVoice — Texto copiado al portapapeles',
    body: `Presioná Cmd+V para pegar.\n"${preview}"`,
    silent: false
  }).show()
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

/**
 * Ejecuta el AppleScript que envía Cmd+V al elemento con foco.
 * Lo corremos vía spawn (no exec) para no inyectar el texto del usuario en
 * la línea de comandos: el script es estático y no recibe argumentos.
 */
function runAppleScriptPaste(): Promise<void> {
  const script = 'tell application "System Events" to keystroke "v" using command down'
  return new Promise((resolve, reject) => {
    const proc = spawn('/usr/bin/osascript', ['-e', script], {
      stdio: ['ignore', 'pipe', 'pipe']
    })
    let stderr = ''
    proc.stderr.on('data', (chunk) => (stderr += chunk.toString()))
    proc.on('error', (err) => reject(err))
    proc.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`osascript exit code=${code}\nstderr: ${stderr}`))
    })
  })
}
