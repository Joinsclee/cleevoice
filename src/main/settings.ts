import Store from 'electron-store'
import log from 'electron-log/main'

/**
 * Settings persistentes de CleeVoice (Fase 5).
 *
 * Guardado en JSON via electron-store. Ubicación:
 *   macOS: ~/Library/Application Support/cleevoice/config.json
 *   Win:   %APPDATA%/cleevoice/config.json
 *
 * Diseño:
 *  - Defaults razonables: si el archivo no existe, todo arranca con valores
 *    seguros (modelo small, español, hotkey clásico, dictionary JoinsClee).
 *  - groqApiKey se guarda como string base64 cifrado con safeStorage (Fase 6
 *    lo va a setear y leer); no lo logueamos nunca.
 *  - Los listeners onChange permiten que el runtime re-aplique cambios
 *    (re-registrar hotkey, recargar idioma, etc.) sin reiniciar la app.
 */

export type Engine = 'local' | 'groq'
export type ModelName = 'tiny' | 'base' | 'small' | 'medium'
export type Language = 'es' | 'en' | 'pt' | 'fr'
export type CleanupTone = 'general' | 'profesional' | 'casual' | 'tecnico'

export interface CleeVoiceSettings {
  hotkey: string
  engine: Engine
  model: ModelName
  language: Language
  autostart: boolean
  showNotifications: boolean
  cleanupEnabled: boolean
  cleanupTone: CleanupTone
  /** Base64-encoded ciphertext de la API key de Groq (vacío = no configurada). */
  groqApiKey: string
  /** Prompt custom que se concatena al prompt-context base (Whisper). */
  customPrompt: string
  /** Instrucciones extra para el LLM cleanup, además del system prompt base. */
  cleanupSystemPrompt: string
  /** Términos a respetar (Fase 8 los usa para post-procesar regex). */
  dictionary: string[]
  /** True cuando el usuario completó (o saltó) el onboarding inicial. */
  onboarded: boolean
}

const DEFAULT_DICTIONARY: string[] = [
  'JoinsClee',
  'Cristhian',
  'Camilo',
  'Skool',
  'GoHighLevel',
  'Hormozi',
  'Cialdini',
  'Schwartz',
  'n8n',
  'Supabase',
  'Easypanel',
  'Claude Code',
  'Anthropic',
  'MétodoCLEE',
  'CLEE'
]

const DEFAULTS: CleeVoiceSettings = {
  hotkey: 'CommandOrControl+Shift+Space',
  // Default Groq cloud: en macOS sin firma Developer ID el modo local no
  // arranca bien (limitación de Sequoia con dlopen y libs no firmadas), y
  // Groq es además más rápido y mejor calidad. El onboarding pide la API key
  // como primer paso. En Windows el modo local sigue siendo viable — el user
  // puede cambiarlo a 'local' desde Settings → Modelo.
  engine: 'groq',
  model: 'small',
  language: 'es',
  autostart: false,
  showNotifications: true,
  cleanupEnabled: false,
  cleanupTone: 'general',
  groqApiKey: '',
  customPrompt: '',
  cleanupSystemPrompt: '',
  dictionary: DEFAULT_DICTIONARY,
  onboarded: false
}

// electron-store usa @sindresorhus/conf bajo el capó; el ctor acepta defaults+name.
// El tipo del store es genérico, pero exponemos getters tipados estrictamente.
const store = new Store<CleeVoiceSettings>({
  name: 'config',
  defaults: DEFAULTS,
  clearInvalidConfig: true
})

type Listener = (next: CleeVoiceSettings, prev: CleeVoiceSettings) => void
const listeners = new Set<Listener>()

export function getAllSettings(): CleeVoiceSettings {
  // store.store devuelve el snapshot completo.
  const snapshot = (store as unknown as { store: CleeVoiceSettings }).store
  return { ...DEFAULTS, ...snapshot }
}

export function getSetting<K extends keyof CleeVoiceSettings>(key: K): CleeVoiceSettings[K] {
  return (store.get(key) as CleeVoiceSettings[K] | undefined) ?? DEFAULTS[key]
}

export function updateSettings(patch: Partial<CleeVoiceSettings>): CleeVoiceSettings {
  const prev = getAllSettings()
  const next = { ...prev, ...patch }
  // Asignamos clave por clave para que electron-store dispare onDidChange por cada una.
  for (const [k, v] of Object.entries(patch)) {
    // El tipo de set es genérico; casteamos para evitar el overload checker.
    ;(store.set as (key: string, value: unknown) => void)(k, v)
  }
  log.info(
    `Settings actualizadas: ${Object.keys(patch).join(', ')}` +
      (patch.groqApiKey !== undefined ? ' (groqApiKey redactada)' : '')
  )
  for (const cb of listeners) {
    try {
      cb(next, prev)
    } catch (err) {
      log.warn('Listener de settings lanzó', err)
    }
  }
  return next
}

export function onSettingsChange(cb: Listener): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

export function getDefaultDictionary(): string[] {
  return [...DEFAULT_DICTIONARY]
}

export function getConfigPath(): string {
  return store.path
}
