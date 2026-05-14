import { useState } from 'react'
import type { CleeVoiceSettings, ModelInfo, ModelName } from '../../../preload/index'
import { Field } from './ui'

interface Props {
  settings: CleeVoiceSettings
  models: ModelInfo[]
  patch: (diff: Partial<CleeVoiceSettings>) => Promise<void>
  reload: () => Promise<void>
}

const QUALITY: Record<ModelName, string> = {
  tiny: '⭐⭐',
  base: '⭐⭐⭐',
  small: '⭐⭐⭐⭐',
  medium: '⭐⭐⭐⭐⭐'
}

const SPEED: Record<ModelName, string> = {
  tiny: 'muy rápido',
  base: 'rápido',
  small: 'medio',
  medium: 'lento'
}

export function ModelTab({ settings, models, patch, reload }: Props): React.JSX.Element {
  const [busy, setBusy] = useState<ModelName | null>(null)
  const [progress, setProgress] = useState<Record<string, number>>({})

  async function handleDownload(name: ModelName): Promise<void> {
    setBusy(name)
    const off = window.api.onModelDownloadProgress((p) => {
      if (p.model === name) setProgress((prev) => ({ ...prev, [name]: p.percent }))
    })
    try {
      const r = await window.api.models.download(name)
      if (!r.ok) alert(`Error descargando ${name}: ${r.error}`)
      await reload()
    } finally {
      off()
      setBusy(null)
      setProgress((prev) => {
        const copy = { ...prev }
        delete copy[name]
        return copy
      })
    }
  }

  async function handleDelete(name: ModelName): Promise<void> {
    if (name === settings.model) {
      alert('No podés borrar el modelo activo. Elegí otro primero.')
      return
    }
    if (!confirm(`¿Borrar el modelo ${name}?`)) return
    const r = await window.api.models.delete(name)
    if (!r.ok) alert(`Error borrando ${name}: ${r.error}`)
    await reload()
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Field
        label="Engine"
        hint="Local: procesa en tu Mac, sin internet, gratis. Cloud (Groq): más rápido y preciso pero envía el audio a sus servidores."
      >
        <div className="flex gap-2">
          <EngineCard
            active={settings.engine === 'local'}
            onClick={() => void patch({ engine: 'local' })}
            title="Local"
            sub="Whisper.cpp — sin internet"
          />
          <EngineCard
            active={settings.engine === 'groq'}
            onClick={() => void patch({ engine: 'groq' })}
            title="Cloud (Groq)"
            sub="Whisper-large-v3-turbo · más rápido"
          />
        </div>
        {settings.engine === 'groq' && !settings.groqApiKey && (
          <p className="mt-2 text-xs text-yellow-400">
            Aún no configuraste tu API key de Groq. Lo verás disponible en la tab “Cloud”
            (próxima fase). Mientras tanto, el sistema cae a Local automáticamente.
          </p>
        )}
      </Field>

      <Field
        label="Modelo local"
        hint="Sólo se usa cuando el engine es Local. Más grande = mejor calidad pero más lento y ocupa más disco."
      >
        <div className="overflow-hidden rounded-md border border-white/10">
          <table className="w-full text-sm">
            <thead className="bg-white/[0.04] text-left text-[11px] uppercase tracking-wide text-neutral-400">
              <tr>
                <th className="px-3 py-2 font-medium">Modelo</th>
                <th className="px-3 py-2 font-medium">Tamaño</th>
                <th className="px-3 py-2 font-medium">Velocidad</th>
                <th className="px-3 py-2 font-medium">Calidad ES</th>
                <th className="px-3 py-2 text-right font-medium">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {models.map((m) => {
                const isActive = settings.model === m.name
                const isBusy = busy === m.name
                const pct = progress[m.name] ?? 0
                return (
                  <tr key={m.name} className={isActive ? 'bg-violet-500/[0.06]' : ''}>
                    <td className="px-3 py-2 align-middle">
                      <label className="inline-flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="model"
                          checked={isActive}
                          disabled={!m.downloaded}
                          onChange={() => void patch({ model: m.name })}
                          className="h-3.5 w-3.5 accent-violet-500"
                        />
                        <span className="font-medium">{m.name}</span>
                        {isActive && (
                          <span className="rounded bg-violet-500/20 px-1.5 py-0.5 text-[10px] font-medium text-violet-300">
                            activo
                          </span>
                        )}
                      </label>
                    </td>
                    <td className="px-3 py-2 align-middle text-neutral-400">
                      {prettySize(m.sizeMb)}
                    </td>
                    <td className="px-3 py-2 align-middle text-neutral-400">{SPEED[m.name]}</td>
                    <td className="px-3 py-2 align-middle">{QUALITY[m.name]}</td>
                    <td className="px-3 py-2 text-right align-middle">
                      {isBusy ? (
                        <span className="text-xs text-neutral-400">
                          Descargando {pct}%
                        </span>
                      ) : m.downloaded ? (
                        <button
                          type="button"
                          onClick={() => void handleDelete(m.name)}
                          className="rounded border border-white/10 px-2.5 py-1 text-xs text-neutral-300 hover:border-red-500/40 hover:text-red-300"
                        >
                          Eliminar
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => void handleDownload(m.name)}
                          className="rounded bg-violet-500 px-2.5 py-1 text-xs font-medium text-white hover:bg-violet-400"
                        >
                          Descargar
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Field>
    </div>
  )
}

function EngineCard({
  active,
  onClick,
  title,
  sub
}: {
  active: boolean
  onClick: () => void
  title: string
  sub: string
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        'flex-1 rounded-md border px-4 py-3 text-left transition-colors ' +
        (active
          ? 'border-violet-500 bg-violet-500/[0.08] text-white'
          : 'border-white/10 bg-white/[0.02] text-neutral-300 hover:border-white/20')
      }
    >
      <div className="text-sm font-medium">{title}</div>
      <div className="mt-0.5 text-xs text-neutral-400">{sub}</div>
    </button>
  )
}

function prettySize(mb: number): string {
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`
  return `${mb} MB`
}
