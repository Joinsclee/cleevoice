import { useEffect, useState } from 'react'
import type { CleeVoiceSettings } from '../../../preload/index'
import { Field } from './ui'

interface Props {
  settings: CleeVoiceSettings
  patch: (diff: Partial<CleeVoiceSettings>) => Promise<void>
}

type TestState =
  | { kind: 'idle' }
  | { kind: 'testing' }
  | { kind: 'ok'; message: string }
  | { kind: 'error'; message: string }

export function CloudTab({ settings, patch }: Props): React.JSX.Element {
  const [key, setKey] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [hasKey, setHasKey] = useState(false)
  const [test, setTest] = useState<TestState>({ kind: 'idle' })

  useEffect(() => {
    void window.api.groq.hasKey().then(setHasKey)
  }, [settings.groqApiKey])

  async function handleTest(): Promise<void> {
    if (!key.trim()) return
    setTest({ kind: 'testing' })
    const r = await window.api.groq.testKey(key.trim())
    setTest(
      r.ok
        ? { kind: 'ok', message: 'API key válida — conexión OK.' }
        : { kind: 'error', message: r.message ?? 'Falló la prueba' }
    )
  }

  async function handleSave(): Promise<void> {
    if (!key.trim()) return
    await patch({ groqApiKey: key.trim() })
    setKey('')
    setTest({ kind: 'idle' })
  }

  async function handleClear(): Promise<void> {
    if (!confirm('¿Quitar la API key de Groq? La app volverá a usar engine local.')) return
    await patch({ groqApiKey: '', engine: 'local' })
    setKey('')
    setTest({ kind: 'idle' })
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Field
        label="API key de Groq"
        hint={
          <>
            Obtené una gratis en{' '}
            <span className="text-violet-300">console.groq.com/keys</span>. Groq sirve
            Whisper-large-v3-turbo gratis con un rate-limit generoso (~14,400 segundos/día).
            Cuando está configurada y el engine es Cloud, las transcripciones tardan ~1s en
            vez de ~2s local, con calidad notablemente mejor en frases largas.
          </>
        }
      >
        <div className="space-y-2">
          {hasKey && (
            <div className="flex items-center justify-between rounded-md border border-emerald-400/30 bg-emerald-400/[0.06] px-3 py-2 text-xs text-emerald-200">
              <span>
                ✓ Hay una API key guardada (cifrada con safeStorage). Sólo se descifra en el
                main process al transcribir; el renderer nunca la ve.
              </span>
              <button
                type="button"
                onClick={() => void handleClear()}
                className="ml-3 rounded border border-emerald-400/30 px-2 py-0.5 text-[11px] text-emerald-100 hover:bg-emerald-400/10"
              >
                Quitar
              </button>
            </div>
          )}

          <div className="flex gap-2">
            <input
              type={showKey ? 'text' : 'password'}
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder={hasKey ? 'Pegá una nueva key para reemplazar…' : 'gsk_...'}
              className="flex-1 rounded-md border border-white/10 bg-neutral-900 px-3 py-2 font-mono text-sm text-neutral-100 placeholder:text-neutral-600 focus:border-violet-500 focus:outline-none"
            />
            <button
              type="button"
              onClick={() => setShowKey((s) => !s)}
              className="rounded-md border border-white/10 px-3 py-2 text-xs text-neutral-300 hover:border-white/20"
              title={showKey ? 'Ocultar' : 'Mostrar'}
            >
              {showKey ? '🙈' : '👁'}
            </button>
            <button
              type="button"
              disabled={!key.trim() || test.kind === 'testing'}
              onClick={() => void handleTest()}
              className="rounded-md border border-white/10 px-3 py-2 text-sm text-neutral-200 hover:border-white/20 disabled:opacity-50"
            >
              {test.kind === 'testing' ? 'Probando…' : 'Probar'}
            </button>
            <button
              type="button"
              disabled={!key.trim()}
              onClick={() => void handleSave()}
              className="rounded-md bg-violet-500 px-3 py-2 text-sm font-medium text-white disabled:opacity-50 hover:bg-violet-400"
            >
              Guardar
            </button>
          </div>

          {test.kind === 'ok' && (
            <p className="text-xs text-emerald-300">✓ {test.message}</p>
          )}
          {test.kind === 'error' && (
            <p className="text-xs text-red-300">✗ {test.message}</p>
          )}
        </div>
      </Field>

      <div className="rounded-md border border-white/5 bg-white/[0.02] p-4 text-xs text-neutral-400">
        <p className="font-medium text-neutral-300">Comportamiento del router</p>
        <ul className="mt-1.5 list-disc space-y-0.5 pl-5">
          <li>
            Engine <span className="text-neutral-200">Local</span>: usa Whisper.cpp en tu Mac,
            ignora la key de Groq.
          </li>
          <li>
            Engine <span className="text-neutral-200">Cloud (Groq)</span> con key configurada:
            cada dictado va a Groq.
          </li>
          <li>
            Si Groq falla por red o rate-limit, CleeVoice cae a Local
            automáticamente y muestra una notificación.
          </li>
          <li>
            Engine Cloud sin key configurada → cae a Local con un warn en logs.
          </li>
        </ul>
      </div>
    </div>
  )
}
