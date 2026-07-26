/**
 * Segmented, underline-style date and time entry — `mm / dd / yyyy` and
 * `hh : mm am` — typed directly, no popover. On coarse pointers the parent
 * form keeps the native <input type="date"/"time"> (the OS wheel), which is
 * far better on phones; these are the desktop path.
 *
 * Both components read/write the SAME string formats the native inputs use
 * ("YYYY-MM-DD", "HH:mm" 24h), emitting '' while the entry is incomplete.
 */
import { useEffect, useRef, useState } from 'react'

export function useCoarsePointer() {
  const [coarse, setCoarse] = useState(
    () => window.matchMedia?.('(pointer: coarse)').matches ?? false,
  )
  useEffect(() => {
    const mq = window.matchMedia('(pointer: coarse)')
    const on = () => setCoarse(mq.matches)
    mq.addEventListener?.('change', on)
    return () => mq.removeEventListener?.('change', on)
  }, [])
  return coarse
}

const pad = (n: number) => String(n).padStart(2, '0')
const digits = (s: string) => s.replace(/\D/g, '')

function Part({
  value,
  placeholder,
  width,
  disabled,
  inputRef,
  onInput,
  label,
}: {
  value: string
  placeholder: string
  width: number
  disabled?: boolean
  inputRef?: React.RefObject<HTMLInputElement>
  onInput: (v: string) => void
  label: string
}) {
  return (
    <input
      ref={inputRef}
      className="dt-part"
      style={{ width: `${width}ch` }}
      inputMode="numeric"
      placeholder={placeholder}
      maxLength={width}
      value={value}
      disabled={disabled}
      aria-label={label}
      onChange={(e) => onInput(digits(e.target.value))}
      onFocus={(e) => e.target.select()}
    />
  )
}

export function DatePicker({
  value,
  onChange,
}: {
  value: string
  onChange: (v: string) => void
}) {
  const parsed = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  const [m, setM] = useState(parsed ? parsed[2] : '')
  const [d, setD] = useState(parsed ? parsed[3] : '')
  const [y, setY] = useState(parsed ? parsed[1] : '')
  const dRef = useRef<HTMLInputElement>(null)
  const yRef = useRef<HTMLInputElement>(null)

  function emit(mm: string, dd: string, yy: string) {
    const mi = +mm
    const di = +dd
    const yi = +yy
    if (mm.length >= 1 && mi >= 1 && mi <= 12 && dd.length >= 1 && di >= 1 && di <= 31 && yy.length === 4 && yi > 1000) {
      onChange(`${yy}-${pad(mi)}-${pad(di)}`)
    } else {
      onChange('')
    }
  }

  return (
    <div className="dt-seg" role="group" aria-label="birth date">
      <Part value={m} placeholder="mm" width={2} label="month" onInput={(v) => { setM(v); emit(v, d, y); if (v.length === 2) dRef.current?.focus() }} />
      <span className="dt-sep" aria-hidden>/</span>
      <Part value={d} placeholder="dd" width={2} label="day" inputRef={dRef} onInput={(v) => { setD(v); emit(m, v, y); if (v.length === 2) yRef.current?.focus() }} />
      <span className="dt-sep" aria-hidden>/</span>
      <Part value={y} placeholder="yyyy" width={4} label="year" inputRef={yRef} onInput={(v) => { setY(v); emit(m, d, v) }} />
    </div>
  )
}

export function TimePicker({
  value,
  onChange,
  disabled,
}: {
  value: string
  onChange: (v: string) => void
  disabled?: boolean
}) {
  const parsed = /^(\d{2}):(\d{2})$/.exec(value)
  const h24 = parsed ? +parsed[1] : null
  const [h, setH] = useState(h24 !== null ? String(h24 % 12 || 12) : '')
  const [min, setMin] = useState(parsed ? parsed[2] : '')
  const [pm, setPm] = useState(h24 !== null ? h24 >= 12 : false)
  const minRef = useRef<HTMLInputElement>(null)

  function emit(hh: string, mm: string, isPm: boolean) {
    const hi = +hh
    const mi = +mm
    if (hh.length >= 1 && hi >= 1 && hi <= 12 && mm.length === 2 && mi <= 59) {
      const h24out = (hi % 12) + (isPm ? 12 : 0)
      onChange(`${pad(h24out)}:${pad(mi)}`)
    } else {
      onChange('')
    }
  }

  return (
    <div className="dt-seg" role="group" aria-label="birth time">
      <Part value={h} placeholder="hh" width={2} disabled={disabled} label="hour" onInput={(v) => { setH(v); emit(v, min, pm); if (v.length === 2 || +v > 1) minRef.current?.focus() }} />
      <span className="dt-sep" aria-hidden>:</span>
      <Part value={min} placeholder="mm" width={2} disabled={disabled} label="minutes" inputRef={minRef} onInput={(v) => { setMin(v); emit(h, v, pm) }} />
      <button
        type="button"
        className="dt-ampm"
        disabled={disabled}
        onClick={() => {
          setPm(!pm)
          emit(h, min, !pm)
        }}
      >
        {pm ? 'pm' : 'am'}
      </button>
    </div>
  )
}
