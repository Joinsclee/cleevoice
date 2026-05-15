import { useEffect, useState } from 'react'
import type { CleeVoiceSettings, ModelInfo } from '../../preload/index'
import { GeneralTab } from './settings-tabs/GeneralTab'
import { ModelTab } from './settings-tabs/ModelTab'
import { HotkeyTab } from './settings-tabs/HotkeyTab'
import { DictionaryTab } from './settings-tabs/DictionaryTab'
import { CloudTab } from './settings-tabs/CloudTab'
import { CleanupTab } from './settings-tabs/CleanupTab'
import { HistoryTab } from './settings-tabs/HistoryTab'

type Tab = 'general' | 'model' | 'cloud' | 'cleanup' | 'hotkey' | 'dictionary' | 'history'

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'general', label: 'General', icon: '⚙' },
  { id: 'model', label: 'Modelo', icon: '🧠' },
  { id: 'cloud', label: 'Cloud', icon: '☁' },
  { id: 'cleanup', label: 'Limpieza IA', icon: '✨' },
  { id: 'hotkey', label: 'Atajos', icon: '⌨' },
  { id: 'dictionary', label: 'Diccionario', icon: '📓' },
  { id: 'history', label: 'Historial', icon: '🕘' }
]

export function App(): React.JSX.Element {
  const [tab, setTab] = useState<Tab>('general')
  const [settings, setSettings] = useState<CleeVoiceSettings | null>(null)
  const [models, setModels] = useState<ModelInfo[]>([])
  const [saving, setSaving] = useState(false)

  async function reload(): Promise<void> {
    const [s, m] = await Promise.all([window.api.settings.getAll(), window.api.models.list()])
    setSettings(s)
    setModels(m)
  }

  useEffect(() => {
    void reload()
    const off = window.api.settings.onChanged((s) => setSettings(s))
    return () => off()
  }, [])

  async function patch(diff: Partial<CleeVoiceSettings>): Promise<void> {
    setSaving(true)
    try {
      const next = await window.api.settings.update(diff)
      setSettings(next)
    } finally {
      setSaving(false)
    }
  }

  if (!settings) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-neutral-950 text-neutral-400">
        Cargando configuración…
      </main>
    )
  }

  const needsApiKey = settings.engine === 'groq' && !settings.groqApiKey
  const isOnboarding = !settings.onboarded

  return (
    <main className="relative flex min-h-screen flex-col bg-neutral-950 text-neutral-100">
      <header className="flex items-center justify-between border-b border-white/5 bg-neutral-950/80 px-6 py-4 backdrop-blur">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-blue-600 text-white shadow-lg shadow-violet-500/20">
            <span className="text-base">🎙</span>
          </div>
          <div>
            <h1 className="text-base font-semibold tracking-tight">CleeVoice</h1>
            <p className="text-[11px] text-neutral-500">
              Dictado por voz · JoinsClee · v{window.api.version}
            </p>
          </div>
        </div>
        <span className="text-[11px] text-neutral-500">
          {saving ? 'Guardando…' : 'Guardado automáticamente'}
        </span>
      </header>

      {isOnboarding ? (
        <OnboardingBanner
          settings={settings}
          patch={patch}
          onDismiss={() => void patch({ onboarded: true })}
        />
      ) : needsApiKey ? (
        <NeedsApiKeyBanner onOpenCloud={() => setTab('cloud')} />
      ) : null}

      <div className="flex flex-1">
        <nav className="w-52 shrink-0 border-r border-white/5 bg-neutral-950/40 px-3 py-4">
          <ul className="flex flex-col gap-0.5">
            {TABS.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => setTab(t.id)}
                  className={
                    'flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm transition-colors ' +
                    (tab === t.id
                      ? 'bg-white/[0.06] text-white'
                      : 'text-neutral-400 hover:bg-white/[0.03] hover:text-neutral-200')
                  }
                >
                  <span className="text-base leading-none opacity-80">{t.icon}</span>
                  <span>{t.label}</span>
                  {t.id === 'cloud' && needsApiKey && (
                    <span className="ml-auto inline-flex h-1.5 w-1.5 rounded-full bg-red-400" />
                  )}
                </button>
              </li>
            ))}
          </ul>

          <div className="mt-6 rounded-md border border-white/5 bg-white/[0.02] p-3 text-[11px] leading-snug text-neutral-500">
            <p className="font-medium text-neutral-300">Tip</p>
            <p className="mt-1">
              Presioná{' '}
              <kbd className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[10px] text-neutral-200">
                {prettyHotkey(settings.hotkey)}
              </kbd>{' '}
              estando en cualquier app para dictar.
            </p>
          </div>
        </nav>

        <section className="flex-1 overflow-y-auto px-8 py-6">
          {tab === 'general' && <GeneralTab settings={settings} patch={patch} />}
          {tab === 'model' && (
            <ModelTab settings={settings} models={models} patch={patch} reload={reload} />
          )}
          {tab === 'cloud' && <CloudTab settings={settings} patch={patch} />}
          {tab === 'cleanup' && <CleanupTab settings={settings} patch={patch} />}
          {tab === 'hotkey' && <HotkeyTab settings={settings} patch={patch} />}
          {tab === 'dictionary' && <DictionaryTab settings={settings} patch={patch} />}
          {tab === 'history' && <HistoryTab />}
        </section>
      </div>
    </main>
  )
}

/**
 * Onboarding inline. Si todavía no hay API key, el flow primero la pide:
 * pegar → probar → guardar. Si ya hay key, queda en modo confirmación
 * con el resumen de los próximos pasos (hotkey + permisos).
 */
