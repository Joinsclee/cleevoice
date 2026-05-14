import { app } from 'electron'
import { spawn } from 'node:child_process'
import { promises as fs, existsSync } from 'node:fs'
import path from 'node:path'
import log from 'electron-log/main'
import { ensureModel, getModelPath, type WhisperModel } from './model-downloader'

/**
 * Wrapper de whisper.cpp local (Fase 3).
 *
 * Resolución del binario:
 *   1) En producción y dev, primero buscamos `resources/whisper/whisper-cli-mac`
 *      o `whisper-cli-win.exe` (bundleado con la app — Fase 9 lo bundlea con sus libs).
 *   2) Si no existe, fallback a `/opt/homebrew/bin/whisper-cli` (instalado vía
 *      `brew install whisper-cpp` durante el desarrollo).
 *   3) Si ninguno está, lanza error claro pidiendo instalar whisper-cpp.
 *
 * El binario es invocado con:
 *   whisper-cli -m <model.bin> -f <audio.wav> -l <lang> --no-prints --output-txt
 *
 * Por defecto crea `<audio>.txt` junto al WAV. Capturamos también stdout
 * por si la versión no escribe archivo de salida.
 */

function getBundledBinaryPath(): string {
  const binName = process.platform === 'win32' ? 'whisper-cli-win.exe' : 'whisper-cli-mac'
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'whisper', binName)
  }
  return path.join(app.getAppPath(), 'resources/whisper', binName)
}

function getFallbackBinaryPath(): string | null {
  // Brew install whisper-cpp lo deja acá.
  const brewPath = '/opt/homebrew/bin/whisper-cli'
  if (existsSync(brewPath)) return brewPath
  const intelBrewPath = '/usr/local/bin/whisper-cli'
  if (existsSync(intelBrewPath)) return intelBrewPath
  return null
}

export function resolveWhisperBinary(): string {
  const bundled = getBundledBinaryPath()
  if (existsSync(bundled)) return bundled
  const fallback = getFallbackBinaryPath()
  if (fallback) return fallback
  throw new Error(
    `whisper-cli no encontrado. Esperado en ${bundled} o /opt/homebrew/bin/whisper-cli. ` +
      `Instalá con: brew install whisper-cpp`
  )
}

export interface TranscribeResult {
  text: string
  durationMs: number
  engine: 'local'
  model: WhisperModel
}

export interface TranscribeOptions {
  language?: string
  model?: WhisperModel
  prompt?: string
}

/**
 * Transcribe un WAV 16kHz mono usando whisper.cpp.
 * Asume que el WAV ya tiene el formato correcto (audio.ts lo asegura).
 */
export async function transcribeLocal(
  wavPath: string,
  options: TranscribeOptions = {}
): Promise<TranscribeResult> {
  const language = options.language ?? 'es'
  const model = options.model ?? 'base'

  if (!existsSync(wavPath)) {
    throw new Error(`WAV no existe: ${wavPath}`)
  }

  const binPath = resolveWhisperBinary()
  const modelPath = await ensureModel(model)
  if (!existsSync(modelPath)) {
    throw new Error(`Modelo no se descargó correctamente: ${modelPath}`)
  }

  const args = [
    '-m',
    modelPath,
    '-f',
    wavPath,
    '-l',
    language,
    '--no-prints',
    '--output-txt'
  ]
  if (options.prompt) {
    args.push('--prompt', options.prompt)
  }

  log.info(`whisper-cli ${args.map((a) => (a.includes(' ') ? `"${a}"` : a)).join(' ')}`)

  const started = Date.now()
  const text = await new Promise<string>((resolve, reject) => {
    const proc = spawn(binPath, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    proc.stdout.on('data', (chunk) => (stdout += chunk.toString()))
    proc.stderr.on('data', (chunk) => (stderr += chunk.toString()))
    proc.on('error', (err) => reject(new Error(`whisper-cli no pudo arrancar: ${err.message}`)))
    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`whisper-cli exit code=${code}\nstderr:\n${stderr}`))
        return
      }
      resolve(stdout)
    })
  })

  // whisper-cli con --output-txt deja <wav>.txt. Probamos primero ese archivo.
  const txtPath = `${wavPath}.txt`
  let finalText = ''
  try {
    if (existsSync(txtPath)) {
      finalText = (await fs.readFile(txtPath, 'utf8')).trim()
    }
  } catch (err) {
    log.warn(`No se pudo leer ${txtPath}: ${String(err)}`)
  }
  if (!finalText) {
    // Fallback: stdout. whisper-cli imprime cada segmento con `[00:00:00.000 --> ...]` prefix.
    finalText = stripWhisperTimestamps(text).trim()
  }

  const durationMs = Date.now() - started
  log.info(
    `Transcripción local (${model}) lista en ${durationMs}ms: ${finalText.length} chars`
  )

  return { text: finalText, durationMs, engine: 'local', model }
}

/**
 * Elimina las marcas de tiempo `[00:00:00.000 --> 00:00:01.500]` que whisper-cli
 * imprime a stdout cuando --output-txt no se usa o el archivo no se generó.
 */
function stripWhisperTimestamps(raw: string): string {
  return raw
    .split(/\r?\n/)
    .map((line) => line.replace(/^\[[\d:.]+\s*-->\s*[\d:.]+\]\s*/, '').trim())
    .filter((line) => line.length > 0)
    .join(' ')
}

export { getModelPath, ensureModel, type WhisperModel }
