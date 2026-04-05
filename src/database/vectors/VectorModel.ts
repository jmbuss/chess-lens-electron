import type Database from 'better-sqlite3'
import type { BaseModel } from '../models/BaseModel'
import type { VectorInsertRow, KnnResult } from './types'

export const POSITIONAL_VECTOR_DIM = 33
export const STRUCTURAL_VECTOR_DIM = 768

// Increment this when the vec0 schema changes to force a rebuild of all vec tables.
const VEC_SCHEMA_VERSION = 2

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

    // Add schema_version column to existing installs that don't have it yet
    try {
      db.exec(`ALTER TABLE vector_metadata ADD COLUMN schema_version INTEGER NOT NULL DEFAULT 1`)
    } catch {
      // Column already exists -- safe to ignore
    }

    this.ensureVecTable(db, 'positional_vectors', POSITIONAL_VECTOR_DIM)
    this.ensureVecTable(db, 'structural_vectors', STRUCTURAL_VECTOR_DIM)
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
      // Drop existing table (may be empty or have wrong schema) and recreate.
      // vec0 uses the implicit rowid as PK -- no named INTEGER PRIMARY KEY column.
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

  static insertStructuralBatch(db: Database.Database, rows: VectorInsertRow[]): void {
    const stmt = db.prepare(`
      INSERT INTO structural_vectors (rowid, embedding)
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
    // vec0 only supports single-row deletion via rowid
    for (const id of ids) {
      const rid = rowidBinding(Number(id))
      db.prepare('DELETE FROM positional_vectors WHERE rowid = ?').run(rid)
      db.prepare('DELETE FROM structural_vectors WHERE rowid = ?').run(rid)
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

  static knnStructural(db: Database.Database, queryVector: Float32Array, k: number): KnnResult[] {
    return db.prepare(`
      SELECT rowid AS position_index_id, distance
      FROM structural_vectors
      WHERE embedding MATCH vec_f32(?)
      ORDER BY distance
      LIMIT ?
    `).all(float32ArrayToBlob(queryVector), k) as KnnResult[]
  }

  /**
   * Combined search using reciprocal rank fusion (RRF).
   * Runs both KNN queries, over-fetches 2*k from each, then merges by rank.
   */
  static knnCombined(
    db: Database.Database,
    positionalQuery: Float32Array | null,
    structuralQuery: Float32Array,
    k: number,
    positionalWeight: number = 0.5,
  ): Array<KnnResult & { positionalDistance?: number; structuralDistance?: number }> {
    const RRF_K = 60
    const fetchK = k * 2

    const structuralResults = this.knnStructural(db, structuralQuery, fetchK)
    const positionalResults = positionalQuery
      ? this.knnPositional(db, positionalQuery, fetchK)
      : []

    if (!positionalQuery || positionalResults.length === 0) {
      return structuralResults.slice(0, k).map(r => ({
        ...r,
        structuralDistance: r.distance,
      }))
    }

    const scoreMap = new Map<number, {
      score: number
      positionalDistance?: number
      structuralDistance?: number
    }>()

    const structuralWeight = 1 - positionalWeight
    for (let rank = 0; rank < positionalResults.length; rank++) {
      const r = positionalResults[rank]
      const entry = scoreMap.get(r.position_index_id) ?? { score: 0 }
      entry.score += positionalWeight / (rank + RRF_K)
      entry.positionalDistance = r.distance
      scoreMap.set(r.position_index_id, entry)
    }

    for (let rank = 0; rank < structuralResults.length; rank++) {
      const r = structuralResults[rank]
      const entry = scoreMap.get(r.position_index_id) ?? { score: 0 }
      entry.score += structuralWeight / (rank + RRF_K)
      entry.structuralDistance = r.distance
      scoreMap.set(r.position_index_id, entry)
    }

    return [...scoreMap.entries()]
      .sort((a, b) => b[1].score - a[1].score)
      .slice(0, k)
      .map(([id, data]) => ({
        position_index_id: id,
        distance: data.score,
        positionalDistance: data.positionalDistance,
        structuralDistance: data.structuralDistance,
      }))
  }
}
