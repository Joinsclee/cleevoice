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

export type Engine = 'local' | 'groq'
export type ModelName = 'tiny' | 'base' | 'small' | 'medium'
export type Language = 'es' | 'en' | 'pt' | 'fr'
export type CleanupTone = 'general' | 'profesional' | 'casual' | 'tecnico'

export interface CleeVoiceSettings {
  hotkey: string
  engine: Engine
  model: ModelName
  language: Language
  autostart: boolean
  showNotifications: boolean
  cleanupEnabled: boolean
  cleanupTone: CleanupTone
  groqApiKey: string
  customPrompt: string
  cleanupSystemPrompt: string
  dictionary: string[]
  onboarded: boolean
}

export interface ModelInfo {
  name: ModelName
  sizeMb: number
  downloaded: boolean
  path: string
}

export interface SettingsApi {
  getAll(): Promise<CleeVoiceSettings>
  update(patch: Partial<CleeVoiceSettings>): Promise<CleeVoiceSettings>
  reset(): Promise<CleeVoiceSettings>
  onChanged(callback: (settings: CleeVoiceSettings) => void): () => void
}

export interface ModelsApi {
  list(): Promise<ModelInfo[]>
  download(name: ModelName): Promise<{ ok: boolean; path?: string; error?: string }>
  delete(name: ModelName): Promise<{ ok: boolean; error?: string }>
}

export interface GroqApi {
  testKey(plainKey: string): Promise<{ ok: boolean; status?: number; message?: string }>
  hasKey(): Promise<boolean>
}

export interface TranscriptionRow {
  id: number
  created_at: number
  duration_ms: number
  app_name: string | null
  raw_text: string
  cleaned_text: string | null
  engine: string
  model: string
  language: string
}

export interface HistoryStats {
  totalCount: number
  totalWords: number
  totalSeconds: number
  estimatedSavedMinutes: number
}

export interface HistoryApi {
  list(opts?: { limit?: number; offset?: number; search?: string }): Promise<TranscriptionRow[]>
  remove(id: number): Promise<boolean>
  clear(): Promise<number>
  stats(): Promise<HistoryStats>
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
  onCleaningStarted(callback: () => void): () => void
  onCleaned(callback: (payload: { text: string; durationMs: number }) => void): () => void
  onModelDownloadProgress(callback: (payload: ModelDownloadPayload) => void): () => void
  onPastingStarted(callback: () => void): () => void
  onPasted(callback: (payload: PastedPayload) => void): () => void
  openAccessibilitySettings(): void
  settings: SettingsApi
  models: ModelsApi
  groq: GroqApi
  history: HistoryApi
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: CleeVoiceApi
  }
}

export {}
