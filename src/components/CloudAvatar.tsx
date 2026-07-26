// A person's cloud — colored by their equipped streak color, wearing the
// items their achievements earned. The profile centerpiece.
import { CLOUD_COLORS, type CloudColor, type ItemId } from '../lib/achievements'

export function CloudAvatar({
  color = 'fog',
  items = [],
  size = 120,
}: {
  color?: CloudColor
  items?: ItemId[]
  size?: number
}) {
  const def = CLOUD_COLORS.find((c) => c.id === color) ?? CLOUD_COLORS[0]
  const solar = color === 'solar'
  const midnight = color === 'midnight'
  const has = (i: ItemId) => items.includes(i)

  return (
    <svg
      width={size}
      height={size * 0.78}
      viewBox="0 0 96 75"
      className="cloud-avatar"
      style={
        solar
          ? { filter: 'drop-shadow(0 0 14px rgba(236,179,95,0.45))' }
          : midnight
            ? { filter: 'drop-shadow(0 0 10px rgba(201,208,227,0.3))' }
            : undefined
      }
      aria-hidden
    >
      {/* bolt hangs beneath */}
      {has('bolt') && (
        <path
          d="M46 62 L41 71 L46 70 L43 78"
          fill="none"
          stroke="#ecb35f"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
      {/* the cloud */}
      <g fill={def.fill}>
        <circle cx="48" cy="40" r="20" />
        <circle cx="30" cy="46" r="14" />
        <circle cx="66" cy="46" r="14" />
        <circle cx="38" cy="30" r="13" />
        <circle cx="58" cy="30" r="13" />
        <rect x="22" y="44" width="52" height="16" rx="8" />
      </g>
      {/* silver lining */}
      {has('lining') && (
        <path
          d="M20 52 q -2 -10 8 -16 q 2 -10 13 -11 q 6 -8 16 -4"
          fill="none"
          stroke="#c9d0e3"
          strokeWidth="2"
          strokeLinecap="round"
          opacity="0.9"
        />
      )}
      {/* sleepy face */}
      <g stroke={midnight ? 'var(--bone)' : 'var(--night)'} strokeWidth="1.8" strokeLinecap="round" fill="none">
        <path d="M40 45 q 2.5 2.6 5 0" />
        <path d="M53 45 q 2.5 2.6 5 0" />
      </g>
      {/* nightcap */}
      {has('cap') && (
        <g>
          <path d="M36 20 q 8 -14 24 -8 l -4 10 q -10 -6 -20 -2 z" fill="var(--ink-2)" />
          <circle cx="61" cy="13" r="3.2" fill="var(--bone)" />
        </g>
      )}
      {/* star charm */}
      {has('star') && (
        <path
          d="M83 26 l 1.6 3.6 3.6 0.5 -2.6 2.6 0.6 3.7 -3.2 -1.8 -3.2 1.8 0.6 -3.7 -2.6 -2.6 3.6 -0.5 z"
          fill="#ecb35f"
        />
      )}
      {/* moon charm */}
      {has('moon') && (
        <path d="M12 24 a 7 7 0 1 0 7 9 a 5.6 5.6 0 1 1 -7 -9 z" fill="#c9d0e3" />
      )}
      {/* pinned flag */}
      {has('flag') && (
        <g>
          <line x1="70" y1="22" x2="70" y2="10" stroke="var(--fog)" strokeWidth="1.6" strokeLinecap="round" />
          <path d="M70 10 l 9 3 -9 3 z" fill="#d07f7f" />
        </g>
      )}
    </svg>
  )
}
