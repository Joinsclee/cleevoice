import { app } from 'electron'
import { spawn, spawnSync } from 'node:child_process'
import {
  promises as fs,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  symlinkSync,
  unlinkSync
} from 'node:fs'
import path from 'node:path'
import log from 'electron-log/main'
import { ensureModel, getModelPath, type WhisperModel } from './model-downloader'
import { getInitialPrompt } from './whisper-prompt'

/**
 * En macOS, libggml.0.dylib tiene un path hardcoded donde busca sus backends
 * (.so files de CPU/Metal/BLAS). Brew lo compila con
 * /opt/homebrew/Cellar/ggml/<ver>/libexec. Nuestro script de bundling patchea
 * binariamente ese string a /tmp/cleevoice-ggml-bx — un path neutro y
 * predecible que poblamos en runtime con symlinks al bundle de la app.
 *
 * Esto se ejecuta una vez al boot (idempotente).
 */
const MAC_GGML_BACKEND_DIR = '/tmp/cleevoice-ggml-bx'

let backendDirEnsured = false
let quarantineCleared = false

/**
 * Borra el xattr com.apple.quarantine de los binarios y libs bundleados.
 *
 * Cuando una app sin firma Developer ID se distribuye por DMG/internet, macOS
 * marca todos los archivos con com.apple.quarantine. Eso bloquea:
 *   1) El spawn del whisper-cli (a veces — depende de la versión de macOS)
 *   2) Más crítico: el dlopen de los .so de ggml. Cuando ggml intenta cargar
 *      los backends Metal/BLAS/CPU y todos están quarantined, dlopen falla
 *      silenciosamente para cada uno. Resultado: ggml_backend_dev_init recibe
 *      device==null y el binario crashea con GGML_ASSERT(device) failed.
 *
 * Limpiamos el xattr en runtime al primer uso. Funciona porque la app ya
 * está aprobada por Gatekeeper (el user hizo "Abrir igualmente"), entonces
 * tiene permiso de escribir sus propios archivos.
 *
 * Tambien limpiamos /tmp/cleevoice-ggml-bx porque ggml hace dlopen contra
 * esa ruta (el patch binario). Como esos son symlinks, en realidad lo que
 * se quarantine-a son los archivos target — limpiamos ambos por las dudas.
 *
 * Idempotente: si el xattr no está, el comando no falla.
 */
function clearQuarantineMac(): void {
  if (process.platform !== 'darwin' || quarantineCleared) return
  if (!app.isPackaged) {
    // En dev no hay quarantine, skipeamos.
    quarantineCleared = true
    return
  }

  const targets = [
    path.join(process.resourcesPath, 'whisper'),
    MAC_GGML_BACKEND_DIR // por las dudas si alguno de los symlink targets terminó marcado
  ].filter((p) => existsSync(p))

  for (const target of targets) {
    try {
      const result = spawnSync('/usr/bin/xattr', ['-dr', 'com.apple.quarantine', target], {
        stdio: ['ignore', 'pipe', 'pipe']
      })
      if (result.status === 0) {
        log.info(`Quarantine xattr limpiado de ${target}`)
      } else {
        log.warn(
          `xattr exit=${result.status} stderr=${result.stderr?.toString().slice(0, 200)}`
        )
      }
    } catch (err) {
      log.warn(`Quarantine cleanup falló en ${target}:`, err)
    }
  }
  quarantineCleared = true
}

