import { useEffect, useState } from 'react'
import type { View } from './lib/types'
import { Header } from './components/Header'
import { Nav } from './components/Nav'
import { Record } from './screens/Record'
import { Journal } from './screens/Journal'
import { DreamDetail } from './screens/DreamDetail'
import { Stats } from './screens/Stats'
import { Circle } from './screens/Circle'
import { Welcome } from './screens/Welcome'
import { Profile } from './screens/Profile'
import { Me } from './screens/Me'
import { BirthChart } from './screens/BirthChart'

const WELCOMED_KEY = 'sol:welcomed'

function viewFromHash(): View {
  const h = window.location.hash.slice(1)
  if (h === 'journal') return { name: 'journal' }
  if (h === 'stats') return { name: 'stats' }
  if (h === 'circle') return { name: 'circle' }
  if (h === 'me') return { name: 'me' }
  if (h === 'birth-chart') return { name: 'birth-chart' }
  if (h.startsWith('dream/')) return { name: 'dream', id: h.slice('dream/'.length) }
  if (h.startsWith('u/')) return { name: 'profile', username: h.slice('u/'.length) }
  return { name: 'record' }
}

function hashFor(view: View): string {
  if (view.name === 'record' || view.name === 'welcome') return ''
  if (view.name === 'dream') return `dream/${view.id}`
  if (view.name === 'profile') return `u/${view.username}`
  return view.name
}

export default function App() {
  const [view, setView] = useState<View>(() =>
    localStorage.getItem(WELCOMED_KEY) ? viewFromHash() : { name: 'welcome' },
  )

  useEffect(() => {
    const onHash = () => setView(viewFromHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  function navigate(v: View) {
    window.location.hash = hashFor(v)
    setView(v)
  }

  if (view.name === 'welcome') {
    return (
      <div className="shell">
        <Welcome
          onDone={() => {
            localStorage.setItem(WELCOMED_KEY, '1')
            navigate({ name: 'record' })
          }}
        />
      </div>
    )
  }

  return (
    <div className="shell">
      <Header />
      {view.name === 'record' && (
        <Record onSaved={(id) => navigate({ name: 'dream', id })} />
      )}
      {view.name === 'journal' && <Journal onNavigate={navigate} />}
      {view.name === 'dream' && <DreamDetail id={view.id} onNavigate={navigate} />}
      {view.name === 'stats' && <Stats />}
      {view.name === 'circle' && <Circle onNavigate={navigate} />}
      {view.name === 'me' && <Me onNavigate={navigate} />}
      {view.name === 'birth-chart' && <BirthChart onNavigate={navigate} />}
      {view.name === 'profile' && <Profile username={view.username} onNavigate={navigate} />}
      <Nav view={view} onNavigate={navigate} />
    </div>
  )
}
