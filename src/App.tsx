import { useState } from 'react'
import type { View } from './lib/types'
import { Header } from './components/Header'
import { Nav } from './components/Nav'
import { Record } from './screens/Record'
import { Journal } from './screens/Journal'
import { DreamDetail } from './screens/DreamDetail'
import { Circle } from './screens/Circle'

export default function App() {
  const [view, setView] = useState<View>({ name: 'record' })

  return (
    <div className="shell">
      <Header />
      {view.name === 'record' && (
        <Record onSaved={(id) => setView({ name: 'dream', id })} />
      )}
      {view.name === 'journal' && <Journal onNavigate={setView} />}
      {view.name === 'dream' && <DreamDetail id={view.id} onNavigate={setView} />}
      {view.name === 'circle' && <Circle />}
      <Nav view={view} onNavigate={setView} />
    </div>
  )
}
