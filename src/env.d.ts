/// <reference types="vite/client" />
/// <reference types="@electron-forge/plugin-vite/forge-vite-env" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'

  const component: DefineComponent<{}, {}, any>
  export default component
}

// Electron Forge Vite plugin injects these at build time
declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined
declare const MAIN_WINDOW_VITE_NAME: string

// Electron API exposed via preload script; ipcService attached by renderer
declare global {
  interface Window {
    electronAPI: {
      send: <T = any>(channel: string, request?: any) => Promise<T>
      emit: (channel: string, request?: any) => void
      on: (channel: string, callback: (event: any, ...args: any[]) => void) => void
      off: (channel: string, callback: (event: any, ...args: any[]) => void) => void
    }
    ipcService?: import('src/ipc/IPCService').IpcService
  }
}
