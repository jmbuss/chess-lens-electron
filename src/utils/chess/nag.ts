import { NAG, NAG_SYMBOLS } from 'src/services/engine/types'

/**
 * CSS variable reference for each NAG value.
 * Mode-aware: resolves to light or dark variant automatically.
 * Use in inline styles: `:style="{ color: nagColor(nag) }"`.
 */
export const NAG_COLORS: Partial<Record<NAG, string>> = {
  [NAG.Brilliant]:   'var(--color-nag-brilliant)',
  [NAG.Great]:       'var(--color-nag-good)',
  [NAG.Best]:        'var(--color-nag-good)',
  [NAG.Excellent]:   'var(--color-nag-good)',
  [NAG.Good]:        'var(--color-nag-good)',
  [NAG.Interesting]: 'var(--color-nag-interesting)',
  [NAG.Inaccuracy]:  'var(--color-nag-dubious)',
  [NAG.Mistake]:     'var(--color-nag-mistake)',
  [NAG.Blunder]:     'var(--color-nag-blunder)',
  [NAG.Miss]:        'var(--color-nag-mistake)',
  [NAG.BookMove]:    'var(--color-nag-book)',
}

/** Tailwind classes for badge-style NAG indicators. */
export const NAG_BG_CLASSES: Partial<Record<NAG, string>> = {
  [NAG.Brilliant]:   'bg-nag-brilliant-subtle text-nag-brilliant',
  [NAG.Great]:       'bg-nag-good-subtle text-nag-good',
  [NAG.Best]:        'bg-nag-good-subtle text-nag-good',
  [NAG.Excellent]:   'bg-nag-good-subtle text-nag-good',
  [NAG.Good]:        'bg-nag-good-subtle text-nag-good',
  [NAG.Interesting]: 'bg-nag-interesting-subtle text-nag-interesting',
  [NAG.Inaccuracy]:  'bg-nag-dubious-subtle text-nag-dubious',
  [NAG.Mistake]:     'bg-nag-mistake-subtle text-nag-mistake',
  [NAG.Blunder]:     'bg-nag-blunder-subtle text-nag-blunder',
  [NAG.Miss]:        'bg-nag-mistake-subtle text-nag-mistake',
  [NAG.BookMove]:    'bg-nag-book-subtle text-nag-book',
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

/** Human-readable name for each NAG, used in tooltips. */
export const NAG_NAMES: Partial<Record<NAG, string>> = {
  [NAG.Brilliant]:   'Brilliant move',
  [NAG.Great]:       'Great move',
  [NAG.Best]:        'Best move',
  [NAG.Excellent]:   'Excellent move',
  [NAG.Good]:        'Good move',
  [NAG.Interesting]: 'Interesting move',
  [NAG.Inaccuracy]:  'Inaccuracy',
  [NAG.Mistake]:     'Mistake',
  [NAG.Blunder]:     'Blunder',
  [NAG.Miss]:        'Missed win',
  [NAG.BookMove]:    'Opening book move',
}

/** Returns the human-readable name for a NAG, or undefined for neutral/null. */
export function nagName(nag: NAG | null): string | undefined {
  return nag != null ? NAG_NAMES[nag] : undefined
}
