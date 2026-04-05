<script setup lang="ts">
import { computed, ref, watchEffect } from 'vue'
import { useInjectedGameNavigator } from '../composables/provideChessGame'
import { useInjectedGameAnalysis } from '../composables/provideGameAnalysis'
import type { PositionalFeatures, EvalTerm, EvalRawFeatures } from 'src/database/analysis/types'

const { currentFen } = useInjectedGameNavigator()
const { analysisByFen } = useInjectedGameAnalysis()

const analysis = computed(() => analysisByFen.value.get(currentFen.value) ?? null)
const positionalFeatures = computed(() => analysis.value?.positionalFeatures ?? null)
const evalRawFeatures = computed(() => analysis.value?.evalRawFeatures ?? null)
const phaseScore = computed(() => analysis.value?.phaseScore ?? null)

// ── Eval outputs (PositionalFeatures) ─────────────────────────────────────

const EVAL_TERM_ORDER: Array<{ key: keyof PositionalFeatures; label: string }> = [
  { key: 'material',   label: 'Material' },
  { key: 'imbalance',  label: 'Imbalance' },
  { key: 'pawns',      label: 'Pawns' },
  { key: 'passed',     label: 'Passed Pawns' },
  { key: 'knights',    label: 'Knights' },
  { key: 'bishops',    label: 'Bishops' },
  { key: 'rooks',      label: 'Rooks' },
  { key: 'queens',     label: 'Queens' },
  { key: 'mobility',   label: 'Mobility' },
  { key: 'kingSafety', label: 'King Safety' },
  { key: 'threats',    label: 'Threats' },
  { key: 'space',      label: 'Space' },
  { key: 'winnable',   label: 'Winnable' },
]

function fmtScore(v: number | null | undefined): string {
  if (v == null) return '—'
  return (v >= 0 ? '+' : '') + v.toFixed(2)
}

function termRows(features: PositionalFeatures) {
  return EVAL_TERM_ORDER.map(({ key, label }) => {
    const term = features[key] as EvalTerm | undefined
    return {
      label,
      whiteMg: fmtScore(term?.white?.mg),
      whiteEg: fmtScore(term?.white?.eg),
      blackMg: fmtScore(term?.black?.mg),
      blackEg: fmtScore(term?.black?.eg),
      totalMg: fmtScore(term?.total?.mg),
      totalEg: fmtScore(term?.total?.eg),
    }
  })
}

// ── Eval raw features grouped ──────────────────────────────────────────────

type FeaturePolarity = 'higher_better' | 'higher_worse'

interface RawFeatureDef {
  key: string
  label: string
  polarity: FeaturePolarity
}

interface RawFeatureGroup {
  title: string
  features: RawFeatureDef[]
}

