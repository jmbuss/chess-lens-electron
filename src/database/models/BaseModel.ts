import type Database from 'better-sqlite3'

/**
 * Base interface for database models
 * Each model must implement a method to create/migrate its tables
 */
export interface BaseModel {
  /**
   * Initialize the model's tables. This method should create tables
   * if they don't exist and handle any necessary migrations.
   * @param db - The SQLite database instance
   */
  initializeTables(db: Database.Database): void
}
