import type { ElectronAPI } from '@electron-toolkit/preload'

/**
 * Tipos del bridge expuesto en window.api.
 *
 * Mantenemos el shape duplicado intencionalmente (no `typeof` del index.ts)
 * para que el proyecto del renderer (tsconfig.web.json) no tenga que compilar
 * el preload — sólo necesita los types.
 */
export interface RecordingStatePayload {
  active: boolean
}

export interface AudioReadyPayload {
  buffer: ArrayBuffer
  mimeType: string
}

export interface AudioSavedResult {
  wavPath: string
  durationMs: number
}

export interface CleeVoiceApi {
  appName: string
  version: string
  onToggleRecording(callback: (payload: RecordingStatePayload) => void): () => void
  onStartRecording(callback: () => void): () => void
  onStopRecording(callback: () => void): () => void
  audioReady(payload: AudioReadyPayload): Promise<AudioSavedResult>
  audioError(message: string): void
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: CleeVoiceApi
  }
}

export {}
