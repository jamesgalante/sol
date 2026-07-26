import { useEffect, useState } from 'react'
import type { View } from './lib/types'
import { Header } from './components/Header'
import { Nav } from './components/Nav'
import { Record } from './screens/Record'
import { Journal } from './screens/Journal'
import { DreamDetail } from './screens/DreamDetail'
import { Stats } from './screens/Stats'
import { Circle } from './screens/Circle'
import { Sky } from './components/Sky'

function viewFromHash(): View {
  const h = window.location.hash.slice(1)
  if (h === 'journal') return { name: 'journal' }
  if (h === 'stats') return { name: 'stats' }
  if (h === 'circle') return { name: 'circle' }
  if (h.startsWith('dream/')) return { name: 'dream', id: h.slice('dream/'.length) }
  return { name: 'record' }
}

function hashFor(view: View): string {
  if (view.name === 'record') return ''
  if (view.name === 'dream') return `dream/${view.id}`
  return view.name
}

export default function App() {
  const [view, setView] = useState<View>(viewFromHash)

  useEffect(() => {
    const onHash = () => setView(viewFromHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  function navigate(v: View) {
    window.location.hash = hashFor(v)
    setView(v)
  }

  return (
    <>
      <Sky />
      <div className="shell">
        <Header />
        {view.name === 'record' && (
          <Record onSaved={(id) => navigate({ name: 'dream', id })} />
        )}
        {view.name === 'journal' && <Journal onNavigate={navigate} />}
        {view.name === 'dream' && <DreamDetail id={view.id} onNavigate={navigate} />}
        {view.name === 'stats' && <Stats />}
        {view.name === 'circle' && <Circle />}
        <Nav view={view} onNavigate={navigate} />
      </div>
    </>
  )
}
