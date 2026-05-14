import { useState } from 'react'
import type { CleeVoiceSettings } from '../../../preload/index'
import { Field } from './ui'

interface Props {
  settings: CleeVoiceSettings
  patch: (diff: Partial<CleeVoiceSettings>) => Promise<void>
}

export function DictionaryTab({ settings, patch }: Props): React.JSX.Element {
  const [input, setInput] = useState('')

  async function addTerm(): Promise<void> {
    const term = input.trim()
    if (!term) return
    if (settings.dictionary.includes(term)) {
      setInput('')
      return
    }
    await patch({ dictionary: [...settings.dictionary, term] })
    setInput('')
  }

  async function removeTerm(term: string): Promise<void> {
    await patch({ dictionary: settings.dictionary.filter((t) => t !== term) })
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Field
        label="Diccionario personalizado"
        hint="Términos que Whisper debe respetar con su capitalización exacta. Útil para nombres propios y jerga (Skool, JoinsClee, CLEE, GoHighLevel, etc.)."
      >
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                void addTerm()
              }
            }}
            placeholder="Agregar término…"
            className="flex-1 rounded-md border border-white/10 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-600 focus:border-violet-500 focus:outline-none"
          />
          <button
            type="button"
            onClick={() => void addTerm()}
            disabled={!input.trim()}
            className="rounded-md bg-violet-500 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 hover:bg-violet-400"
          >
            Agregar
          </button>
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {settings.dictionary.length === 0 && (
            <span className="text-xs text-neutral-500">
              No hay términos. El diccionario por defecto incluye 15 palabras del ecosistema
              JoinsClee — restaurá con el botón de abajo.
            </span>
          )}
          {settings.dictionary.map((term) => (
            <span
              key={term}
              className="group inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-neutral-200"
            >
              {term}
              <button
                type="button"
                onClick={() => void removeTerm(term)}
                className="text-neutral-500 transition-colors hover:text-red-400"
                title={`Eliminar ${term}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      </Field>

      <div className="rounded-md border border-white/5 bg-white/[0.02] p-4 text-xs text-neutral-400">
        <p className="font-medium text-neutral-300">¿Cómo se aplica?</p>
        <p className="mt-1.5">
          Estos términos se pasan a Whisper como “prompt-context” inicial junto al base de
          CleeVoice (Cristhian, JoinsClee, Camilo, etc.). Whisper los reconoce con más
          probabilidad. En Fase 8 también se aplicará post-procesamiento regex para corregir
          variantes (ej: <em>skul</em> → <em>Skool</em>).
        </p>
      </div>
    </div>
  )
}
