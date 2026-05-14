import { useState, useRef, useEffect } from 'react'
import type { CleeVoiceSettings } from '../../../preload/index'
import { Field } from './ui'

interface Props {
  settings: CleeVoiceSettings
  patch: (diff: Partial<CleeVoiceSettings>) => Promise<void>
}

const PRESETS: { label: string; value: string }[] = [
  { label: '⌘/Ctrl + Shift + Espacio', value: 'CommandOrControl+Shift+Space' },
  { label: '⌘/Ctrl + Opt + D', value: 'CommandOrControl+Alt+D' },
  { label: '⌥ + Espacio', value: 'Alt+Space' },
  { label: 'F12', value: 'F12' }
]

/**
 * Captura una combinación de teclas y la devuelve en el formato accelerator
 * de Electron. Reglas: tiene que tener al menos un modifier (Cmd/Ctrl/Alt/Shift)
 * + una tecla "base" (letra, número, F-key, Space, etc.).
 */
function eventToAccelerator(e: KeyboardEvent): string | null {
  const modifiers: string[] = []
  if (e.metaKey) modifiers.push('Command')
  if (e.ctrlKey) modifiers.push('Control')
  if (e.altKey) modifiers.push('Alt')
  if (e.shiftKey) modifiers.push('Shift')

  // Si los dos modificadores Command/Control están, simplificamos a CommandOrControl.
  let mods = modifiers
  if (modifiers.includes('Command') && modifiers.includes('Control')) {
    mods = ['CommandOrControl', ...modifiers.filter((m) => m !== 'Command' && m !== 'Control')]
  } else if (modifiers.includes('Command')) {
    mods = ['CommandOrControl', ...modifiers.filter((m) => m !== 'Command')]
  } else if (modifiers.includes('Control')) {
    mods = ['CommandOrControl', ...modifiers.filter((m) => m !== 'Control')]
  }

  const key = normalizeKey(e.key, e.code)
  if (!key) return null
  if (mods.length === 0 && !/^F\d+$/.test(key)) return null
  return [...mods, key].join('+')
}

function normalizeKey(key: string, code: string): string | null {
  if (key === ' ' || code === 'Space') return 'Space'
  if (key === 'Escape' || key === 'Tab' || key === 'Enter') return key
  if (/^F\d+$/.test(key)) return key
  if (key.length === 1) return key.toUpperCase()
  // ArrowUp, ArrowDown, etc.
  if (key.startsWith('Arrow')) return key.replace('Arrow', '')
  // Modificadores solos no valen
  if (['Meta', 'Control', 'Alt', 'Shift'].includes(key)) return null
  return null
}

function prettyAccel(accel: string): string {
  return accel
    .replace('CommandOrControl', '⌘/Ctrl')
    .replace('Command', '⌘')
    .replace('Control', 'Ctrl')
    .replace('Shift', '⇧')
    .replace('Alt', '⌥')
    .replace('Option', '⌥')
    .replace(/\+/g, ' + ')
    .replace('Space', 'Espacio')
}

export function HotkeyTab({ settings, patch }: Props): React.JSX.Element {
  const [recording, setRecording] = useState(false)
  const [pending, setPending] = useState<string | null>(null)
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!recording) return
    function onKey(e: KeyboardEvent): void {
      e.preventDefault()
      e.stopPropagation()
      const accel = eventToAccelerator(e)
      if (accel) setPending(accel)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [recording])

  async function save(): Promise<void> {
    if (!pending) return
    await patch({ hotkey: pending })
    setPending(null)
    setRecording(false)
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Field
        label="Atajo global"
        hint="Esta combinación dispara el dictado estando en cualquier app. Tiene que incluir al menos un modificador (Cmd/Ctrl/Alt/Shift) o ser una tecla F."
      >
        <div className="flex items-center gap-3">
          <div
            ref={boxRef}
            className={
              'flex min-h-[44px] flex-1 items-center rounded-md border px-4 py-2 text-sm transition-colors ' +
              (recording
                ? 'border-violet-500 bg-violet-500/[0.08] text-white'
                : 'border-white/10 bg-neutral-900 text-neutral-100')
            }
          >
            <span className="font-mono">
              {prettyAccel(pending ?? settings.hotkey)}
            </span>
            {recording && (
              <span className="ml-3 text-xs text-violet-300">
                Presioná la combinación que querés usar…
              </span>
            )}
          </div>
          {!recording ? (
            <button
              type="button"
              onClick={() => {
                setRecording(true)
                setPending(null)
              }}
              className="rounded-md border border-white/10 px-3 py-2 text-sm text-neutral-200 hover:border-white/20"
            >
              Cambiar
            </button>
          ) : (
            <>
              <button
                type="button"
                disabled={!pending}
                onClick={() => void save()}
                className="rounded-md bg-violet-500 px-3 py-2 text-sm font-medium text-white disabled:opacity-50 hover:bg-violet-400"
              >
                Guardar
              </button>
              <button
                type="button"
                onClick={() => {
                  setRecording(false)
                  setPending(null)
                }}
                className="rounded-md border border-white/10 px-3 py-2 text-sm text-neutral-300 hover:border-white/20"
              >
                Cancelar
              </button>
            </>
          )}
        </div>
      </Field>

      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-500">
          Presets sugeridos
        </p>
        <div className="grid grid-cols-2 gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.value}
              type="button"
              onClick={() => void patch({ hotkey: p.value })}
              className={
                'rounded-md border px-3 py-2 text-left text-sm transition-colors ' +
                (settings.hotkey === p.value
                  ? 'border-violet-500 bg-violet-500/[0.08] text-white'
                  : 'border-white/10 bg-white/[0.02] text-neutral-200 hover:border-white/20')
              }
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-md border border-white/5 bg-white/[0.02] p-4 text-xs text-neutral-400">
        Si tu nueva combinación choca con otra app, CleeVoice automáticamente vuelve al atajo
        anterior y te notifica.
      </div>
    </div>
  )
}
