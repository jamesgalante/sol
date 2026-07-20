import { formatNight } from '../lib/time'

export function Header() {
  return (
    <header className="header">
      <span className="wordmark">
        s<em>ó</em>l
      </span>
      <span className="header-date">{formatNight(Date.now())}</span>
    </header>
  )
}
