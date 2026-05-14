import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

/**
 * Bridge main ↔ renderer. Crece por fases (ver ROADMAP.md):
 *   Fase 1: onToggleRecording                                  ✓
 *   Fase 2: onStartRecording / onStopRecording / audioReady    ✓
 *   Fase 3: onTranscribed / onTranscribeError / onModelProgress ← ESTAMOS AQUÍ
 *   Fase 5: getSettings / setSettings
 *   Fase 8: history.list / history.delete
 */

export interface RecordingStatePayload {
  active: boolean
}

export interface AudioReadyPayload {
  buffer: ArrayBuffer
  mimeType: string
}

export interface TranscribedPayload {
  text: string
  durationMs: number
  engine: 'local' | 'groq'
  model: string
}

export interface ModelDownloadPayload {
  model: string
  percent: number
  receivedBytes: number
  totalBytes: number
}

const api = {
  appName: 'CleeVoice',
  version: '0.1.0',

  /** Cambio de estado de grabación (idle ↔ recording). */
  onToggleRecording(callback: (payload: RecordingStatePayload) => void): () => void {
    const handler = (_e: Electron.IpcRendererEvent, payload: RecordingStatePayload): void =>
      callback(payload)
    ipcRenderer.on('toggle-recording', handler)
    return () => ipcRenderer.removeListener('toggle-recording', handler)
  },

  /** Comando del main: iniciá el MediaRecorder. */
  onStartRecording(callback: () => void): () => void {
    const handler = (): void => callback()
    ipcRenderer.on('start-recording', handler)
    return () => ipcRenderer.removeListener('start-recording', handler)
  },

  /** Comando del main: detené el MediaRecorder. */
  onStopRecording(callback: () => void): () => void {
    const handler = (): void => callback()
    ipcRenderer.on('stop-recording', handler)
    return () => ipcRenderer.removeListener('stop-recording', handler)
  },

  /** El renderer envía el blob crudo y recibe el path del WAV. */
  audioReady(payload: AudioReadyPayload): Promise<{ wavPath: string; durationMs: number }> {
    return ipcRenderer.invoke('audio-ready', payload)
  },

  /** Notifica al main si el MediaRecorder falló. */
  audioError(message: string): void {
    ipcRenderer.send('audio-error', message)
  },

  /** Notifica al renderer que arrancó la transcripción (entre stop y resultado). */
  onTranscribingStarted(callback: () => void): () => void {
    const handler = (): void => callback()
    ipcRenderer.on('transcribing-started', handler)
    return () => ipcRenderer.removeListener('transcribing-started', handler)
  },

  /** Texto transcrito final (camino feliz). */
  onTranscribed(callback: (payload: TranscribedPayload) => void): () => void {
    const handler = (_e: Electron.IpcRendererEvent, payload: TranscribedPayload): void =>
      callback(payload)
    ipcRenderer.on('transcribed', handler)
    return () => ipcRenderer.removeListener('transcribed', handler)
  },

  /** La transcripción falló — el overlay muestra el mensaje. */
  onTranscribeError(callback: (message: string) => void): () => void {
    const handler = (_e: Electron.IpcRendererEvent, message: string): void => callback(message)
    ipcRenderer.on('transcribe-error', handler)
    return () => ipcRenderer.removeListener('transcribe-error', handler)
  },

  /** Progreso de descarga del modelo (primer arranque). */
  onModelDownloadProgress(callback: (payload: ModelDownloadPayload) => void): () => void {
    const handler = (_e: Electron.IpcRendererEvent, payload: ModelDownloadPayload): void =>
      callback(payload)
    ipcRenderer.on('model-download-progress', handler)
    return () => ipcRenderer.removeListener('model-download-progress', handler)
  }
}

try {
  contextBridge.exposeInMainWorld('electron', electronAPI)
  contextBridge.exposeInMainWorld('api', api)
} catch (error) {
  // contextBridge falla si contextIsolation está desactivado. En este proyecto SIEMPRE
  // está activado (ver main/index.ts), así que esto sólo ocurriría por bug de config.
  // eslint-disable-next-line no-console
  console.error('contextBridge no disponible:', error)
}

export type ExposedApi = typeof api
