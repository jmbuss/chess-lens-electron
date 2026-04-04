import type Database from 'better-sqlite3'

/**
 * Base interface for database models
 * Each model must implement idempotent table creation for its domain.
 */
export interface BaseModel {
  /**
   * Create tables and indexes if they do not exist (`CREATE TABLE IF NOT EXISTS`, etc.).
   * @param db - The SQLite database instance
   */
  initializeTables(db: Database.Database): void
}
