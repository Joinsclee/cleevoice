/**
 * Prompt-context inicial para whisper.cpp.
 *
 * Whisper acepta `--prompt "<texto>"`, un fragmento corto (~224 tokens) que el
 * decoder usa como contexto previo del audio: las palabras que aparecen ahí se
 * vuelven mucho más probables. NO es un instructivo (Whisper no entiende
 * instrucciones), es una "muestra" del vocabulario y el dominio.
 *
 * Reglas de oro al armarlo:
 *   - Tiene que sonar como una frase natural en español, no una lista.
 *   - Conviene meter los nombres propios con su capitalización canónica.
 *   - No abusar: si el prompt es muy largo, distrae al modelo. ~250 chars OK.
 *
 * Cuando exista la UI de diccionario (Fase 8) el usuario va a poder editar
 * términos extra. Por ahora bake-in el vocabulario base del ecosistema CleeVoice.
 */

const PROMPT_ES = [
  'Soy Cristhian de JoinsClee y trabajo con Camilo en lanzamientos de productos digitales.',
  'Usamos Skool, GoHighLevel, n8n, Supabase, Easypanel y Claude Code de Anthropic.',
  'Aplicamos el Método CLEE inspirado en Hormozi, Cialdini y Schwartz.'
].join(' ')

const PROMPT_EN =
  'I am Cristhian from JoinsClee. We work with Camilo on digital product launches using Skool, GoHighLevel, n8n, Supabase, Easypanel and Claude Code from Anthropic.'

/**
 * Devuelve el prompt-context apropiado para el idioma actual.
 * Si el idioma no tiene una versión específica, cae a español (que es la mayoría
 * de uso de JoinsClee). Fase 5+ permitirá personalizarlo por usuario.
 */
export function getInitialPrompt(language: string): string {
  switch (language) {
    case 'en':
      return PROMPT_EN
    case 'es':
    default:
      return PROMPT_ES
  }
}