const RAW_FEATURE_GROUPS: RawFeatureGroup[] = [
  {
    title: 'Material',
    features: [
      { key: 'pawn_count',        label: 'Pawn count',        polarity: 'higher_better' },
      { key: 'knight_count',      label: 'Knight count',      polarity: 'higher_better' },
      { key: 'bishop_count',      label: 'Bishop count',      polarity: 'higher_better' },
      { key: 'rook_count',        label: 'Rook count',        polarity: 'higher_better' },
      { key: 'queen_count',       label: 'Queen count',       polarity: 'higher_better' },
      { key: 'non_pawn_material', label: 'Non-pawn material', polarity: 'higher_better' },
    ],
  },
  {
    title: 'Pawn Structure',
    features: [
      { key: 'passed_pawns',         label: 'Passed pawns',    polarity: 'higher_better' },
      { key: 'isolated_pawns',       label: 'Isolated pawns',  polarity: 'higher_worse' },
      { key: 'doubled_pawns',        label: 'Doubled pawns',   polarity: 'higher_worse' },
      { key: 'backward_pawns',       label: 'Backward pawns',  polarity: 'higher_worse' },
      { key: 'connected_pawns',      label: 'Connected pawns', polarity: 'higher_better' },
      { key: 'supported_pawns',      label: 'Supported pawns', polarity: 'higher_better' },
      { key: 'phalanx_pawns',        label: 'Phalanx pawns',   polarity: 'higher_better' },
      { key: 'blocked_pawns',        label: 'Blocked pawns',   polarity: 'higher_worse' },
      { key: 'passed_pawn_best_rank',label: 'Best passed rank', polarity: 'higher_better' },
      { key: 'free_passed_pawns',    label: 'Free passed pawns',polarity: 'higher_better' },
    ],
  },
  {
    title: 'Mobility',
    features: [
      { key: 'knight_mobility', label: 'Knight mobility', polarity: 'higher_better' },
      { key: 'bishop_mobility', label: 'Bishop mobility', polarity: 'higher_better' },
      { key: 'rook_mobility',   label: 'Rook mobility',   polarity: 'higher_better' },
      { key: 'queen_mobility',  label: 'Queen mobility',  polarity: 'higher_better' },
    ],
  },
  {
    title: 'Piece Placement',
    features: [
      { key: 'knight_outpost',          label: 'Knight outpost',       polarity: 'higher_better' },
      { key: 'bishop_outpost',          label: 'Bishop outpost',       polarity: 'higher_better' },
      { key: 'reachable_outpost',       label: 'Reachable outpost',    polarity: 'higher_better' },
      { key: 'bad_outpost',             label: 'Bad outpost',          polarity: 'higher_worse' },
      { key: 'bishop_long_diagonal',    label: 'Long diagonal bishop', polarity: 'higher_better' },
      { key: 'bishop_pair',             label: 'Bishop pair',          polarity: 'higher_better' },
      { key: 'bishop_pawns_same_color', label: 'Pawns same color as bishop', polarity: 'higher_worse' },
      { key: 'bishop_xray_pawns',       label: 'Bishop X-ray pawns',  polarity: 'higher_better' },
      { key: 'minor_behind_pawn',       label: 'Minor behind pawn',   polarity: 'higher_better' },
      { key: 'rook_on_open_file',       label: 'Rook on open file',   polarity: 'higher_better' },
      { key: 'rook_on_semiopen_file',   label: 'Rook on semi-open file', polarity: 'higher_better' },
      { key: 'rook_on_queen_file',      label: 'Rook on queen file',  polarity: 'higher_better' },
      { key: 'rook_on_king_ring',       label: 'Rook on king ring',   polarity: 'higher_better' },
      { key: 'bishop_on_king_ring',     label: 'Bishop on king ring',  polarity: 'higher_better' },
      { key: 'trapped_rook',            label: 'Trapped rook',         polarity: 'higher_worse' },
      { key: 'weak_queen',              label: 'Weak queen',           polarity: 'higher_worse' },
      { key: 'queen_infiltration',      label: 'Queen infiltration',   polarity: 'higher_better' },
    ],
  },
  {
    title: 'King Safety',
    features: [
      { key: 'king_attackers_count',  label: 'King attackers',        polarity: 'higher_worse' },
      { key: 'king_attackers_weight', label: 'King attackers weight', polarity: 'higher_worse' },
      { key: 'king_attacks_count',    label: 'King attacks count',    polarity: 'higher_worse' },
      { key: 'king_danger',           label: 'King danger',           polarity: 'higher_worse' },
      { key: 'king_flank_attack',     label: 'Flank attack',          polarity: 'higher_worse' },
      { key: 'king_flank_defense',    label: 'Flank defense',         polarity: 'higher_better' },
      { key: 'unsafe_checks',         label: 'Unsafe checks',         polarity: 'higher_worse' },
      { key: 'king_ring_weak',        label: 'King ring weak',        polarity: 'higher_worse' },
      { key: 'blockers_for_king',     label: 'Blockers for king',     polarity: 'higher_worse' },
      { key: 'king_pawnless_flank',   label: 'Pawnless flank',        polarity: 'higher_worse' },
      { key: 'can_castle_kingside',   label: 'Can castle kingside',   polarity: 'higher_better' },
      { key: 'can_castle_queenside',  label: 'Can castle queenside',  polarity: 'higher_better' },
    ],
  },
  {
    title: 'Threats',
    features: [
      { key: 'weak_pieces',           label: 'Weak pieces',           polarity: 'higher_better' },
      { key: 'hanging_pieces',        label: 'Hanging pieces',        polarity: 'higher_better' },
      { key: 'restricted_pieces',     label: 'Restricted pieces',     polarity: 'higher_better' },
      { key: 'threat_by_safe_pawn',   label: 'Threat by safe pawn',   polarity: 'higher_better' },
      { key: 'threat_by_pawn_push',   label: 'Threat by pawn push',   polarity: 'higher_better' },
      { key: 'threat_by_king',        label: 'Threat by king',        polarity: 'higher_better' },
      { key: 'knight_on_queen',       label: 'Knight on queen',       polarity: 'higher_better' },
      { key: 'slider_on_queen',       label: 'Slider on queen',       polarity: 'higher_better' },
      { key: 'weak_queen_protection', label: 'Weak queen protection', polarity: 'higher_better' },
    ],
  },
  {
    title: 'Space',
    features: [
      { key: 'space_count', label: 'Space count', polarity: 'higher_better' },
    ],
  },
]