function OnboardingBanner({
  settings,
  patch,
  onDismiss
}: {
  settings: CleeVoiceSettings
  patch: (diff: Partial<CleeVoiceSettings>) => Promise<void>
  onDismiss: () => void
}): React.JSX.Element {
  const [keyInput, setKeyInput] = useState('')
  const [testing, setTesting] = useState(false)
  const [error, setError] = useState('')
  const hasKey = settings.groqApiKey.length > 0

  async function saveKey(): Promise<void> {
    const trimmed = keyInput.trim()
    if (!trimmed) return
    setTesting(true)
    setError('')
    try {
      const test = await window.api.groq.testKey(trimmed)
      if (!test.ok) {
        setError(test.message ?? 'La key no es válida')
        return
      }
      await patch({ groqApiKey: trimmed })
      setKeyInput('')
    } catch (err) {
      setError(`Error inesperado: ${String(err)}`)
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="border-b border-violet-500/20 bg-gradient-to-r from-violet-600/[0.12] via-blue-600/[0.08] to-violet-600/[0.12] px-6 py-6">
      <div className="mx-auto max-w-3xl">
        <div className="flex items-start gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-blue-600 text-lg shadow-lg shadow-violet-500/30">
            👋
          </div>
          <div className="flex-1">
            <h2 className="text-base font-semibold text-white">Bienvenido a CleeVoice</h2>
            <p className="mt-1 text-sm leading-relaxed text-neutral-300">
              {hasKey
                ? '✓ Tu API key de Groq está configurada. Ya podés dictar.'
                : 'Para empezar a dictar necesitás una API key gratis de Groq. Es 1 minuto y gratis.'}
            </p>
          </div>
        </div>

        {!hasKey && (
          <div className="mt-5 ml-14">
            <div className="rounded-md border border-white/10 bg-neutral-900/60 p-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-violet-300">
                  Paso 1 — API key de Groq
                </span>
                <a
                  href="https://console.groq.com/keys"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-violet-300 hover:text-violet-200 hover:underline"
                >
                  Obtenela acá ↗
                </a>
              </div>
              <p className="mb-3 text-xs leading-relaxed text-neutral-400">
                Andá a <span className="text-neutral-200">console.groq.com/keys</span>, login con
                Google, click <span className="text-neutral-200">Create API Key</span>, copiá la
                key (empieza con <span className="font-mono text-neutral-300">gsk_</span>) y
                pegala abajo.
              </p>
              <div className="flex gap-2">
                <input
                  type="password"
                  value={keyInput}
                  onChange={(e) => setKeyInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void saveKey()
                  }}
                  placeholder="gsk_..."
                  className="flex-1 rounded-md border border-white/10 bg-neutral-950 px-3 py-2 font-mono text-sm text-neutral-100 placeholder:text-neutral-600 focus:border-violet-500 focus:outline-none"
                  autoFocus
                />
                <button
                  type="button"
                  disabled={!keyInput.trim() || testing}
                  onClick={() => void saveKey()}
                  className="rounded-md bg-violet-500 px-4 py-2 text-sm font-medium text-white hover:bg-violet-400 disabled:opacity-50"
                >
                  {testing ? 'Probando…' : 'Guardar'}
                </button>
              </div>
              {error && <p className="mt-2 text-xs text-red-300">✗ {error}</p>}
            </div>
          </div>
        )}

        <div className="mt-5 ml-14">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-500">
            {hasKey ? 'Próximos pasos' : 'Después de configurar la key'}
          </p>
          <ol className="list-decimal space-y-1 pl-5 text-sm text-neutral-300">
            <li>
              Presioná{' '}
              <kbd className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[11px] text-neutral-100">
                {prettyHotkey(settings.hotkey)}
              </kbd>{' '}
              en cualquier app para empezar a dictar. Presionalo de nuevo para detener.
            </li>
            <li>
              La primera vez macOS pedirá permiso de{' '}
              <span className="text-neutral-100">micrófono</span> y{' '}
              <span className="text-neutral-100">accesibilidad</span> (para pegar el texto donde
              esté tu cursor). Aprobalos.
            </li>
            <li>
              CleeVoice vive en la <span className="text-neutral-100">menubar</span>, no en el
              Dock. Cerrar esta ventana no cierra la app.
            </li>
          </ol>

          {hasKey && (
            <div className="mt-5">
              <button
                type="button"
                onClick={onDismiss}
                className="rounded-md bg-violet-500 px-4 py-2 text-sm font-medium text-white hover:bg-violet-400"
              >
                Listo, empezar a dictar
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * Banner persistente que aparece cuando el usuario ya completó onboarding
 * pero borró su API key o cambió engine a groq sin configurarla. Recuerda
 * al usuario que el dictado va a fallar hasta resolver esto.
 */
function NeedsApiKeyBanner({
  onOpenCloud
}: {
  onOpenCloud: () => void
}): React.JSX.Element {
  return (
    <div className="border-b border-red-500/30 bg-red-500/[0.08] px-6 py-3">
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-4">
        <div className="flex items-center gap-3 text-sm text-red-100">
          <span className="text-base">⚠</span>
          <span>
            No hay API key de Groq configurada. El dictado no va a funcionar hasta que la
            pegues en <span className="font-medium">Cloud</span>.
          </span>
        </div>
        <button
          type="button"
          onClick={onOpenCloud}
          className="rounded-md border border-red-400/40 bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-100 hover:bg-red-500/20"
        >
          Configurar →
        </button>
      </div>
    </div>
  )
}

function prettyHotkey(accel: string): string {
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
