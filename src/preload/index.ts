import { contextBridge } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

/**
 * Bridge main ↔ renderer. En Fase 0 sólo exponemos las utilidades base del toolkit
 * (versión de Electron, helpers de IPC). En las siguientes fases agregaremos:
 *   - onToggleRecording / onStartRecording / onStopRecording   (Fase 1-2)
 *   - audioReady(buffer)                                       (Fase 2)
 *   - getSettings / setSettings                                (Fase 5)
 *   - history.list / history.delete                            (Fase 8)
 */
const api = {
  appName: 'CleeVoice',
  version: '0.1.0'
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
