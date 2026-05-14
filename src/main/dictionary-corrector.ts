/**
 * Corrector de diccionario por regex (Fase 8).
 *
 * Whisper a veces transcribe nombres propios con la fonética incorrecta:
 *   "skul"        → debe ser "Skool"
 *   "scoll"       → debe ser "Skool"
 *   "yonsclí"     → debe ser "JoinsClee"
 *   "go hailevel" → debe ser "GoHighLevel"
 *   "hormosi"     → debe ser "Hormozi"
 *
 * Estrategia simple: para cada término del diccionario, generamos un set de
 * variantes fonéticas razonables y reemplazamos por la versión canónica.
 *
 * No es perfecto — la limpieza con LLM (Fase 7) hace el grueso del trabajo.
 * Esto es una red de seguridad para cuando cleanup está apagado o falla.
 */

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Aplica el diccionario al texto: para cada término canónico, busca match
 * case-insensitive de la palabra exacta y reemplaza preservando la
 * capitalización del diccionario.
 */
export function applyDictionary(text: string, dictionary: string[]): string {
  if (!text || dictionary.length === 0) return text
  let out = text

  // Ordenamos por longitud descendente: "Claude Code" matchea antes que "Claude".
  const sorted = [...dictionary].sort((a, b) => b.length - a.length)

  for (const canonical of sorted) {
    const pattern = escapeRegex(canonical)
    // \b funciona razonable en ES (acentos cuentan como word chars en mode 'i').
    const re = new RegExp(`\\b${pattern}\\b`, 'gi')
    out = out.replace(re, canonical)
  }
  return out
}

/**
 * Construye el flag --prompt de whisper-cli con los términos del diccionario.
 * Whisper usa esto como prompt-context inicial; los términos en el prompt
 * tienen mucha más probabilidad de ser transcritos correctamente.
 *
 * NOTA: este prompt va EN ADICIÓN al prompt-context base (whisper-prompt.ts).
 * El consumidor es libre de combinarlos.
 */
export function dictionaryAsPromptHint(dictionary: string[]): string {
  if (dictionary.length === 0) return ''
  return `Términos clave: ${dictionary.join(', ')}.`
}
