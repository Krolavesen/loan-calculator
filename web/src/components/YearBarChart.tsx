import { useState } from 'react'
import { formatMoney } from '../lib/format'

const WIDTH = 720
const HEIGHT = 200
const PAD = { top: 12, right: 16, bottom: 26, left: 68 }

interface YearBarChartProps {
  /** One value per year of the loan, year 1 first. */
  values: readonly number[]
  label: string
}

/** A bar per year, in the same style as the cost chart. */
export function YearBarChart({ values, label }: YearBarChartProps) {
  const [hover, setHover] = useState<number | null>(null)

  if (values.length === 0) return null

  const plotW = WIDTH - PAD.left - PAD.right
  const plotH = HEIGHT - PAD.top - PAD.bottom
  const max = Math.max(...values) || 1
  const slot = plotW / values.length
  const gap = Math.min(4, slot * 0.2)

  const y = (value: number) => PAD.top + (1 - value / max) * plotH
  const ticks = [0, 0.5, 1].map((t) => t * max)
  const yearTicks = values.map((_, i) => i + 1).filter((year) => year === 1 || year % 5 === 0)

  const active = hover ?? 0

  function handleMove(event: React.PointerEvent<SVGSVGElement>) {
    const rect = event.currentTarget.getBoundingClientRect()
    const ratio = ((event.clientX - rect.left) / rect.width) * WIDTH
    const index = Math.floor((ratio - PAD.left) / slot)
    setHover(Math.min(Math.max(index, 0), values.length - 1))
  }

  return (
    <figure className="chart">
      <figcaption className="chart-caption">
        <span>{label}</span>
        <span className="chart-readout">
          Year {active + 1} · <strong>{formatMoney(values[active]!)}</strong>
        </span>
      </figcaption>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="chart-svg"
        role="img"
        aria-label={`${label} per year over ${values.length} years`}
        onPointerMove={handleMove}
        onPointerLeave={() => setHover(null)}
      >
        {ticks.map((value) => (
          <g key={value}>
            <line x1={PAD.left} x2={WIDTH - PAD.right} y1={y(value)} y2={y(value)} className="chart-grid" />
            <text x={PAD.left - 10} y={y(value)} dy="0.32em" className="chart-tick" textAnchor="end">
              {formatMoney(value)}
            </text>
          </g>
        ))}
        {values.map((value, i) => (
          <rect
            key={i}
            x={PAD.left + i * slot + gap / 2}
            y={y(value)}
            width={Math.max(slot - gap, 1)}
            height={PAD.top + plotH - y(value)}
            className={i === active ? 'chart-bar chart-bar-active' : 'chart-bar'}
          />
        ))}
        {yearTicks.map((year) => (
          <text
            key={year}
            x={PAD.left + (year - 0.5) * slot}
            y={HEIGHT - 8}
            className="chart-tick"
            textAnchor="middle"
          >
            {year}
          </text>
        ))}
      </svg>
    </figure>
  )
}
