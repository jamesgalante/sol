import type { View } from '../lib/types'

const ITEMS = [
  { name: 'record', label: 'record' },
  { name: 'journal', label: 'journal' },
  { name: 'stats', label: 'stats' },
  { name: 'circle', label: 'circle' },
] as const

export function Nav({ view, onNavigate }: { view: View; onNavigate: (v: View) => void }) {
  const current = view.name === 'dream' ? 'journal' : view.name
  return (
    <nav className="nav" aria-label="Main">
      <div className="nav-inner">
        {ITEMS.map((item) => (
          <button
            key={item.name}
            className="nav-item"
            aria-current={current === item.name}
            onClick={() => onNavigate({ name: item.name })}
          >
            {item.label}
          </button>
        ))}
      </div>
    </nav>
  )
}
