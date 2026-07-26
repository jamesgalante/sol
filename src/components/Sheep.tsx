/** The sól sheep — a sleepy guide made of cloud-stuff.
 *  Wool in bone, face in night, drawn to sit on a hairline horizon. */
export function Sheep({ size = 96 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size * 0.72}
      viewBox="0 0 64 46"
      className="sheep"
      aria-hidden
    >
      {/* legs */}
      <g stroke="var(--fog-dim)" strokeWidth="1.6" strokeLinecap="round">
        <line x1="24" y1="33" x2="23" y2="43" />
        <line x1="31" y1="34" x2="31" y2="43" />
        <line x1="38" y1="34" x2="38" y2="43" />
        <line x1="45" y1="33" x2="46" y2="43" />
      </g>
      {/* tail */}
      <circle cx="52" cy="22" r="4" fill="var(--bone)" />
      {/* wool */}
      <g fill="var(--bone)">
        <circle cx="34" cy="25" r="11" />
        <circle cx="26" cy="27" r="8" />
        <circle cx="43" cy="27" r="8" />
        <circle cx="29" cy="18" r="8" />
        <circle cx="40" cy="18" r="8" />
      </g>
      {/* head */}
      <ellipse cx="14" cy="20" rx="7.5" ry="8.5" fill="var(--ink-2)" />
      {/* ear */}
      <ellipse cx="8" cy="16" rx="4" ry="2.4" fill="var(--ink-2)" transform="rotate(-24 8 16)" />
      {/* wool tuft over the brow */}
      <circle cx="17" cy="11" r="4.5" fill="var(--bone)" />
      <circle cx="12" cy="12" r="3.5" fill="var(--bone)" />
      {/* sleepy closed eye */}
      <path
        d="M 10.5 20.5 q 2 2.2 4.5 0"
        fill="none"
        stroke="var(--bone)"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  )
}
