import type { CleanupTone, CleeVoiceSettings } from '../../../preload/index'
import { Field, Toggle } from './ui'

interface Props {
  settings: CleeVoiceSettings
  patch: (diff: Partial<CleeVoiceSettings>) => Promise<void>
}

const TONES: { id: CleanupTone; label: string; sub: string }[] = [
  { id: 'general', label: 'General', sub: 'Mantiene el tono natural del hablante.' },
  { id: 'profesional', label: 'Profesional', sub: 'Párrafos completos, formal.' },
  { id: 'casual', label: 'Casual', sub: 'Frases cortas, conversacional.' },
  { id: 'tecnico', label: 'Técnico', sub: 'Preserva términos técnicos y código.' }
]

export function CleanupTab({ settings, patch }: Props): React.JSX.Element {
  const noKey = settings.groqApiKey.length === 0

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Toggle
        label="Limpiar texto con IA después de transcribir"
        description={
          noKey
            ? 'Requiere una API key de Groq configurada en la tab Cloud.'
            : 'Pasa el texto por Llama 3.3 70B (Groq, gratis) para quitar muletillas y poner puntuación correcta. Suma ~500ms al flujo.'
        }
        checked={settings.cleanupEnabled}
        onChange={(cleanupEnabled) => void patch({ cleanupEnabled })}
      />

      {noKey && (
        <div className="rounded-md border border-yellow-400/30 bg-yellow-400/[0.06] p-3 text-xs text-yellow-200">
          ⚠ No hay API key de Groq. Mientras tanto, la limpieza no se aplica aunque el toggle
          esté activo.
        </div>
      )}

      <Field
        label="Tono"
        hint="Sirve de hint genérico al LLM. El contexto específico se infiere automáticamente de la app activa (Gmail → email profesional, Slack → casual, VSCode → técnico, etc.)."
      >
        <div className="grid grid-cols-2 gap-2">
          {TONES.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => void patch({ cleanupTone: t.id })}
              className={
                'rounded-md border px-3 py-2.5 text-left transition-colors ' +
                (settings.cleanupTone === t.id
                  ? 'border-violet-500 bg-violet-500/[0.08] text-white'
                  : 'border-white/10 bg-white/[0.02] text-neutral-200 hover:border-white/20')
              }
            >
              <div className="text-sm font-medium">{t.label}</div>
              <div className="mt-0.5 text-xs text-neutral-400">{t.sub}</div>
            </button>
          ))}
        </div>
      </Field>

      <Field
        label="Instrucciones extra para el LLM"
        hint="Se agregan al system prompt base de CleeVoice. Útil si querés enforce un estilo de voz consistente (ej: voz del Método CLEE)."
      >
        <textarea
          value={settings.cleanupSystemPrompt}
          onChange={(e) => void patch({ cleanupSystemPrompt: e.target.value })}
          placeholder="Ej: Cuando el texto sea para clientes, evitá tecnicismos. Mantené primera persona singular."
          rows={4}
          className="w-full resize-y rounded-md border border-white/10 bg-neutral-900 px-3 py-2 font-mono text-xs text-neutral-100 placeholder:text-neutral-600 focus:border-violet-500 focus:outline-none"
        />
        <div className="mt-1 text-right">
          <button
            type="button"
            onClick={() => void patch({ cleanupSystemPrompt: '' })}
            className="text-[11px] text-neutral-500 hover:text-neutral-300"
          >
            Restaurar prompt base
          </button>
        </div>
      </Field>
    </div>
  )
}
