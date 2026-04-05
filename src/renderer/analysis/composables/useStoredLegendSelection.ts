import { ref, watch } from 'vue'

function parseSaved(raw: string | null): Record<string, unknown> | null {
  if (raw == null || raw === '') return null
  try {
    const parsed = JSON.parse(raw) as unknown
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }
  } catch {
    /* ignore */
  }
  return null
}

/**
 * Persists ECharts legend `selected` map to localStorage so series toggles survive tab switches.
 * Merges saved booleans only for names in `validNames`; everything else uses `getDefaults()`.
 */
export function useStoredLegendSelection(
  storageKey: string,
  getDefaults: () => Record<string, boolean>,
  validNames: readonly string[],
) {
  const nameSet = new Set(validNames)

  function load(): Record<string, boolean> {
    const defaults = getDefaults()
    const saved = parseSaved(
      typeof localStorage !== 'undefined' ? localStorage.getItem(storageKey) : null,
    )
    if (!saved) return { ...defaults }
    const out = { ...defaults }
    for (const name of nameSet) {
      const v = saved[name]
      if (typeof v === 'boolean') out[name] = v
    }
    return out
  }

  const legendSelected = ref<Record<string, boolean>>(load())

  watch(
    legendSelected,
    v => {
      try {
        if (typeof localStorage === 'undefined') return
        const subset: Record<string, boolean> = {}
        for (const name of nameSet) {
          subset[name] = Boolean(v[name])
        }
        localStorage.setItem(storageKey, JSON.stringify(subset))
      } catch {
        /* quota / private mode */
      }
    },
    { deep: true },
  )

  return legendSelected
}
