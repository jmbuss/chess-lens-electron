import Database from 'better-sqlite3'
import path from 'node:path'
import { app } from 'electron'
import type { BaseModel } from './models/BaseModel'

/**
 * Root database service class that manages SQLite connection
 * and initializes all registered models
 */
export class DatabaseService {
  private db: Database.Database

  private models: BaseModel[]

  constructor(models: BaseModel[] = []) {
    this.models = models

    // Get the database path in the user's data directory
    const userDataPath = app.getPath('userData')
    const dbPath = path.join(userDataPath, 'chess-lens.db')
    console.log('dbPath', dbPath)

    // Open or create the database
    this.db = new Database(dbPath)

    // Enable foreign keys
    this.db.pragma('foreign_keys = ON')

    // Initialize all models
    this.initializeModels()
  }

  /**
   * Initialize all registered models by calling their initializeTables methods
   */
  private initializeModels(): void {
    for (const model of this.models) {
      model.initializeTables(this.db)
    }
  }

  /**
   * Get the database instance
   */
  getDatabase(): Database.Database {
    return this.db
  }

  /**
   * Close the database connection
   */
  close(): void {
    this.db.close()
  }
}
