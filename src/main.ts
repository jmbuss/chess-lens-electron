import { app, BrowserWindow } from 'electron'
import path from 'node:path'
import started from 'electron-squirrel-startup'
import { registerApi } from './api/register'
import { database } from './database'
import { ipcHandlerRegistry } from './ipc'
import { initEngineManager, shutdownEngines } from './services/engine/manager'
import { eventBus } from './events'
import { GameAnalysisScheduler } from './services/analysis/GameAnalysisScheduler'
import { PositionQueueManager } from './services/analysis/PositionQueueManager'
import { AnalysisOrchestrator } from './services/analysis/AnalysisOrchestrator'
import { SyncCoordinator } from './services/sync/SyncCoordinator'
import './events/app'

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit()
}

const createWindow = (): BrowserWindow => {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  })

  // and load the index.html of the app.
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL)
  } else {
    mainWindow.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`))
  }

  if (!app.isPackaged) {
    mainWindow.webContents.openDevTools()
  }

  return mainWindow
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', () => {
  initEngineManager()
  const db = database.getDatabase()

  // Services that need to be wired before registerApi so handlers can reference them.
  new GameAnalysisScheduler(db, eventBus)
  const positionQueueManager = new PositionQueueManager(db, eventBus)

  const mainWindow = createWindow()

  const orchestrator = new AnalysisOrchestrator(db, eventBus, positionQueueManager, mainWindow.webContents)
  new SyncCoordinator(db, eventBus, mainWindow.webContents)

  registerApi({ ipcHandlerRegistry, db, bus: eventBus, orchestrator, positionQueueManager })

  // Emitted after createWindow so the renderer is alive for progress events
  eventBus.emit('app:started', undefined)
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// Close database connection and shut down engines when app quits
app.on('before-quit', async () => {
  await shutdownEngines()
  database.close()
})

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and import them here.