function ensureMacBackendDir(): void {
  if (process.platform !== 'darwin' || backendDirEnsured) return

  const bundledLibexec = getBundledGgmlLibexecPath()
  if (!bundledLibexec || !existsSync(bundledLibexec)) {
    log.warn(`bundled ggml-libexec no encontrado en ${bundledLibexec}`)
    return
  }

  try {
    mkdirSync(MAC_GGML_BACKEND_DIR, { recursive: true })
    for (const file of readdirSync(bundledLibexec)) {
      if (!file.endsWith('.so')) continue
      const link = path.join(MAC_GGML_BACKEND_DIR, file)
      const target = path.join(bundledLibexec, file)
      try {
        // existsSync devuelve false para symlinks rotos. Usamos lstatSync
        // para detectar la entrada de filesystem en sí, así no chocamos
        // contra EEXIST cuando hay un symlink rojo de un build anterior.
        let exists = false
        try {
          lstatSync(link)
          exists = true
        } catch {
          /* no existe */
        }
        if (exists) unlinkSync(link)
        symlinkSync(target, link)
      } catch (err) {
        log.warn(`No se pudo symlink ${file}: ${String(err)}`)
      }
    }
    backendDirEnsured = true
    log.info(`ggml-backends symlinkeados en ${MAC_GGML_BACKEND_DIR}`)
  } catch (err) {
    log.error(`Setup de ggml-backend-dir falló: ${String(err)}`)
  }
}

function getBundledGgmlLibexecPath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'whisper', 'lib', 'ggml-libexec')
  }
  return path.join(app.getAppPath(), 'resources/whisper/lib/ggml-libexec')
}

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
  if (process.platform === 'win32') {
    // Layout Windows: resources/whisper-win/whisper-cli.exe + DLLs en mismo dir.
    if (app.isPackaged) {
      return path.join(process.resourcesPath, 'whisper-win', 'whisper-cli.exe')
    }
    return path.join(app.getAppPath(), 'resources/whisper-win', 'whisper-cli.exe')
  }
  // Mac: resources/whisper/whisper-cli-mac + lib/ + lib/ggml-libexec/.
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'whisper', 'whisper-cli-mac')
  }
  return path.join(app.getAppPath(), 'resources/whisper', 'whisper-cli-mac')
}

function getFallbackBinaryPath(): string | null {
  if (process.platform !== 'darwin') return null
  // Sólo usamos brew como fallback en dev en Mac. En empaquetado el bundle SIEMPRE
  // está, así que esta rama nunca debería dispararse en producción.
  const brewPath = '/opt/homebrew/bin/whisper-cli'
  if (existsSync(brewPath)) return brewPath
  const intelBrewPath = '/usr/local/bin/whisper-cli'
  if (existsSync(intelBrewPath)) return intelBrewPath
  return null
}

export function resolveWhisperBinary(): string {
  const bundled = getBundledBinaryPath()
  if (existsSync(bundled)) return bundled
  // En empaquetado no caemos a brew — si el bundle falta es un bug de build.
  if (!app.isPackaged) {
    const fallback = getFallbackBinaryPath()
    if (fallback) return fallback
  }
  throw new Error(
    `whisper-cli no encontrado. Esperado en ${bundled}. ` +
      (process.platform === 'darwin'
        ? 'Corré: npm run bundle:whisper:mac (requiere brew install whisper-cpp).'
        : 'Corré: npm run bundle:whisper:win (descarga la release oficial).')
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

  // Si quien llama no pasó un prompt explícito, usamos el prompt-context bake-in
  // de JoinsClee. Cualquier valor explícito (vacío incluido) lo respeta.
  const effectivePrompt = options.prompt ?? getInitialPrompt(language)

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
  if (effectivePrompt && effectivePrompt.trim().length > 0) {
    args.push('--prompt', effectivePrompt)
  }

  // Mac: limpieza preventiva antes de cada spawn.
  //   1) xattr -d com.apple.quarantine — necesario para que Gatekeeper no
  //      mate el binario en apps sin firma Developer ID.
  //   2) /tmp/cleevoice-ggml-bx con symlinks a los backends del bundle.
  clearQuarantineMac()
  ensureMacBackendDir()

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

/**
 * Pre-warming: corre el cleanup de quarantine + setup del backend dir
 * inmediatamente al boot, no al primer dictado. Así el primer ⌘+Shift+Espacio
 * no tiene una latencia extra de ~100ms para limpiar xattrs.
 */
export function prewarmWhisper(): void {
  clearQuarantineMac()
  ensureMacBackendDir()
}

export { getModelPath, ensureModel, type WhisperModel }
