import { useState } from 'react'
import { formatMoney, formatMonthLabel } from '../lib/format'

const WIDTH = 720
const HEIGHT = 260
const PAD = { top: 16, right: 16, bottom: 28, left: 68 }

interface CostChartProps {
  /** One value per month, starting at month 0. */
  series: readonly number[]
  label: string
}

/** A small hand-rolled area chart — no charting dependency needed for one series. */
export function CostChart({ series, label }: CostChartProps) {
  const [hover, setHover] = useState<number | null>(null)

  if (series.length < 2) return null

  const plotW = WIDTH - PAD.left - PAD.right
  const plotH = HEIGHT - PAD.top - PAD.bottom
  const lastMonth = series.length - 1

  const rawMin = Math.min(...series)
  const rawMax = Math.max(...series)
  const pad = (rawMax - rawMin) * 0.1 || Math.abs(rawMax) * 0.1 || 1
  const min = rawMin - pad
  const max = rawMax + pad

  const x = (month: number) => PAD.left + (month / lastMonth) * plotW
  const y = (value: number) => PAD.top + (1 - (value - min) / (max - min)) * plotH

  const line = series.map((v, m) => `${m === 0 ? 'M' : 'L'}${x(m).toFixed(2)},${y(v).toFixed(2)}`).join(' ')
  const area = `${line} L${x(lastMonth).toFixed(2)},${(PAD.top + plotH).toFixed(2)} L${PAD.left.toFixed(2)},${(PAD.top + plotH).toFixed(2)} Z`

  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => min + t * (max - min))
  const yearTicks = Array.from({ length: Math.floor(lastMonth / 60) + 1 }, (_, i) => i * 60)

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
          {formatMonthLabel(active)} · <strong>{formatMoney(series[active]!)}</strong>
        </span>
      </figcaption>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="chart-svg"
        role="img"
        aria-label={`${label} over ${lastMonth} months`}
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
          <text key={month} x={x(month)} y={HEIGHT - 8} className="chart-tick" textAnchor="middle">
            {month / 12}y
          </text>
        ))}
        <path d={area} className="chart-area" />
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
    </figure>
  )
}
