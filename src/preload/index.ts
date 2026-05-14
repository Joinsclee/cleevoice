import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

/**
 * Bridge main ↔ renderer. Crece por fases (ver ROADMAP.md):
 *   Fase 1: onToggleRecording                                  ✓
 *   Fase 2: onStartRecording / onStopRecording / audioReady    ← ESTAMOS AQUÍ
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

type StateCallback = (payload: RecordingStatePayload) => void
type CommandCallback = () => void

const api = {
  appName: 'CleeVoice',
  version: '0.1.0',

  /**
   * Suscripción al cambio de estado de grabación (idle ↔ recording).
   * Útil para la UI del overlay que sólo necesita saber "estoy on/off".
   */
  onToggleRecording(callback: StateCallback): () => void {
    const handler = (_e: Electron.IpcRendererEvent, payload: RecordingStatePayload): void => {
      callback(payload)
    }
    ipcRenderer.on('toggle-recording', handler)
    return () => ipcRenderer.removeListener('toggle-recording', handler)
  },

  /** Comando explícito del main al renderer para iniciar el MediaRecorder. */
  onStartRecording(callback: CommandCallback): () => void {
    const handler = (): void => callback()
    ipcRenderer.on('start-recording', handler)
    return () => ipcRenderer.removeListener('start-recording', handler)
  },

  /** Comando explícito del main al renderer para detener el MediaRecorder. */
  onStopRecording(callback: CommandCallback): () => void {
    const handler = (): void => callback()
    ipcRenderer.on('stop-recording', handler)
    return () => ipcRenderer.removeListener('stop-recording', handler)
  },

  /**
   * El renderer manda el blob de audio crudo (ArrayBuffer) al main para que lo
   * convierta a WAV. El main responde con el path del WAV generado.
   */
  audioReady(payload: AudioReadyPayload): Promise<{ wavPath: string; durationMs: number }> {
    return ipcRenderer.invoke('audio-ready', payload)
  },

  /** Permite al renderer notificar errores del MediaRecorder al main process. */
  audioError(message: string): void {
    ipcRenderer.send('audio-error', message)
  }
}

try {
  contextBridge.exposeInMainWorld('electron', electronAPI)
  contextBridge.exposeInMainWorld('api', api)
} catch (error) {
  // contextBridge falla si contextIsolation está desactivado.
  // En este proyecto SIEMPRE está activado (ver main/index.ts), así que esto sólo
  // ocurriría por un bug de configuración. Lo logueamos en consola en vez de crashear.
  // eslint-disable-next-line no-console
  console.error('contextBridge no disponible:', error)
}

export type ExposedApi = typeof api
