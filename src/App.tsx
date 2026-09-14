import { loadPlugin, useScene } from '@pascal-app/core'
import { builtinPlugin } from '@pascal-app/nodes'
import { Viewer } from '@pascal-app/viewer'
import { CameraControls } from '@react-three/drei'
import { useEffect, useState } from 'react'

const registryReady = loadPlugin(builtinPlugin)

type LoadState = 'loading' | 'ready' | 'error'

export default function App() {
  const [registryOk, setRegistryOk] = useState(false)
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [error, setError] = useState<string | null>(null)
  const [nodeCount, setNodeCount] = useState(0)

  useEffect(() => {
    let cancelled = false
    registryReady.then(() => {
      if (!cancelled) setRegistryOk(true)
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!registryOk) return
    let cancelled = false
    fetch('/house.scene.json')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json()
      })
      .then((graph: { nodes: Record<string, any>; rootNodeIds: string[] }) => {
        if (cancelled) return
        useScene.getState().setScene(graph.nodes as any, graph.rootNodeIds as any)
        setNodeCount(Object.keys(graph.nodes).length)
        setLoadState('ready')
      })
      .catch((e: unknown) => {
        if (cancelled) return
        setError(e instanceof Error ? e.message : String(e))
        setLoadState('error')
      })
    return () => {
      cancelled = true
    }
  }, [registryOk])

  if (!registryOk || loadState === 'loading') {
    return <div className="overlay">Loading house…</div>
  }

  if (loadState === 'error') {
    return <div className="overlay">Failed to load house scene: {error}</div>
  }

  return (
    <div className="app">
      <header className="hud">
        <div>
          <h1>PlayGround House</h1>
          <p>
            Single-storey 10 × 7 m family house built with{' '}
            <a href="https://github.com/pascalorg/editor">pascalorg/editor</a> — {nodeCount}{' '}
            nodes, 4 rooms, gable roof.
          </p>
        </div>
        <div className="badge">Pascal scene: public/house.scene.json</div>
      </header>
      <main className="viewport">
        <Viewer>
          <CameraControls makeDefault minDistance={3} maxDistance={60} />
        </Viewer>
      </main>
    </div>
  )
}
