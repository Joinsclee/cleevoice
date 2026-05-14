import type { ElectronAPI } from '@electron-toolkit/preload'

/**
 * Tipos del bridge expuesto en window.api.
 *
 * Mantenemos el shape duplicado intencionalmente (no `typeof` del index.ts)
 * para que el proyecto del renderer (tsconfig.web.json) no tenga que compilar
 * el preload — sólo necesita los types.
 */
export interface CleeVoiceApi {
  appName: string
  version: string
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: CleeVoiceApi
  }
}

export {}
