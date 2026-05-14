import { useEffect, useState } from 'react'
import type { TranscriptionRow, HistoryStats } from '../../../preload/index'

const PAGE = 50

export function HistoryTab(): React.JSX.Element {
  const [rows, setRows] = useState<TranscriptionRow[]>([])
  const [stats, setStats] = useState<HistoryStats | null>(null)
  const [search, setSearch] = useState('')
  const [offset, setOffset] = useState(0)
  const [loading, setLoading] = useState(false)

  async function reload(currentOffset = offset, currentSearch = search): Promise<void> {
    setLoading(true)
    try {
      const [r, s] = await Promise.all([
        window.api.history.list({ limit: PAGE, offset: currentOffset, search: currentSearch }),
        window.api.history.stats()
      ])
      setRows(r)
      setStats(s)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void reload(0, '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const t = setTimeout(() => {
      setOffset(0)
      void reload(0, search)
    }, 200)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search])

  async function remove(id: number): Promise<void> {
    await window.api.history.remove(id)
    await reload()
  }

  async function copyToClipboard(text: string): Promise<void> {
    await navigator.clipboard.writeText(text)
  }

  async function clearAll(): Promise<void> {
    if (!confirm('¿Borrar TODO el historial? Esto no se puede deshacer.')) return
    await window.api.history.clear()
    setOffset(0)
    await reload(0, '')
  }

  function changePage(delta: number): void {
    const next = Math.max(0, offset + delta * PAGE)
    setOffset(next)
    void reload(next, search)
  }

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      {stats && (
        <div className="grid grid-cols-4 gap-3">
          <StatCard label="Transcripciones" value={stats.totalCount.toLocaleString()} />
          <StatCard label="Palabras" value={stats.totalWords.toLocaleString()} />
          <StatCard
            label="Segundos hablados"
            value={`${stats.totalSeconds.toLocaleString()}s`}
          />
          <StatCard
            label="Ahorro estimado"
            value={`~${stats.estimatedSavedMinutes} min`}
            hint="vs tipear a 40 wpm"
            accent
          />
        </div>
      )}

      <div className="flex items-center gap-2">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar en raw + limpio…"
          className="flex-1 rounded-md border border-white/10 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-600 focus:border-violet-500 focus:outline-none"
        />
        <button
          type="button"
          onClick={() => void clearAll()}
          className="rounded-md border border-white/10 px-3 py-2 text-xs text-neutral-400 hover:border-red-500/40 hover:text-red-300"
        >
          Borrar todo
        </button>
      </div>

      <div className="overflow-hidden rounded-md border border-white/10">
        <table className="w-full text-sm">
          <thead className="bg-white/[0.04] text-left text-[11px] uppercase tracking-wide text-neutral-400">
            <tr>
              <th className="px-3 py-2 font-medium">Cuándo</th>
              <th className="px-3 py-2 font-medium">App</th>
              <th className="px-3 py-2 font-medium">Texto</th>
              <th className="px-3 py-2 font-medium">Engine</th>
              <th className="px-3 py-2 text-right font-medium">Acción</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-neutral-500">
                  {loading
                    ? 'Cargando…'
                    : search
                      ? 'Sin resultados para esa búsqueda.'
                      : 'Aún no hay transcripciones. Probá ⌘+Shift+Espacio.'}
                </td>
              </tr>
            )}
            {rows.map((r) => {
              const display = r.cleaned_text ?? r.raw_text
              return (
                <tr key={r.id} className="hover:bg-white/[0.02]">
                  <td className="whitespace-nowrap px-3 py-2 align-top text-xs text-neutral-400">
                    {relativeTime(r.created_at)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 align-top text-xs text-neutral-400">
                    {r.app_name ?? '—'}
                  </td>
                  <td
                    className="max-w-md px-3 py-2 align-top text-neutral-200"
                    title={display}
                  >
                    <div className="line-clamp-2 text-sm leading-snug">{display}</div>
                    {r.cleaned_text && (
                      <div className="mt-0.5 text-[11px] text-neutral-500">
                        raw: {truncate(r.raw_text, 80)}
                      </div>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 align-top text-[11px] text-neutral-500">
                    {r.engine}/{r.model}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right align-top">
                    <button
                      type="button"
                      onClick={() => void copyToClipboard(display)}
                      className="rounded border border-white/10 px-2 py-0.5 text-xs text-neutral-300 hover:border-white/20"
                      title="Copiar al portapapeles"
                    >
                      Copiar
                    </button>
                    <button
                      type="button"
                      onClick={() => void remove(r.id)}
                      className="ml-1.5 rounded border border-white/10 px-2 py-0.5 text-xs text-neutral-400 hover:border-red-500/40 hover:text-red-300"
                      title="Eliminar"
                    >
                      ×
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-xs text-neutral-500">
        <span>
          {rows.length > 0 &&
            `Mostrando ${offset + 1}–${offset + rows.length}${stats ? ` de ${stats.totalCount}` : ''}`}
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={offset === 0 || loading}
            onClick={() => changePage(-1)}
            className="rounded border border-white/10 px-3 py-1 disabled:opacity-40 hover:border-white/20"
          >
            ← Anterior
          </button>
          <button
            type="button"
            disabled={rows.length < PAGE || loading}
            onClick={() => changePage(1)}
            className="rounded border border-white/10 px-3 py-1 disabled:opacity-40 hover:border-white/20"
          >
            Siguiente →
          </button>
        </div>
      </div>
    </div>
  )
}

function StatCard({
  label,
  value,
  hint,
  accent
}: {
  label: string
  value: string
  hint?: string
  accent?: boolean
}): React.JSX.Element {
  return (
    <div
      className={
        'rounded-md border p-3 ' +
        (accent
          ? 'border-violet-500/30 bg-violet-500/[0.06]'
          : 'border-white/5 bg-white/[0.02]')
      }
    >
      <div className="text-[11px] uppercase tracking-wide text-neutral-500">{label}</div>
      <div className="mt-0.5 text-xl font-semibold text-neutral-100">{value}</div>
      {hint && <div className="mt-0.5 text-[10px] text-neutral-500">{hint}</div>}
    </div>
  )
}

function relativeTime(ts: number): string {
  const diff = Date.now() - ts
  const sec = Math.floor(diff / 1000)
  if (sec < 60) return `hace ${sec}s`
  const min = Math.floor(sec / 60)
  if (min < 60) return `hace ${min}min`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `hace ${hr}h`
  const day = Math.floor(hr / 24)
  if (day < 7) return `hace ${day}d`
  return new Date(ts).toLocaleDateString('es-ES', {
    day: '2-digit',
    month: 'short',
    year: '2-digit'
  })
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + '…' : s
}
