import { useEffect, useState } from 'react'
import type { CleeVoiceSettings, ModelInfo } from '../../preload/index'
import { GeneralTab } from './settings-tabs/GeneralTab'
import { ModelTab } from './settings-tabs/ModelTab'
import { HotkeyTab } from './settings-tabs/HotkeyTab'
import { DictionaryTab } from './settings-tabs/DictionaryTab'
import { CloudTab } from './settings-tabs/CloudTab'

type Tab = 'general' | 'model' | 'cloud' | 'hotkey' | 'dictionary'

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'general', label: 'General', icon: '⚙' },
  { id: 'model', label: 'Modelo', icon: '🧠' },
  { id: 'cloud', label: 'Cloud', icon: '☁' },
  { id: 'hotkey', label: 'Atajos', icon: '⌨' },
  { id: 'dictionary', label: 'Diccionario', icon: '📓' }
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
          {tab === 'hotkey' && <HotkeyTab settings={settings} patch={patch} />}
          {tab === 'dictionary' && <DictionaryTab settings={settings} patch={patch} />}
        </section>
      </div>
    </main>
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
