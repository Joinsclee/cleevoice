import { safeStorage } from 'electron'
import { createReadStream } from 'node:fs'
import log from 'electron-log/main'
import { getInitialPrompt } from './whisper-prompt'

/**
 * Cliente de Groq Cloud (Fase 6).
 *
 *   STT:     POST /openai/v1/audio/transcriptions  (whisper-large-v3-turbo)
 *   Cleanup: POST /openai/v1/chat/completions      (llama-3.3-70b-versatile, Fase 7)
 *
 * La API key del usuario se guarda cifrada con safeStorage (Keychain en macOS,
 * DPAPI en Windows) y nunca se loguea. El módulo expone helpers para
 * encrypt/decrypt y un wrapper de transcribeWithGroq.
 */

const GROQ_BASE = 'https://api.groq.com/openai/v1'
const STT_MODEL = 'whisper-large-v3-turbo'

// ─── safeStorage helpers ────────────────────────────────────────────────────

export function encryptApiKey(plain: string): string {
  if (!plain) return ''
  if (!safeStorage.isEncryptionAvailable()) {
    log.warn('safeStorage no disponible — guardando key sin cifrar (¡no recomendado!)')
    return Buffer.from(plain, 'utf8').toString('base64')
  }
  return safeStorage.encryptString(plain).toString('base64')
}

export function decryptApiKey(stored: string): string {
  if (!stored) return ''
  try {
    if (!safeStorage.isEncryptionAvailable()) {
      return Buffer.from(stored, 'base64').toString('utf8')
    }
    return safeStorage.decryptString(Buffer.from(stored, 'base64'))
  } catch (err) {
    log.error('No se pudo descifrar groqApiKey:', err)
    return ''
  }
}

// ─── Test connectivity ──────────────────────────────────────────────────────

export interface TestKeyResult {
  ok: boolean
  status?: number
  message?: string
}

export async function testGroqKey(plainKey: string): Promise<TestKeyResult> {
  if (!plainKey.trim()) return { ok: false, message: 'API key vacía' }
  try {
    const res = await fetch(`${GROQ_BASE}/models`, {
      headers: { Authorization: `Bearer ${plainKey}` }
    })
    if (res.ok) return { ok: true, status: res.status }
    const body = await res.text().catch(() => '')
    return {
      ok: false,
      status: res.status,
      message:
        res.status === 401
          ? 'API key inválida'
          : res.status === 429
            ? 'Rate limit'
            : `HTTP ${res.status}: ${body.slice(0, 200)}`
    }
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) }
  }
}

// ─── Transcription ──────────────────────────────────────────────────────────

export interface GroqTranscribeOptions {
  apiKey: string
  language: string
  /** Prompt-context inicial. Si se omite, usamos el bake-in de JoinsClee. */
  prompt?: string
}

export interface GroqTranscribeResult {
  text: string
  durationMs: number
  engine: 'groq'
  model: typeof STT_MODEL
}

export class GroqError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly retryable: boolean = false
  ) {
    super(message)
    this.name = 'GroqError'
  }
}

export async function transcribeWithGroq(
  wavPath: string,
  opts: GroqTranscribeOptions
): Promise<GroqTranscribeResult> {
  if (!opts.apiKey.trim()) throw new GroqError('API key de Groq no configurada')

  const started = Date.now()
  const form = new FormData()
  // FormData de undici acepta Blob; armamos uno a partir del stream del WAV.
  const fileBlob = await streamToBlob(wavPath)
  form.append('file', fileBlob, 'audio.wav')
  form.append('model', STT_MODEL)
  form.append('language', opts.language)
  form.append('response_format', 'text')
  form.append('prompt', opts.prompt ?? getInitialPrompt(opts.language))
  // temperature=0 da resultados estables (sin samplear sobre la primera vez).
  form.append('temperature', '0')

  let res: Response
  try {
    res = await fetch(`${GROQ_BASE}/audio/transcriptions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${opts.apiKey}` },
      body: form
    })
  } catch (err) {
    throw new GroqError(
      `Red caída o DNS: ${err instanceof Error ? err.message : String(err)}`,
      undefined,
      true
    )
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    const retryable = res.status >= 500 || res.status === 429
    throw new GroqError(
      `Groq HTTP ${res.status}: ${body.slice(0, 200)}`,
      res.status,
      retryable
    )
  }

  const text = (await res.text()).trim()
  const durationMs = Date.now() - started
  log.info(`Transcripción Groq (${STT_MODEL}) lista en ${durationMs}ms: ${text.length} chars`)
  return { text, durationMs, engine: 'groq', model: STT_MODEL }
}

async function streamToBlob(filePath: string): Promise<Blob> {
  const chunks: Buffer[] = []
  for await (const chunk of createReadStream(filePath)) {
    chunks.push(chunk as Buffer)
  }
  return new Blob([Buffer.concat(chunks)], { type: 'audio/wav' })
}
