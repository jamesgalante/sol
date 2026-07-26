import { useEffect, useRef, useState } from 'react'

/**
 * Themed date/time pickers for desktop web. On touch devices the birth-chart
 * form keeps the native <input type="date"/"time"> (the OS wheel), which is
 * good and hard to beat; these replace only the browser's un-themeable desktop
 * popup with something that matches DESIGN.md — mono numerals, --dawn accent,
 * --line hairlines, --ink surface.
 *
 * Both components read/write the SAME string formats the native inputs use
 * (date "YYYY-MM-DD", time "HH:MM" 24h) so the form's save/sync logic is
 * untouched.
 */

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]
const MON3 = MONTHS.map((m) => m.slice(0, 3))
const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

// True on touch/mobile, where we defer to the native picker.
export function useCoarsePointer() {
  const [coarse, setCoarse] = useState(
    () => typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches,
  )
  useEffect(() => {
    const mq = window.matchMedia('(pointer: coarse)')
    const on = () => setCoarse(mq.matches)
    mq.addEventListener?.('change', on)
    return () => mq.removeEventListener?.('change', on)
  }, [])
  return coarse
}

function pad(n: number) {
  return String(n).padStart(2, '0')
}

// Parse a local "YYYY-MM-DD" without the UTC shift `new Date(str)` would apply.
function parseDate(v: string): { y: number; m: number; d: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v)
  if (!m) return null
  return { y: +m[1], m: +m[2] - 1, d: +m[3] }
}

function parseTime(v: string): { h: number; m: number } | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(v)
  if (!m) return null
  return { h: +m[1], m: +m[2] }
}

// Close on outside-click / Escape while a popover is open.
function useDismiss(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    function onDown(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) close()
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') close()
    }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, close])
  return ref
}

export function DatePicker({
  value,
  onChange,
}: {
  value: string
  onChange: (v: string) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useDismiss(open, () => setOpen(false))
  const sel = parseDate(value)

  const now = new Date()
  const [viewY, setViewY] = useState(sel?.y ?? now.getFullYear())
  const [viewM, setViewM] = useState(sel?.m ?? now.getMonth())

  // Re-center the calendar when the value changes from outside (e.g. edit).
  useEffect(() => {
    if (sel) {
      setViewY(sel.y)
      setViewM(sel.m)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  function step(months: number) {
    const d = new Date(viewY, viewM + months, 1)
    setViewY(d.getFullYear())
    setViewM(d.getMonth())
  }

  const firstDow = new Date(viewY, viewM, 1).getDay()
  const daysInMonth = new Date(viewY, viewM + 1, 0).getDate()
  const label = sel ? `${sel.d} ${MON3[sel.m]} ${sel.y}` : 'select a date'

  return (
    <div className="dt-field" ref={ref}>
      <button
        type="button"
        className={`auth-input dt-trigger${sel ? '' : ' dt-empty'}`}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        {label}
        <span className="dt-caret" aria-hidden="true">▾</span>
      </button>
      {open && (
        <div className="dt-pop" role="dialog" aria-label="choose a date">
          <div className="dt-head">
            <button type="button" className="dt-nav" aria-label="previous year" onClick={() => step(-12)}>
              «
            </button>
            <button type="button" className="dt-nav" aria-label="previous month" onClick={() => step(-1)}>
              ‹
            </button>
            <span className="dt-title">
              {MONTHS[viewM]} {viewY}
            </span>
            <button type="button" className="dt-nav" aria-label="next month" onClick={() => step(1)}>
              ›
            </button>
            <button type="button" className="dt-nav" aria-label="next year" onClick={() => step(12)}>
              »
            </button>
          </div>
          <div className="dt-grid dt-weekdays">
            {WEEKDAYS.map((w, i) => (
              <span key={i} className="dt-wd">
                {w}
              </span>
            ))}
          </div>
          <div className="dt-grid">
            {Array.from({ length: firstDow }).map((_, i) => (
              <span key={`b${i}`} className="dt-blank" />
            ))}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1
              const isSel = !!sel && sel.y === viewY && sel.m === viewM && sel.d === day
              const isToday =
                now.getFullYear() === viewY && now.getMonth() === viewM && now.getDate() === day
              return (
                <button
                  key={day}
                  type="button"
                  className={`dt-day${isSel ? ' is-selected' : ''}${isToday ? ' is-today' : ''}`}
                  aria-pressed={isSel}
                  onClick={() => {
                    onChange(`${viewY}-${pad(viewM + 1)}-${pad(day)}`)
                    setOpen(false)
                  }}
                >
                  {day}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

const HOURS = Array.from({ length: 24 }, (_, h) => ({
  h,
  label: `${h % 12 || 12} ${h < 12 ? 'am' : 'pm'}`,
}))
const MINUTES = Array.from({ length: 60 }, (_, m) => m)

export function TimePicker({
  value,
  onChange,
  disabled,
}: {
  value: string
  onChange: (v: string) => void
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const ref = useDismiss(open, () => setOpen(false))
  const sel = parseTime(value)
  const hourSel = useRef<HTMLButtonElement>(null)
  const minSel = useRef<HTMLButtonElement>(null)

  // Bring the current hour/minute into view each time the popover opens.
  useEffect(() => {
    if (!open) return
    hourSel.current?.scrollIntoView({ block: 'center' })
    minSel.current?.scrollIntoView({ block: 'center' })
  }, [open])

  const label = sel ? `${sel.h % 12 || 12}:${pad(sel.m)} ${sel.h < 12 ? 'am' : 'pm'}` : 'select a time'

  return (
    <div className="tp-field" ref={ref}>
      <button
        type="button"
        className={`auth-input dt-trigger${sel ? '' : ' dt-empty'}`}
        onClick={() => setOpen((o) => !o)}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        {label}
        <span className="dt-caret" aria-hidden="true">▾</span>
      </button>
      {open && (
        <div className="tp-pop" role="dialog" aria-label="choose a time">
          <div className="tp-colwrap">
            <span className="tp-colhead">hour</span>
            <div className="tp-col">
              {HOURS.map(({ h, label: hl }) => {
                const on = sel?.h === h
                return (
                  <button
                    key={h}
                    ref={on ? hourSel : undefined}
                    type="button"
                    className={`tp-option${on ? ' is-selected' : ''}`}
                    aria-pressed={on}
                    onClick={() => onChange(`${pad(h)}:${pad(sel?.m ?? 0)}`)}
                  >
                    {hl}
                  </button>
                )
              })}
            </div>
          </div>
          <div className="tp-colwrap">
            <span className="tp-colhead">min</span>
            <div className="tp-col">
              {MINUTES.map((m) => {
                const on = sel?.m === m
                return (
                  <button
                    key={m}
                    ref={on ? minSel : undefined}
                    type="button"
                    className={`tp-option${on ? ' is-selected' : ''}`}
                    aria-pressed={on}
                    onClick={() => onChange(`${pad(sel?.h ?? 0)}:${pad(m)}`)}
                  >
                    {pad(m)}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
