import type Database from 'better-sqlite3'
import type { BaseModel } from '../models/BaseModel'
import type { VectorInsertRow, KnnResult } from './types'

export const POSITIONAL_VECTOR_DIM = 75

const VEC_SCHEMA_VERSION = 3

/** Raw float bytes for vec_f32 / MATCH; vec0 needs proper float32 vectors, not untyped BLOBs. */
function float32ArrayToBlob(v: Float32Array): Buffer {
  return Buffer.from(v.buffer, v.byteOffset, v.byteLength)
}

function rowidBinding(id: number): bigint {
  return BigInt(Math.trunc(id))
}

export class VectorModel implements BaseModel {
  initializeTables(db: Database.Database): void {
    db.exec(`
      CREATE TABLE IF NOT EXISTS vector_metadata (
        table_name TEXT PRIMARY KEY,
        dimensions INTEGER NOT NULL,
        schema_version INTEGER NOT NULL DEFAULT 1
      )
    `)

    try {
      db.exec(`ALTER TABLE vector_metadata ADD COLUMN schema_version INTEGER NOT NULL DEFAULT 1`)
    } catch {
      // Column already exists
    }

    this.ensureVecTable(db, 'positional_vectors', POSITIONAL_VECTOR_DIM)
    this.dropLegacyTable(db, 'structural_vectors')
  }

  private ensureVecTable(db: Database.Database, tableName: string, expectedDim: number): void {
    const meta = db.prepare(
      'SELECT dimensions, schema_version FROM vector_metadata WHERE table_name = ?',
    ).get(tableName) as { dimensions: number; schema_version: number } | undefined

    const needsRebuild =
      !meta ||
      meta.dimensions !== expectedDim ||
      (meta.schema_version ?? 1) < VEC_SCHEMA_VERSION

    if (needsRebuild) {
      db.exec(`DROP TABLE IF EXISTS ${tableName}`)
      db.prepare('DELETE FROM vector_metadata WHERE table_name = ?').run(tableName)

      db.exec(`
        CREATE VIRTUAL TABLE ${tableName} USING vec0(
          embedding float[${expectedDim}]
        )
      `)

      db.prepare(`
        INSERT INTO vector_metadata (table_name, dimensions, schema_version)
        VALUES (?, ?, ?)
      `).run(tableName, expectedDim, VEC_SCHEMA_VERSION)
    }
  }

  private dropLegacyTable(db: Database.Database, tableName: string): void {
    db.exec(`DROP TABLE IF EXISTS ${tableName}`)
    db.prepare('DELETE FROM vector_metadata WHERE table_name = ?').run(tableName)
  }

  static insertPositionalBatch(db: Database.Database, rows: VectorInsertRow[]): void {
    const stmt = db.prepare(`
      INSERT INTO positional_vectors (rowid, embedding)
      VALUES (?, vec_f32(?))
    `)
    for (const row of rows) {
      const rowid = Number(row.positionIndexId)
      const buf = float32ArrayToBlob(row.vector)
      stmt.run(rowidBinding(rowid), buf)
    }
  }

  static deleteByPositionIndexIds(db: Database.Database, ids: number[]): void {
    if (ids.length === 0) return
    for (const id of ids) {
      const rid = rowidBinding(Number(id))
      db.prepare('DELETE FROM positional_vectors WHERE rowid = ?').run(rid)
    }
  }

  static knnPositional(db: Database.Database, queryVector: Float32Array, k: number): KnnResult[] {
    return db.prepare(`
      SELECT rowid AS position_index_id, distance
      FROM positional_vectors
      WHERE embedding MATCH vec_f32(?)
      ORDER BY distance
      LIMIT ?
    `).all(float32ArrayToBlob(queryVector), k) as KnnResult[]
  }
}
