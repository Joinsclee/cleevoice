import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

/**
 * Bridge main ↔ renderer. Crece por fases (ver ROADMAP.md):
 *   Fase 1: onToggleRecording                                  ← ESTAMOS AQUÍ
 *   Fase 2: audioReady(buffer)
 *   Fase 5: getSettings / setSettings
 *   Fase 8: history.list / history.delete
 */

export interface ToggleRecordingPayload {
  active: boolean
}

type ToggleRecordingCallback = (payload: ToggleRecordingPayload) => void

const api = {
  appName: 'CleeVoice',
  version: '0.1.0',

  /**
   * Se suscribe a los eventos start/stop del overlay que dispara el main process
   * tras un hotkey global. Devuelve un unsubscribe para limpiar en React effects.
   */
  onToggleRecording(callback: ToggleRecordingCallback): () => void {
    const handler = (_e: Electron.IpcRendererEvent, payload: ToggleRecordingPayload): void => {
      callback(payload)
    }
    ipcRenderer.on('toggle-recording', handler)
    return () => ipcRenderer.removeListener('toggle-recording', handler)
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
