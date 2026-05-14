import type { ElectronAPI } from '@electron-toolkit/preload'

/**
 * Tipos del bridge expuesto en window.api. Duplicamos shape (no `typeof` del index.ts)
 * para que el renderer no compile el preload — sólo necesita los types.
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

export interface PastedPayload {
  ok: boolean
  reason?: 'no-accessibility' | 'applescript-error' | 'unsupported-platform'
}

export interface CleeVoiceApi {
  appName: string
  version: string
  onToggleRecording(callback: (payload: RecordingStatePayload) => void): () => void
  onStartRecording(callback: () => void): () => void
  onStopRecording(callback: () => void): () => void
  audioReady(payload: AudioReadyPayload): Promise<AudioSavedResult>
  audioError(message: string): void
  onTranscribingStarted(callback: () => void): () => void
  onTranscribed(callback: (payload: TranscribedPayload) => void): () => void
  onTranscribeError(callback: (message: string) => void): () => void
  onModelDownloadProgress(callback: (payload: ModelDownloadPayload) => void): () => void
  onPastingStarted(callback: () => void): () => void
  onPasted(callback: (payload: PastedPayload) => void): () => void
  openAccessibilitySettings(): void
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: CleeVoiceApi
  }
}

export {}
