import type { EChartsOption } from 'echarts'

const MIN_Y_SPAN = 5

/** Vue-ECharts instance exposes these via usePublicAPI. */
export type EChartsComponentApi = {
  getOption: () => unknown
  dispatchAction: (payload: Record<string, unknown>) => void
  isDisposed: () => boolean
}

function clampYZoomWindow(start: number, end: number): [number, number] {
  let ns = Math.max(0, Math.min(100, start))
  let ne = Math.max(0, Math.min(100, end))
  if (ne - ns < MIN_Y_SPAN) {
    const mid = (ns + ne) / 2
    ns = Math.max(0, mid - MIN_Y_SPAN / 2)
    ne = Math.min(100, mid + MIN_Y_SPAN / 2)
    if (ne - ns < MIN_Y_SPAN) {
      ne = Math.min(100, ns + MIN_Y_SPAN)
    }
  }
  return [ns, ne]
}

/**
 * Use on a wrapper `@wheel.capture` around VChart: Shift+wheel zooms the Y-axis dataZoom
 * with the given id, without also zooming X (ECharts would otherwise apply both inside zooms).
 */
export function handleShiftWheelYAxisDataZoom(
  chart: EChartsComponentApi | null | undefined,
  e: WheelEvent,
  dataZoomId: string
): void {
  if (!e.shiftKey || !chart || chart.isDisposed()) return

  e.preventDefault()
  e.stopPropagation()

  const opt = chart.getOption() as EChartsOption
  const dzArr = opt.dataZoom
  if (!Array.isArray(dzArr)) return

  const yDz = dzArr.find(
    d => d != null && typeof d === 'object' && (d as { id?: string }).id === dataZoomId
  ) as { start?: number; end?: number } | undefined

  if (yDz == null || yDz.start == null || yDz.end == null) return

  const start = Number(yDz.start)
  const end = Number(yDz.end)
  const raw = -e.deltaY
  const abs = Math.abs(raw)
  let factor = 1.1
  if (abs > 10) factor = 1.4
  else if (abs > 3) factor = 1.2
  const wheelZoom = raw > 0 ? factor : 1 / factor
  const percentPoint = 50
  const scale = Math.max(1 / wheelZoom, 0)
  let ns = (start - percentPoint) * scale + percentPoint
  let ne = (end - percentPoint) * scale + percentPoint
  ;[ns, ne] = clampYZoomWindow(ns, ne)

  chart.dispatchAction({
    type: 'dataZoom',
    dataZoomId,
    start: ns,
    end: ne,
  })
}
