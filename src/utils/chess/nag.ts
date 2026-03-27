import { NAG, NAG_SYMBOLS } from 'src/services/engine/types'

/**
 * CSS variable reference for each NAG value.
 * Mode-aware: resolves to light or dark variant automatically.
 * Use in inline styles: `:style="{ color: nagColor(nag) }"`.
 */
export const NAG_COLORS: Partial<Record<NAG, string>> = {
  [NAG.Brilliant]:   'var(--color-nag-brilliant)',
  [NAG.Good]:        'var(--color-nag-good)',
  [NAG.Interesting]: 'var(--color-nag-interesting)',
  [NAG.Dubious]:     'var(--color-nag-dubious)',
  [NAG.Mistake]:     'var(--color-nag-mistake)',
  [NAG.Blunder]:     'var(--color-nag-blunder)',
}

/** Tailwind classes for badge-style NAG indicators. */
export const NAG_BG_CLASSES: Partial<Record<NAG, string>> = {
  [NAG.Brilliant]:   'bg-nag-brilliant-subtle text-nag-brilliant',
  [NAG.Good]:        'bg-nag-good-subtle text-nag-good',
  [NAG.Interesting]: 'bg-nag-interesting-subtle text-nag-interesting',
  [NAG.Dubious]:     'bg-nag-dubious-subtle text-nag-dubious',
  [NAG.Mistake]:     'bg-nag-mistake-subtle text-nag-mistake',
  [NAG.Blunder]:     'bg-nag-blunder-subtle text-nag-blunder',
}

/** Returns the CSS variable string for a NAG, or undefined for neutral/null. */
export function nagColor(nag: NAG | null): string | undefined {
  return nag != null ? NAG_COLORS[nag] : undefined
}

/** Returns the symbol string (e.g. "??", "!") for a NAG, or "" for neutral/null. */
export function nagSymbol(nag: NAG | null): string {
  if (nag == null) return ''
  return NAG_SYMBOLS[nag] ?? ''
}

/** Returns Tailwind badge classes for a NAG, or "" for neutral/null. */
export function nagBgClass(nag: NAG | null): string {
  if (nag == null) return ''
  return NAG_BG_CLASSES[nag] ?? ''
}
