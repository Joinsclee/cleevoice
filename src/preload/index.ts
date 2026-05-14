import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

/**
 * Bridge main ↔ renderer. Crece por fases (ver ROADMAP.md):
 *   Fase 1: onToggleRecording                                  ✓
 *   Fase 2: onStartRecording / onStopRecording / audioReady    ✓
 *   Fase 3: onTranscribed / onTranscribeError / onModelProgress ✓
 *   Fase 4: onPastingStarted / onPasted / openAccessibility    ✓
 *   Fase 5: settings.get/set + models.list/download/delete      ← ESTAMOS AQUÍ
 *   Fase 6: groq.testKey
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

  // ─── Recording / overlay events ─────────────────────────────────────────────
  onToggleRecording(callback: (payload: RecordingStatePayload) => void): () => void {
    const handler = (_e: Electron.IpcRendererEvent, payload: RecordingStatePayload): void =>
      callback(payload)
    ipcRenderer.on('toggle-recording', handler)
    return () => ipcRenderer.removeListener('toggle-recording', handler)
  },
  onStartRecording(callback: () => void): () => void {
    const handler = (): void => callback()
    ipcRenderer.on('start-recording', handler)
    return () => ipcRenderer.removeListener('start-recording', handler)
  },
  onStopRecording(callback: () => void): () => void {
    const handler = (): void => callback()
    ipcRenderer.on('stop-recording', handler)
    return () => ipcRenderer.removeListener('stop-recording', handler)
  },
  audioReady(payload: AudioReadyPayload): Promise<{ wavPath: string; durationMs: number }> {
    return ipcRenderer.invoke('audio-ready', payload)
  },
  audioError(message: string): void {
    ipcRenderer.send('audio-error', message)
  },
  onTranscribingStarted(callback: () => void): () => void {
    const handler = (): void => callback()
    ipcRenderer.on('transcribing-started', handler)
    return () => ipcRenderer.removeListener('transcribing-started', handler)
  },
  onTranscribed(callback: (payload: TranscribedPayload) => void): () => void {
    const handler = (_e: Electron.IpcRendererEvent, payload: TranscribedPayload): void =>
      callback(payload)
    ipcRenderer.on('transcribed', handler)
    return () => ipcRenderer.removeListener('transcribed', handler)
  },
  onTranscribeError(callback: (message: string) => void): () => void {
    const handler = (_e: Electron.IpcRendererEvent, message: string): void => callback(message)
    ipcRenderer.on('transcribe-error', handler)
    return () => ipcRenderer.removeListener('transcribe-error', handler)
  },
  onModelDownloadProgress(callback: (payload: ModelDownloadPayload) => void): () => void {
    const handler = (_e: Electron.IpcRendererEvent, payload: ModelDownloadPayload): void =>
      callback(payload)
    ipcRenderer.on('model-download-progress', handler)
    return () => ipcRenderer.removeListener('model-download-progress', handler)
  },
  onPastingStarted(callback: () => void): () => void {
    const handler = (): void => callback()
    ipcRenderer.on('pasting-started', handler)
    return () => ipcRenderer.removeListener('pasting-started', handler)
  },
  onPasted(callback: (payload: { ok: boolean; reason?: string }) => void): () => void {
    const handler = (
      _e: Electron.IpcRendererEvent,
      payload: { ok: boolean; reason?: string }
    ): void => callback(payload)
    ipcRenderer.on('pasted', handler)
    return () => ipcRenderer.removeListener('pasted', handler)
  },
  openAccessibilitySettings(): void {
    ipcRenderer.send('open-accessibility-settings')
  },

  // ─── Settings (Fase 5) ──────────────────────────────────────────────────────
  settings: {
    getAll(): Promise<Record<string, unknown>> {
      return ipcRenderer.invoke('settings:getAll')
    },
    update(patch: Record<string, unknown>): Promise<Record<string, unknown>> {
      return ipcRenderer.invoke('settings:update', patch)
    },
    reset(): Promise<Record<string, unknown>> {
      return ipcRenderer.invoke('settings:reset')
    },
    onChanged(callback: (settings: Record<string, unknown>) => void): () => void {
      const handler = (
        _e: Electron.IpcRendererEvent,
        settings: Record<string, unknown>
      ): void => callback(settings)
      ipcRenderer.on('settings:changed', handler)
      return () => ipcRenderer.removeListener('settings:changed', handler)
    }
  },

  // ─── Modelos (Fase 5) ───────────────────────────────────────────────────────
  models: {
    list(): Promise<
      { name: string; sizeMb: number; downloaded: boolean; path: string }[]
    > {
      return ipcRenderer.invoke('models:list')
    },
    download(name: string): Promise<{ ok: boolean; path?: string; error?: string }> {
      return ipcRenderer.invoke('models:download', name)
    },
    delete(name: string): Promise<{ ok: boolean; error?: string }> {
      return ipcRenderer.invoke('models:delete', name)
    }
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

// Re-exportamos los tipos del .d.ts para que los componentes del renderer puedan
// importarlos como `import type { CleeVoiceSettings } from '../../preload'`.
export type {
  CleeVoiceSettings,
  ModelInfo,
  ModelName,
  Language,
  Engine,
  SettingsApi,
  ModelsApi,
  PastedPayload
} from './index.d'
