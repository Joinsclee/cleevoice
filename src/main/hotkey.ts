import { globalShortcut } from 'electron'
import log from 'electron-log/main'

/**
 * Atajos globales (Fase 1 — Modo A: toggle).
 *
 * Limitación conocida: `globalShortcut` sólo dispara en keydown, no detecta keyup.
 * Buena para toggle (presionar=start, presionar de nuevo=stop), no apta para
 * push-to-talk verdadero. La migración a `node-global-key-listener` (Modo B)
 * está prevista en Fase 5+ si el feedback lo pide.
 */

export const DEFAULT_HOTKEY = 'CommandOrControl+Shift+Space'

let currentAccelerator: string | null = null

export interface HotkeyResult {
  registered: boolean
  accelerator: string
  reason?: string
}

export function registerToggleHotkey(
  accelerator: string,
  onToggle: () => void
): HotkeyResult {
  unregisterCurrent()

  try {
    const ok = globalShortcut.register(accelerator, () => {
      log.debug(`Hotkey disparado: ${accelerator}`)
      onToggle()
    })
    if (!ok) {
      log.warn(`No se pudo registrar el hotkey ${accelerator} (posible colisión).`)
      return { registered: false, accelerator, reason: 'collision' }
    }
    currentAccelerator = accelerator
    log.info(`Hotkey registrado: ${accelerator}`)
    return { registered: true, accelerator }
  } catch (err) {
    log.error('Error registrando hotkey', err)
    return { registered: false, accelerator, reason: String(err) }
  }
}

export function unregisterCurrent(): void {
  if (currentAccelerator) {
    globalShortcut.unregister(currentAccelerator)
    currentAccelerator = null
  }
}

export function unregisterAll(): void {
  globalShortcut.unregisterAll()
  currentAccelerator = null
}