const GLOBAL_KEYS: Array<{ key: string; label: string }> = [
  { key: 'phase',                label: 'Phase (0=EG, 128=MG)' },
  { key: 'complexity',           label: 'Complexity' },
  { key: 'scale_factor',         label: 'Scale factor' },
  { key: 'outflanking',          label: 'Outflanking' },
  { key: 'pawns_on_both_flanks', label: 'Pawns on both flanks' },
  { key: 'almost_unwinnable',    label: 'Almost unwinnable' },
  { key: 'infiltration',         label: 'Infiltration' },
  { key: 'opposite_bishops',     label: 'Opposite bishops' },
  { key: 'side_to_move',         label: 'Side to move (0=W, 1=B)' },
  { key: 'rule50_count',         label: '50-move rule count' },
  { key: 'final_eval',           label: 'Final eval (cp)' },
]

function fmtRaw(v: number | undefined): string {
  if (v === undefined) return '—'
  return String(v)
}

interface PerColorRow {
  key: string
  label: string
  polarity: FeaturePolarity
  whiteVal: number | undefined
  blackVal: number | undefined
  white: string
  black: string
  whiteClass: string
  blackClass: string
}

function advantageClasses(
  wVal: number | undefined,
  bVal: number | undefined,
  polarity: FeaturePolarity,
): { whiteClass: string; blackClass: string } {
  const neutral = 'text-primary'
  if (wVal === undefined || bVal === undefined) return { whiteClass: neutral, blackClass: neutral }
  if (wVal === bVal) return { whiteClass: neutral, blackClass: neutral }
  if (wVal === 0 && bVal === 0) return { whiteClass: neutral, blackClass: neutral }
  const whiteHasMore = wVal > bVal
  const moreIsBetter = polarity === 'higher_better'
  const whiteAdvantage = whiteHasMore === moreIsBetter
  return {
    whiteClass: whiteAdvantage
      ? 'text-green-600 dark:text-green-400'
      : 'text-red-500 dark:text-red-400',
    blackClass: whiteAdvantage
      ? 'text-red-500 dark:text-red-400'
      : 'text-green-600 dark:text-green-400',
  }
}

interface GroupedRows {
  title: string
  rows: PerColorRow[]
}

const rawGroupedRows = computed((): GroupedRows[] => {
  const raw = evalRawFeatures.value
  if (!raw) return []
  return RAW_FEATURE_GROUPS.map(group => ({
    title: group.title,
    rows: group.features
      .map(({ key, label, polarity }) => {
        const wVal = raw[`${key}_w`] as number | undefined
        const bVal = raw[`${key}_b`] as number | undefined
        const { whiteClass, blackClass } = advantageClasses(wVal, bVal, polarity)
        return {
          key,
          label,
          polarity,
          whiteVal: wVal,
          blackVal: bVal,
          white: fmtRaw(wVal),
          black: fmtRaw(bVal),
          whiteClass,
          blackClass,
        }
      })
      .filter(r => r.white !== '—' || r.black !== '—'),
  })).filter(g => g.rows.length > 0)
})

const rawGlobalRows = computed(() => {
  const raw = evalRawFeatures.value
  if (!raw) return []
  return GLOBAL_KEYS.map(({ key, label }) => ({
    key,
    label,
    value: fmtRaw(raw[key]),
  })).filter(r => r.value !== '—')
})

const rawSearch = ref('')

const filteredGroupedRows = computed((): GroupedRows[] => {
  const q = rawSearch.value.trim().toLowerCase()
  if (!q) return rawGroupedRows.value
  return rawGroupedRows.value
    .map(g => ({
      title: g.title,
      rows: g.rows.filter(r => r.label.toLowerCase().includes(q)),
    }))
    .filter(g => g.rows.length > 0)
})

