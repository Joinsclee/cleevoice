import log from 'electron-log/main'

/**
 * Limpieza de texto con LLM (Fase 7).
 *
 * Recibe la transcripción cruda + contexto de la app activa + tono general
 * y devuelve la versión "lista para pegar":
 *   - sin muletillas (eh, este, o sea, como que)
 *   - con puntuación y mayúsculas correctas
 *   - en el tono que corresponde a la app destino
 *
 * Modelo: llama-3.3-70b-versatile (gratis en Groq con rate limit decente).
 * Temperatura baja (0.2) para que no reescriba/agregue contenido.
 */

const GROQ_BASE = 'https://api.groq.com/openai/v1'
const MODEL = 'llama-3.3-70b-versatile'

export type CleanupTone = 'general' | 'profesional' | 'casual' | 'tecnico'
export type AppContext =
  | 'email'
  | 'chat-casual'
  | 'code'
  | 'llm-prompt'
  | 'doc-personal'
  | 'general'

export interface CleanupOptions {
  apiKey: string
  rawText: string
  language: string
  tone: CleanupTone
  appName: string
  appContext: AppContext
  dictionary: string[]
  customSystemPrompt?: string
}

export interface CleanupResult {
  text: string
  durationMs: number
}

/**
 * Mapea el bundle id / nombre del proceso activo a un contexto semántico.
 * El mapeo cubre las apps más usadas en JoinsClee: Gmail/Outlook en email,
 * Slack/Discord/Telegram en chat, VSCode/Cursor en code, ChatGPT/Claude en
 * prompt, Notion/Obsidian/Word en doc.
 */
export function inferAppContext(appName: string): AppContext {
  const a = appName.toLowerCase()
  if (a.includes('mail') || a.includes('gmail') || a.includes('outlook') || a.includes('superhuman'))
    return 'email'
  if (
    a.includes('slack') ||
    a.includes('discord') ||
    a.includes('telegram') ||
    a.includes('whatsapp') ||
    a.includes('messenger') ||
    a.includes('signal')
  )
    return 'chat-casual'
  if (
    a.includes('code') ||
    a.includes('cursor') ||
    a.includes('intellij') ||
    a.includes('webstorm') ||
    a.includes('xcode') ||
    a.includes('terminal') ||
    a.includes('iterm') ||
    a.includes('warp')
  )
    return 'code'
  if (a.includes('chatgpt') || a.includes('claude') || a.includes('perplexity'))
    return 'llm-prompt'
  if (
    a.includes('notion') ||
    a.includes('obsidian') ||
    a.includes('word') ||
    a.includes('pages') ||
    a.includes('docs') ||
    a.includes('craft') ||
    a.includes('bear')
  )
    return 'doc-personal'
  return 'general'
}

/**
 * Detecta la app con foco. Si active-win falla (permisos, plataforma), devuelve
 * un default razonable en vez de romper el pipeline.
 */
export async function detectActiveApp(): Promise<{ name: string; context: AppContext }> {
  try {
    const mod = await import('active-win')
    const fn = (mod.default ?? mod) as () => Promise<{ owner?: { name?: string } } | undefined>
    const win = await fn()
    const name = win?.owner?.name ?? 'desconocida'
    return { name, context: inferAppContext(name) }
  } catch (err) {
    log.debug('active-win no disponible:', err)
    return { name: 'desconocida', context: 'general' }
  }
}

function buildSystemPrompt(opts: {
  tone: CleanupTone
  appName: string
  context: AppContext
  dictionary: string[]
  custom?: string
}): string {
  const toneHint: Record<CleanupTone, string> = {
    general: 'Mantené el tono natural del hablante.',
    profesional: 'Tono profesional, párrafos completos, sin contracciones excesivas.',
    casual: 'Tono conversacional, frases cortas, sin saludos formales.',
    tecnico: 'Preservá términos técnicos. Si hay código inline, no lo edites.'
  }

  const contextHint: Record<AppContext, string> = {
    email: 'El destino es un email: usá párrafos, despedida si parece corresponder.',
    'chat-casual': 'Destino: mensaje de chat. Frases cortas, sin saludos largos.',
    code: 'Destino: editor de código. Si el texto parece un comentario, mantenelo claro.',
    'llm-prompt': 'Destino: ChatGPT/Claude. Convertí en un prompt claro y conciso.',
    'doc-personal': 'Destino: nota o documento. Conservá la estructura informal del hablante.',
    general: 'Destino: texto general.'
  }

  const dictBlock =
    opts.dictionary.length > 0
      ? `Términos que SIEMPRE deben escribirse con esta capitalización exacta: ${opts.dictionary.join(', ')}.`
      : ''

  const base = [
    'Eres un editor de texto preciso. Recibís una transcripción de voz cruda en español.',
    'Tarea: devolver el texto limpio sin muletillas ("eh", "este", "o sea", "como que",',
    '"o sea como", "tipo"), con puntuación correcta, mayúsculas apropiadas. Preservá 100%',
    'el sentido. NO inventes, NO agregues, NO uses markdown ni comillas. Devolvé SOLO el',
    'texto limpio.',
    `Contexto: app activa "${opts.appName}". ${contextHint[opts.context]}`,
    toneHint[opts.tone],
    dictBlock,
    opts.custom?.trim() ?? ''
  ]
    .filter((s) => s && s.length > 0)
    .join(' ')

  return base
}

export class CleanupError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly retryable: boolean = false
  ) {
    super(message)
    this.name = 'CleanupError'
  }
}

export async function cleanupText(opts: CleanupOptions): Promise<CleanupResult> {
  if (!opts.apiKey.trim()) throw new CleanupError('API key de Groq no configurada')
  if (!opts.rawText.trim()) return { text: opts.rawText, durationMs: 0 }

  const started = Date.now()
  const systemPrompt = buildSystemPrompt({
    tone: opts.tone,
    appName: opts.appName,
    context: opts.appContext,
    dictionary: opts.dictionary,
    custom: opts.customSystemPrompt
  })

  let res: Response
  try {
    res = await fetch(`${GROQ_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${opts.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: opts.rawText }
        ],
        temperature: 0.2,
        max_tokens: 1500
      })
    })
  } catch (err) {
    throw new CleanupError(
      `Red caída: ${err instanceof Error ? err.message : String(err)}`,
      undefined,
      true
    )
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    const retryable = res.status >= 500 || res.status === 429
    throw new CleanupError(
      `Groq cleanup HTTP ${res.status}: ${body.slice(0, 200)}`,
      res.status,
      retryable
    )
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[]
  }
  const text = data.choices?.[0]?.message?.content?.trim() ?? opts.rawText
  const durationMs = Date.now() - started
  log.info(`Cleanup (${MODEL}) ${durationMs}ms: ${opts.rawText.length}→${text.length} chars`)
  return { text, durationMs }
}
