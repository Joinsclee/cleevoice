import { app } from 'electron'
import { promises as fs, existsSync } from 'node:fs'
import path from 'node:path'
import ffmpegStaticImport from 'ffmpeg-static'
import ffmpeg from 'fluent-ffmpeg'
import log from 'electron-log/main'

/**
 * Captura y conversión de audio.
 *
 * Flujo (Fase 2):
 *  1) El renderer del overlay graba con MediaRecorder en webm/opus.
 *  2) Al detener, manda el ArrayBuffer al main vía IPC ('audio-ready').
 *  3) Aquí escribimos el blob a un .webm temporal y lo convertimos a WAV
 *     16kHz mono PCM s16le — el formato que espera whisper.cpp en Fase 3.
 *  4) Devolvemos el path del WAV y la duración estimada en ms.
 *
 * El .webm temporal se borra después de la conversión exitosa.
 */

// ffmpeg-static expone el path al binario empaquetado por plataforma.
// En prod con asar enabled, el path real está fuera del asar (app.asar.unpacked).
// El reemplazo es no-op en dev (no hay 'app.asar' en el path de node_modules).
const ffmpegStatic = ffmpegStaticImport as unknown as string | null

function resolveFfmpegPath(): string | null {
  if (!ffmpegStatic) return null
  // electron-builder pone los binarios nativos en app.asar.unpacked cuando
  // el archivo está marcado en asarUnpack (ver electron-builder.yml).
  return ffmpegStatic.replace('app.asar', 'app.asar.unpacked')
}

const ffmpegPath = resolveFfmpegPath()
if (ffmpegPath && existsSync(ffmpegPath)) {
  ffmpeg.setFfmpegPath(ffmpegPath)
  log.info(`ffmpeg binary: ${ffmpegPath}`)
} else {
  log.error(`ffmpeg binary no encontrado. Path intentado: ${ffmpegPath}`)
}

export interface SavedAudio {
  wavPath: string
  durationMs: number
  sizeBytes: number
}

/**
 * Recibe el ArrayBuffer crudo del MediaRecorder (webm/opus) y devuelve
 * un .wav 16kHz mono PCM s16le listo para whisper.cpp.
 */
export async function saveAndConvertWebm(buffer: ArrayBuffer): Promise<SavedAudio> {
  if (!ffmpegPath || !existsSync(ffmpegPath)) {
    throw new Error('ffmpeg no disponible para convertir audio')
  }

  const tempDir = app.getPath('temp')
  const stamp = Date.now()
  const webmPath = path.join(tempDir, `cleevoice-${stamp}.webm`)
  const wavPath = path.join(tempDir, `cleevoice-${stamp}.wav`)

  await fs.writeFile(webmPath, Buffer.from(buffer))

  const start = Date.now()
  await new Promise<void>((resolve, reject) => {
    ffmpeg(webmPath)
      .audioChannels(1)
      .audioFrequency(16000)
      .audioCodec('pcm_s16le')
      .format('wav')
      .on('error', (err) => {
        log.error('ffmpeg falló convirtiendo webm→wav', err)
        reject(err)
      })
      .on('end', () => resolve())
      .save(wavPath)
  })

  // Limpiamos el .webm intermedio. Si falla el unlink (raro), seguimos.
  await fs.unlink(webmPath).catch(() => undefined)

  const stat = await fs.stat(wavPath)
  // Duración estimada por bytes: 16000 muestras/s · 2 bytes/muestra = 32000 bytes/s.
  // Restamos ~44 bytes del header WAV.
  const durationMs = Math.max(0, Math.round(((stat.size - 44) / 32000) * 1000))

  log.info(
    `Audio guardado: ${wavPath} (${stat.size}B, ~${(durationMs / 1000).toFixed(1)}s, ` +
      `conversión ${Date.now() - start}ms)`
  )

  return { wavPath, durationMs, sizeBytes: stat.size }
}