const filteredGlobalRows = computed(() => {
  const q = rawSearch.value.trim().toLowerCase()
  if (!q) return rawGlobalRows.value
  return rawGlobalRows.value.filter(r => r.label.toLowerCase().includes(q))
})

const hasEvalFeatures = computed(() => positionalFeatures.value !== null)
const hasRawFeatures = computed(() => evalRawFeatures.value !== null)
const hasAny = computed(() => hasEvalFeatures.value || hasRawFeatures.value)
</script>

<template>
  <div class="flex flex-col h-full overflow-y-auto">
    <div v-if="!hasAny" class="px-4 py-6 text-xs text-muted">
      No positional features available for this position.
    </div>

    <template v-else>
      <!-- Phase badge -->
      <div v-if="phaseScore != null" class="px-4 pt-3 pb-1 shrink-0">
        <span class="text-[10px] text-muted">
          Phase score: <span class="font-mono text-primary">{{ phaseScore }}</span>
          <span class="ml-1 text-muted/70">(128 = full material, 0 = endgame)</span>
        </span>
      </div>

      <!-- ── Eval outputs (PositionalFeatures) ─────────────────────────── -->
      <section v-if="hasEvalFeatures" class="px-4 pt-3 pb-4 shrink-0">
        <h3 class="text-xs font-semibold text-primary uppercase tracking-wide mb-2">
          Eval Outputs
          <span class="normal-case font-normal text-muted ml-1">(weighted cp contributions)</span>
        </h3>
        <div class="overflow-x-auto">
          <table class="w-full text-[11px] border-collapse">
            <thead>
              <tr class="border-b border-border">
                <th class="text-left py-1 pr-3 font-medium text-secondary w-28">Term</th>
                <th class="text-right py-1 px-1.5 font-medium text-secondary whitespace-nowrap">W mg</th>
                <th class="text-right py-1 px-1.5 font-medium text-secondary whitespace-nowrap">W eg</th>
                <th class="text-right py-1 px-1.5 font-medium text-secondary whitespace-nowrap">B mg</th>
                <th class="text-right py-1 px-1.5 font-medium text-secondary whitespace-nowrap">B eg</th>
                <th class="text-right py-1 px-1.5 font-medium text-primary whitespace-nowrap">Total mg</th>
                <th class="text-right py-1 pl-1.5 font-medium text-primary whitespace-nowrap">Total eg</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-border/50">
              <tr
                v-for="row in termRows(positionalFeatures!)"
                :key="row.label"
                class="hover:bg-muted/10"
              >
                <td class="py-1 pr-3 font-medium text-secondary">{{ row.label }}</td>
                <td class="py-1 px-1.5 text-right font-mono" :class="row.whiteMg.startsWith('+') ? 'text-green-600 dark:text-green-400' : row.whiteMg.startsWith('-') ? 'text-red-500 dark:text-red-400' : 'text-muted'">{{ row.whiteMg }}</td>
                <td class="py-1 px-1.5 text-right font-mono" :class="row.whiteEg.startsWith('+') ? 'text-green-600 dark:text-green-400' : row.whiteEg.startsWith('-') ? 'text-red-500 dark:text-red-400' : 'text-muted'">{{ row.whiteEg }}</td>
                <td class="py-1 px-1.5 text-right font-mono" :class="row.blackMg.startsWith('+') ? 'text-green-600 dark:text-green-400' : row.blackMg.startsWith('-') ? 'text-red-500 dark:text-red-400' : 'text-muted'">{{ row.blackMg }}</td>
                <td class="py-1 px-1.5 text-right font-mono" :class="row.blackEg.startsWith('+') ? 'text-green-600 dark:text-green-400' : row.blackEg.startsWith('-') ? 'text-red-500 dark:text-red-400' : 'text-muted'">{{ row.blackEg }}</td>
                <td class="py-1 px-1.5 text-right font-mono font-medium" :class="row.totalMg.startsWith('+') ? 'text-green-600 dark:text-green-400' : row.totalMg.startsWith('-') ? 'text-red-500 dark:text-red-400' : 'text-muted'">{{ row.totalMg }}</td>
                <td class="py-1 pl-1.5 text-right font-mono font-medium" :class="row.totalEg.startsWith('+') ? 'text-green-600 dark:text-green-400' : row.totalEg.startsWith('-') ? 'text-red-500 dark:text-red-400' : 'text-muted'">{{ row.totalEg }}</td>
              </tr>
              <tr class="border-t border-border">
                <td class="py-1 pr-3 font-semibold text-primary">Final Eval</td>
                <td colspan="6" class="py-1 px-1.5 text-right font-mono font-semibold" :class="(positionalFeatures!.finalEvaluation ?? 0) > 0 ? 'text-green-600 dark:text-green-400' : (positionalFeatures!.finalEvaluation ?? 0) < 0 ? 'text-red-500 dark:text-red-400' : 'text-muted'">
                  {{ fmtScore(positionalFeatures!.finalEvaluation) }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <!-- ── Eval raw features ─────────────────────────────────────────── -->
      <section v-if="hasRawFeatures" class="px-4 pt-1 pb-4 shrink-0">
        <h3 class="text-xs font-semibold text-primary uppercase tracking-wide mb-2">
          Eval Raw Inputs
          <span class="normal-case font-normal text-muted ml-1">(pre-weighting counts &amp; flags)</span>
        </h3>

        <!-- Color legend -->
        <div class="flex items-center gap-3 text-[10px] text-muted mb-2">
          <span class="flex items-center gap-1">
            <span class="inline-block size-2 rounded-sm bg-green-600 dark:bg-green-400" />
            Advantage
          </span>
          <span class="flex items-center gap-1">
            <span class="inline-block size-2 rounded-sm bg-red-500 dark:bg-red-400" />
            Disadvantage
          </span>
        </div>

        <!-- Search -->
        <div class="relative mb-2">
          <input
            v-model="rawSearch"
            type="text"
            placeholder="Filter features…"
            class="w-full text-[11px] bg-transparent border border-border rounded px-2 py-1 pr-6 text-primary placeholder:text-muted focus:outline-none focus:border-primary/50"
          />
          <button
            v-if="rawSearch"
            class="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted hover:text-primary leading-none"
            @click="rawSearch = ''"
          >✕</button>
        </div>

        <!-- Per-color features (grouped) -->
        <div v-for="group in filteredGroupedRows" :key="group.title" class="mb-3">
          <h4 class="text-[10px] font-medium text-secondary uppercase tracking-wide mb-1">{{ group.title }}</h4>
          <div class="overflow-x-auto">
            <table class="w-full text-[11px] border-collapse">
              <thead>
                <tr class="border-b border-border">
                  <th class="text-left py-1 pr-3 font-medium text-secondary">Feature</th>
                  <th class="text-right py-1 px-2 font-medium text-secondary">White</th>
                  <th class="text-right py-1 pl-2 font-medium text-secondary">Black</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-border/50">
                <tr
                  v-for="row in group.rows"
                  :key="row.key"
                  class="hover:bg-muted/10"
                >
                  <td class="py-1 pr-3 text-secondary">
                    {{ row.label }}
                    <span
                      class="ml-1 text-[9px] opacity-50"
                      :title="row.polarity === 'higher_better' ? 'Higher is better for that side' : 'Higher is worse for that side'"
                    >{{ row.polarity === 'higher_better' ? '↑' : '↓' }}</span>
                  </td>
                  <td class="py-1 px-2 text-right font-mono" :class="row.whiteClass">{{ row.white }}</td>
                  <td class="py-1 pl-2 text-right font-mono" :class="row.blackClass">{{ row.black }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Global features -->
        <div v-if="filteredGlobalRows.length" class="overflow-x-auto">
          <h4 class="text-[10px] font-medium text-secondary uppercase tracking-wide mb-1">Global</h4>
          <table class="w-full text-[11px] border-collapse">
            <tbody class="divide-y divide-border/50">
              <tr
                v-for="row in filteredGlobalRows"
                :key="row.key"
                class="hover:bg-muted/10"
              >
                <td class="py-1 pr-3 text-secondary">{{ row.label }}</td>
                <td class="py-1 pl-2 text-right font-mono text-primary">{{ row.value }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <p v-if="rawSearch.trim() && !filteredGroupedRows.length && !filteredGlobalRows.length" class="text-[11px] text-muted mt-1">
          No features match "{{ rawSearch.trim() }}".
        </p>
      </section>
    </template>
  </div>
</template>
