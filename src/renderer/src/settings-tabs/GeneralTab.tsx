import type { CleeVoiceSettings } from '../../../preload/index'
import { Field, Toggle } from './ui'

interface Props {
  settings: CleeVoiceSettings
  patch: (diff: Partial<CleeVoiceSettings>) => Promise<void>
}

const LANGUAGES: { code: CleeVoiceSettings['language']; label: string }[] = [
  { code: 'es', label: 'Español' },
  { code: 'en', label: 'English' },
  { code: 'pt', label: 'Português' },
  { code: 'fr', label: 'Français' }
]

export function GeneralTab({ settings, patch }: Props): React.JSX.Element {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Field
        label="Idioma de transcripción"
        hint="El idioma del audio que dictas. Whisper soporta 100+, mostramos los 4 más usados por JoinsClee."
      >
        <select
          value={settings.language}
          onChange={(e) =>
            void patch({ language: e.target.value as CleeVoiceSettings['language'] })
          }
          className="w-56 rounded-md border border-white/10 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 focus:border-violet-500 focus:outline-none"
        >
          {LANGUAGES.map((l) => (
            <option key={l.code} value={l.code}>
              {l.label}
            </option>
          ))}
        </select>
      </Field>

      <Toggle
        label="Iniciar CleeVoice cuando arranca el sistema"
        description="La app abre en la bandeja al iniciar sesión. Recomendado si dictás varias veces al día."
        checked={settings.autostart}
        onChange={(autostart) => void patch({ autostart })}
      />

      <Toggle
        label="Mostrar notificaciones del sistema"
        description="Notificaciones de “Texto transcrito”, errores de permiso, etc. No afectan el dictado."
        checked={settings.showNotifications}
        onChange={(showNotifications) => void patch({ showNotifications })}
      />

      <div className="rounded-md border border-white/5 bg-white/[0.02] p-4 text-xs leading-relaxed text-neutral-400">
        <p className="font-medium text-neutral-200">Privacidad</p>
        <p className="mt-1.5">
          Con engine <span className="text-neutral-200">Local</span>, todo el audio se procesa
          en tu Mac — nada sale de la máquina. Con engine{' '}
          <span className="text-neutral-200">Cloud (Groq)</span>, el audio se envía a sus
          servidores; ellos no entrenan modelos con él pero igual la transcripción ocurre en
          su infraestructura. Podés cambiar entre engines en la tab <em>Modelo</em>.
        </p>
      </div>
    </div>
  )
}
