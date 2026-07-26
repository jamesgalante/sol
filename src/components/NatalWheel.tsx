// The natal chart wheel — inline SVG in the app's token palette, like CloudAvatar.
// Longitudes map to screen angles with the Ascendant pinned to the left horizon
// (9 o'clock); increasing zodiac longitude runs counter-clockwise, as on a real
// chart. When no exact time/location is known we anchor 0° Aries to the left,
// drop the houses/Ascendant, and show a caveat — the sky doesn't lie about what
// it can't know.
import type { NatalChart, Placement } from '../lib/types'
import { ZODIAC } from '../lib/types'
import { BODIES, SIGN_GLYPHS, glyphFor, noteFor } from '../lib/astrology'

const CX = 200
const CY = 200
const R_RIM = 192
const R_BAND = 158 // inner edge of the sign band
const R_HUB = 52
const R_SIGN_GLYPH = 175
const R_HOUSE_NUM = 74
const R_PLANET = 120

const DEG = Math.PI / 180
const norm = (d: number) => ((d % 360) + 360) % 360

export function NatalWheel({ chart, size = 320 }: { chart: NatalChart; size?: number }) {
  const anchor = chart.hasHouses && chart.ascendant ? chart.ascendant.longitude : 0
  const ascSign = chart.ascendant?.sign ?? null

  // longitude → screen angle (math degrees, CCW), Ascendant/0°Aries at left
  const angle = (lon: number) => 180 + (lon - anchor)
  const at = (lon: number, r: number) => {
    const a = angle(lon) * DEG
    return { x: CX + r * Math.cos(a), y: CY - r * Math.sin(a) }
  }

  // Declutter clustered planets by stepping radius inward for near neighbors.
  const sorted = [...chart.placements].sort((a, b) => a.longitude - b.longitude)
  const radiusFor = new Map<string, number>()
  let step = 0
  for (let i = 0; i < sorted.length; i++) {
    const prev = sorted[i - 1]
    const gap = prev ? norm(sorted[i].longitude - prev.longitude) : 999
    step = gap < 9 ? step + 1 : 0
    radiusFor.set(sorted[i].point, R_PLANET - (step % 3) * 22)
  }

  const signGlyphs = SIGN_GLYPHS.map((g, i) => {
    const p = at(i * 30 + 15, R_SIGN_GLYPH)
    return (
      <text key={i} x={p.x} y={p.y} className="nw-sign" dominantBaseline="central" textAnchor="middle">
        {g}
      </text>
    )
  })

  const spokes = Array.from({ length: 12 }, (_, i) => {
    const inner = at(i * 30, R_HUB)
    const outer = at(i * 30, R_RIM)
    return <line key={i} x1={inner.x} y1={inner.y} x2={outer.x} y2={outer.y} className="nw-spoke" />
  })

  const houseNums =
    chart.hasHouses && ascSign !== null
      ? Array.from({ length: 12 }, (_, i) => {
          const p = at(i * 30 + 15, R_HOUSE_NUM)
          const num = ((i - ascSign + 12) % 12) + 1
          return (
            <text key={i} x={p.x} y={p.y} className="nw-house" dominantBaseline="central" textAnchor="middle">
              {num}
            </text>
          )
        })
      : null

  const axis = (pl: Placement | null, label: string) => {
    if (!pl) return null
    const tip = at(pl.longitude, R_RIM + 4)
    const lab = at(pl.longitude, R_RIM + 16)
    return (
      <g>
        <line x1={CX} y1={CY} x2={tip.x} y2={tip.y} className="nw-axis" />
        <text x={lab.x} y={lab.y} className="nw-axis-label" dominantBaseline="central" textAnchor="middle">
          {label}
        </text>
      </g>
    )
  }

  const planets = chart.placements.map((pl) => {
    const r = radiusFor.get(pl.point) ?? R_PLANET
    const p = at(pl.longitude, r)
    const tick0 = at(pl.longitude, R_BAND)
    const tick1 = at(pl.longitude, R_BAND - 8)
    const luminary = pl.point === 'Sun' || pl.point === 'Moon'
    return (
      <g key={pl.point}>
        <line x1={tick0.x} y1={tick0.y} x2={tick1.x} y2={tick1.y} className="nw-tick" />
        <text
          x={p.x}
          y={p.y}
          className={luminary ? 'nw-planet nw-lum' : 'nw-planet'}
          dominantBaseline="central"
          textAnchor="middle"
        >
          {glyphFor(pl.point)}
        </text>
      </g>
    )
  })

  return (
    <svg
      className="natal-wheel"
      width={size}
      height={size}
      viewBox="0 0 400 400"
      role="img"
      aria-label={ariaSummary(chart)}
    >
      <circle cx={CX} cy={CY} r={R_RIM} className="nw-ring" />
      <circle cx={CX} cy={CY} r={R_BAND} className="nw-ring" />
      <circle cx={CX} cy={CY} r={R_HUB} className="nw-ring nw-hub" />
      {spokes}
      {signGlyphs}
      {houseNums}
      {axis(chart.ascendant, 'AC')}
      {axis(chart.midheaven, 'MC')}
      {planets}
    </svg>
  )
}

/** A single sentence describing the chart, for screen readers. */
function ariaSummary(chart: NatalChart): string {
  const big = ['Sun', 'Moon']
    .map((pt) => {
      const p = chart.placements.find((x) => x.point === pt)
      return p ? `${pt} in ${ZODIAC[p.sign]}` : null
    })
    .filter(Boolean)
  if (chart.ascendant) big.push(`${ZODIAC[chart.ascendant.sign]} rising`)
  return `Natal chart: ${big.join(', ')}.`
}

/** The readable placement list rendered beneath the wheel. */
export function NatalLegend({ chart }: { chart: NatalChart }) {
  const rows: Placement[] = [
    ...(chart.ascendant ? [chart.ascendant] : []),
    ...BODIES.map((b) => chart.placements.find((p) => p.point === b.point)!).filter(Boolean),
  ]
  return (
    <ul className="natal-legend">
      {rows.map((p) => (
        <li key={p.point} className="natal-legend-row">
          <span className="natal-legend-glyph" aria-hidden>
            {glyphFor(p.point)}
          </span>
          <span className="natal-legend-pos">
            <span className="natal-legend-point">{p.point === 'ASC' ? 'Rising' : p.point}</span>
            <span className="natal-legend-sign">
              {ZODIAC[p.sign]} {Math.floor(p.degree)}°{p.retrograde ? ' ℞' : ''}
              {p.house ? ` · house ${p.house}` : ''}
            </span>
          </span>
          {p.point !== 'ASC' && <span className="natal-legend-note">{noteFor(p)}</span>}
        </li>
      ))}
    </ul>
  )
}
