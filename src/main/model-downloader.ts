import { app, Notification } from 'electron'
import { promises as fs, createWriteStream, existsSync } from 'node:fs'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'
import { Readable } from 'node:stream'
import log from 'electron-log/main'

/**
 * Descarga el modelo Whisper local desde Hugging Face si no existe.
 *
 * Catálogo de modelos (ver ARCHITECTURE.md):
 *   - tiny    ~75 MB   ⭐⭐
 *   - base   ~140 MB   ⭐⭐⭐    (default Fase 3)
 *   - small  ~460 MB   ⭐⭐⭐⭐
 *   - medium ~1.5 GB   ⭐⭐⭐⭐⭐
 *
 * Persistencia: app.getPath('userData')/models/ggml-<name>.bin
 *  - macOS: ~/Library/Application Support/cleevoice/models/
 *  - Win:   %APPDATA%/cleevoice/models/
 */

export type WhisperModel = 'tiny' | 'base' | 'small' | 'medium'

interface ModelMeta {
  fileName: string
  url: string
  approxSizeMb: number
}

const MODELS: Record<WhisperModel, ModelMeta> = {
  tiny: {
    fileName: 'ggml-tiny.bin',
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin',
    approxSizeMb: 75
  },
  base: {
    fileName: 'ggml-base.bin',
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin',
    approxSizeMb: 140
  },
  small: {
    fileName: 'ggml-small.bin',
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin',
    approxSizeMb: 460
  },
  medium: {
    fileName: 'ggml-medium.bin',
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-medium.bin',
    approxSizeMb: 1500
  }
}

export function getModelsDir(): string {
  return path.join(app.getPath('userData'), 'models')
}

export function getModelPath(model: WhisperModel): string {
  return path.join(getModelsDir(), MODELS[model].fileName)
}

export function isModelReady(model: WhisperModel): boolean {
  const p = getModelPath(model)
  return existsSync(p)
}

/**
 * Estado in-memory de la descarga en curso (uno a la vez). Permite cero descargas
 * duplicadas si dos disparos de grabación coinciden mientras el modelo aún baja.
 */
let inFlight: Promise<string> | null = null

export interface DownloadProgress {
  model: WhisperModel
  receivedBytes: number
  totalBytes: number
  percent: number
}

type ProgressListener = (p: DownloadProgress) => void
const listeners = new Set<ProgressListener>()

export function onDownloadProgress(cb: ProgressListener): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

function emitProgress(p: DownloadProgress): void {
  for (const cb of listeners) {
    try {
      cb(p)
    } catch (err) {
      log.warn('Listener de progreso lanzó error', err)
    }
  }
}

export async function ensureModel(model: WhisperModel = 'base'): Promise<string> {
  const finalPath = getModelPath(model)
  if (existsSync(finalPath)) {
    log.debug(`Modelo ${model} ya existe: ${finalPath}`)
    return finalPath
  }

  if (inFlight) {
    log.info(`Descarga ya en curso, esperando…`)
    return inFlight
  }

  inFlight = downloadModel(model)
    .then((p) => {
      inFlight = null
      return p
    })
    .catch((err) => {
      inFlight = null
      throw err
    })

  return inFlight
}

async function downloadModel(model: WhisperModel): Promise<string> {
  const meta = MODELS[model]
  const dir = getModelsDir()
  const finalPath = getModelPath(model)
  const tmpPath = `${finalPath}.partial`

  await fs.mkdir(dir, { recursive: true })

  log.info(`Descargando modelo ${model} (~${meta.approxSizeMb}MB) desde ${meta.url}`)
  if (Notification.isSupported()) {
    new Notification({
      title: 'CleeVoice: descargando modelo',
      body: `Modelo "${model}" (~${meta.approxSizeMb}MB). Esto sólo pasa la primera vez.`,
      silent: false
    }).show()
  }

  const res = await fetch(meta.url, { redirect: 'follow' })
  if (!res.ok || !res.body) {
    throw new Error(`Fallo HTTP ${res.status} al descargar ${meta.url}`)
  }

  const totalHeader = res.headers.get('content-length')
  const totalBytes = totalHeader ? parseInt(totalHeader, 10) : meta.approxSizeMb * 1024 * 1024
  let receivedBytes = 0
  let lastEmitPercent = -1

  const ws = createWriteStream(tmpPath)
  const reader = Readable.fromWeb(res.body as never)
  reader.on('data', (chunk: Buffer) => {
    receivedBytes += chunk.length
    const percent = Math.min(100, Math.floor((receivedBytes / totalBytes) * 100))
    if (percent !== lastEmitPercent && percent % 2 === 0) {
      lastEmitPercent = percent
      emitProgress({ model, receivedBytes, totalBytes, percent })
    }
  })

  try {
    await pipeline(reader, ws)
  } catch (err) {
    await fs.unlink(tmpPath).catch(() => undefined)
    throw err
  }

  await fs.rename(tmpPath, finalPath)
  emitProgress({ model, receivedBytes: totalBytes, totalBytes, percent: 100 })
  log.info(`Modelo ${model} listo: ${finalPath}`)

  if (Notification.isSupported()) {
    new Notification({
      title: 'CleeVoice: modelo listo',
      body: `"${model}" descargado. Ya podés dictar.`,
      silent: false
    }).show()
  }

  return finalPath
}
