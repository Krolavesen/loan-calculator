import { useState } from 'react'
import { formatMoney, formatMonthLabel } from '../lib/format'

const WIDTH = 720
const HEIGHT = 260
const PAD = { top: 16, right: 16, bottom: 28, left: 68 }

/** A range drawn behind the line, one lower and upper value per month. */
export interface ChartBand {
  lower: readonly number[]
  upper: readonly number[]
  label: string
}

interface CostChartProps {
  /** One value per month, starting at `startMonth`. */
  series: readonly number[]
  /** Month of the first value in `series`. Defaults to 0. */
  startMonth?: number
  /** Optional range to shade behind the line, aligned with `series`. */
  band?: ChartBand
  label: string
}

/** A small hand-rolled area chart — no charting dependency needed for one series. */
export function CostChart({ series, startMonth = 0, band, label }: CostChartProps) {
  const [hover, setHover] = useState<number | null>(null)

  if (series.length < 2) return null

  const plotW = WIDTH - PAD.left - PAD.right
  const plotH = HEIGHT - PAD.top - PAD.bottom
  const lastMonth = series.length - 1
  const endMonth = startMonth + lastMonth

  const values = band ? [...series, ...band.lower, ...band.upper] : series
  const rawMin = Math.min(...values)
  const rawMax = Math.max(...values)
  const pad = (rawMax - rawMin) * 0.1 || Math.abs(rawMax) * 0.1 || 1
  const min = rawMin - pad
  const max = rawMax + pad

  const x = (month: number) => PAD.left + (month / lastMonth) * plotW
  const y = (value: number) => PAD.top + (1 - (value - min) / (max - min)) * plotH

  const path = (points: readonly number[]) =>
    points.map((v, m) => `${m === 0 ? 'M' : 'L'}${x(m).toFixed(2)},${y(v).toFixed(2)}`).join(' ')

  const line = path(series)
  const area = `${line} L${x(lastMonth).toFixed(2)},${(PAD.top + plotH).toFixed(2)} L${PAD.left.toFixed(2)},${(PAD.top + plotH).toFixed(2)} Z`

  // Trace the upper edge left to right, then the lower edge back.
  const bandArea = band
    ? `${path(band.upper)} ${band.lower
        .map((v, m) => `L${x(m).toFixed(2)},${y(v).toFixed(2)}`)
        .reverse()
        .join(' ')} Z`
    : null

  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => min + t * (max - min))
  const yearTicks = Array.from({ length: Math.floor(endMonth / 60) + 1 }, (_, i) => i * 60).filter(
    (month) => month >= startMonth,
  )

  function handleMove(event: React.PointerEvent<SVGSVGElement>) {
    const rect = event.currentTarget.getBoundingClientRect()
    const ratio = ((event.clientX - rect.left) / rect.width) * WIDTH
    const month = Math.round(((ratio - PAD.left) / plotW) * lastMonth)
    setHover(Math.min(Math.max(month, 0), lastMonth))
  }

  const active = hover ?? lastMonth

  return (
    <figure className="chart">
      <figcaption className="chart-caption">
        <span>{label}</span>
        <span className="chart-readout">
          {formatMonthLabel(startMonth + active)} · <strong>{formatMoney(series[active]!)}</strong>
          {band ? (
            <>
              {' '}
              · {band.label}: {formatMoney(band.lower[active]!)}–{formatMoney(band.upper[active]!)}
            </>
          ) : null}
        </span>
      </figcaption>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="chart-svg"
        role="img"
        aria-label={`${label} over ${endMonth} months`}
        onPointerMove={handleMove}
        onPointerLeave={() => setHover(null)}
      >
        {ticks.map((value) => (
          <g key={value}>
            <line
              x1={PAD.left}
              x2={WIDTH - PAD.right}
              y1={y(value)}
              y2={y(value)}
              className="chart-grid"
            />
            <text x={PAD.left - 10} y={y(value)} dy="0.32em" className="chart-tick" textAnchor="end">
              {formatMoney(value)}
            </text>
          </g>
        ))}
        {yearTicks.map((month) => (
          <text key={month} x={x(month - startMonth)} y={HEIGHT - 8} className="chart-tick" textAnchor="middle">
            {month / 12}y
          </text>
        ))}
        {band && bandArea ? (
          <>
            <path d={bandArea} className="chart-band" />
            <path d={path(band.upper)} className="chart-band-edge" />
            <path d={path(band.lower)} className="chart-band-edge" />
          </>
        ) : (
          <path d={area} className="chart-area" />
        )}
        <path d={line} className="chart-line" />
        <line
          x1={x(active)}
          x2={x(active)}
          y1={PAD.top}
          y2={PAD.top + plotH}
          className="chart-crosshair"
        />
        <circle cx={x(active)} cy={y(series[active]!)} r={4} className="chart-dot" />
      </svg>
      {band ? (
        <p className="chart-legend">
          <span className="chart-key chart-key-line" aria-hidden="true" />
          Your rate
          <span className="chart-key chart-key-band" aria-hidden="true" />
          {band.label}
        </p>
      ) : null}
    </figure>
  )
}
