import type Database from 'better-sqlite3'
import { VectorModel, POSITIONAL_VECTOR_DIM } from 'src/database/vectors'
import { PositionIndexModel } from 'src/database/vectors/PositionIndexModel'
import type { PositionIndexRow } from 'src/database/vectors/types'

export interface PositionCluster {
  clusterId: number
  size: number
  gameCount: number
  dominantReason: string
  dominantOpening: string | null
  avgCriticality: number | null
  representativePositionIndexId: number
  representativeFen: string
  representativeGameId: string
  representativeSan: string | null
  representativeMoveNumber: number | null
  representativeColor: string
}

function euclideanDistanceSq(a: Float32Array, b: Float32Array): number {
  let sum = 0
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i]
    sum += d * d
  }
  return sum
}

function addVectors(target: Float32Array, source: Float32Array): void {
  for (let i = 0; i < target.length; i++) {
    target[i] += source[i]
  }
}

function scaleVector(v: Float32Array, scale: number): Float32Array {
  const out = new Float32Array(v.length)
  for (let i = 0; i < v.length; i++) {
    out[i] = v[i] * scale
  }
  return out
}

function mode<T>(items: T[]): T {
  const counts = new Map<T, number>()
  for (const item of items) {
    counts.set(item, (counts.get(item) ?? 0) + 1)
  }
  let best: T = items[0]
  let bestCount = 0
  for (const [val, count] of counts) {
    if (count > bestCount) {
      best = val
      bestCount = count
    }
  }
  return best
}

/**
 * Lloyd's k-means algorithm over Float32Array vectors.
 * Returns an array of cluster-id assignments (same length as `vectors`).
 */
function kMeans(
  vectors: Float32Array[],
  k: number,
  maxIterations = 50,
): number[] {
  if (vectors.length === 0) return []

  const n = vectors.length
  const dim = vectors[0].length

  // KMeans++ initialisation — spread initial centroids
  const centroids: Float32Array[] = []
  centroids.push(vectors[Math.floor(Math.random() * n)])

  while (centroids.length < k) {
    const distances = vectors.map(v => {
      let minDist = Infinity
      for (const c of centroids) {
        const d = euclideanDistanceSq(v, c)
        if (d < minDist) minDist = d
      }
      return minDist
    })
    const totalDist = distances.reduce((s, d) => s + d, 0)
    let rand = Math.random() * totalDist
    for (let i = 0; i < n; i++) {
      rand -= distances[i]
      if (rand <= 0) {
        centroids.push(vectors[i])
        break
      }
    }
    if (centroids.length < k) {
      centroids.push(vectors[Math.floor(Math.random() * n)])
    }
  }

  const assignments = new Int32Array(n)

  for (let iter = 0; iter < maxIterations; iter++) {
    // Assign each vector to the nearest centroid
    let changed = false
    for (let i = 0; i < n; i++) {
      let minDist = Infinity
      let best = 0
      for (let c = 0; c < k; c++) {
        const d = euclideanDistanceSq(vectors[i], centroids[c])
        if (d < minDist) {
          minDist = d
          best = c
        }
      }
      if (assignments[i] !== best) {
        assignments[i] = best
        changed = true
      }
    }

    if (!changed) break

    // Recompute centroids
    const sums = Array.from({ length: k }, () => new Float32Array(dim))
    const counts = new Int32Array(k)
    for (let i = 0; i < n; i++) {
      addVectors(sums[assignments[i]], vectors[i])
      counts[assignments[i]]++
    }
    for (let c = 0; c < k; c++) {
      if (counts[c] > 0) {
        centroids[c] = scaleVector(sums[c], 1 / counts[c])
      }
    }
  }

  return Array.from(assignments)
}

export class ClusteringService {
  constructor(private db: Database.Database) {}

  cluster(k = 20): PositionCluster[] {
    const allVectors = VectorModel.getAllPositionalVectors(this.db)
    if (allVectors.length === 0) return []

    const effectiveK = Math.min(k, allVectors.length)

    const ids = allVectors.map(v => v.positionIndexId)
    const vectors = allVectors.map(v => v.vector)

    const assignments = kMeans(vectors, effectiveK)

    const indexRows = PositionIndexModel.findByIds(this.db, ids)
    const rowMap = new Map<number, PositionIndexRow>(indexRows.map(r => [Number(r.id), r]))

    // Group members by cluster
    const clusterMembers = new Map<number, number[]>() // clusterId -> positionIndexIds
    for (let i = 0; i < ids.length; i++) {
      const cid = assignments[i]
      if (!clusterMembers.has(cid)) clusterMembers.set(cid, [])
      clusterMembers.get(cid)!.push(ids[i])
    }

    // Build a fast lookup from positionIndexId → its index in the `ids` array
    const idToIdx = new Map<number, number>(ids.map((id, i) => [id, i]))

    // Compute cluster centroids for representative selection
    const clusterCentroids = new Map<number, Float32Array>()
    for (const [cid, memberIds] of clusterMembers) {
      const sum = new Float32Array(POSITIONAL_VECTOR_DIM)
      let count = 0
      for (const id of memberIds) {
        const idx = idToIdx.get(id)
        if (idx !== undefined) {
          addVectors(sum, vectors[idx])
          count++
        }
      }
      if (count > 0) clusterCentroids.set(cid, scaleVector(sum, 1 / count))
    }

    const clusters: PositionCluster[] = []

    for (const [cid, memberIds] of clusterMembers) {
      const members = memberIds.map(id => rowMap.get(id)).filter((r): r is PositionIndexRow => r != null)
      if (members.length === 0) continue

      const gameCount = new Set(members.map(r => r.game_id)).size
      const dominantReason = mode(members.map(r => r.index_reason))
      const openings = members.map(r => r.opening_eco).filter((e): e is string => e != null)
      const dominantOpening = openings.length > 0 ? mode(openings) : null

      const crits = members.map(r => r.criticality_score).filter((c): c is number => c != null)
      const avgCriticality = crits.length > 0 ? crits.reduce((s, c) => s + c, 0) / crits.length : null

      // Pick member closest to centroid as representative
      const centroid = clusterCentroids.get(cid)!
      let repId = memberIds[0]
      let repDist = Infinity
      for (const id of memberIds) {
        const idx = idToIdx.get(id)
        if (idx === undefined) continue
        const d = euclideanDistanceSq(vectors[idx], centroid)
        if (d < repDist) {
          repDist = d
          repId = id
        }
      }

      const rep = rowMap.get(repId)
      if (!rep) continue

      clusters.push({
        clusterId: cid,
        size: members.length,
        gameCount,
        dominantReason,
        dominantOpening,
        avgCriticality,
        representativePositionIndexId: repId,
        representativeFen: rep.fen,
        representativeGameId: rep.game_id,
        representativeSan: rep.san,
        representativeMoveNumber: rep.move_number,
        representativeColor: rep.color,
      })
    }

    // Sort by cluster size descending
    clusters.sort((a, b) => b.size - a.size)

    return clusters
  }
}
