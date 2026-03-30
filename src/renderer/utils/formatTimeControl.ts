import { TimeClass } from 'src/database/chess/types'

export const TIME_CLASS_LABELS: Record<TimeClass, string> = {
  [TimeClass.ULTRA_BULLET]: 'UltraBullet',
  [TimeClass.BULLET]: 'Bullet',
  [TimeClass.BLITZ]: 'Blitz',
  [TimeClass.RAPID]: 'Rapid',
  [TimeClass.CLASSICAL]: 'Classical',
  [TimeClass.DAILY]: 'Daily',
}

export const formatTimeControl = (tc: { timeClass: TimeClass; base: number; increment: number }) => {
  const label = TIME_CLASS_LABELS[tc.timeClass] ?? tc.timeClass
  return `${label} · ${tc.base / 60}+${tc.increment}`
}
