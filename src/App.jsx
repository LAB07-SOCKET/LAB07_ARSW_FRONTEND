import { useEffect, useRef, useState, useMemo } from 'react'
import { createStompClient, subscribeBlueprint } from './lib/stompClient.js'
import { createSocket } from './lib/socketIoClient.js'
import { createApi } from './lib/blueprintsApi.js'

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:8080'
const IO_BASE  = import.meta.env.VITE_IO_BASE  ?? 'http://localhost:3001'

export default function App() {
  const [tech, setTech] = useState('socketio')
  const [author, setAuthor] = useState('juan')
  const [name, setName] = useState('plano-1')
  const [list, setList] = useState([])
  const [total, setTotal]     = useState(0)
  const [newName, setNewName] = useState('')
  const [status, setStatus]   = useState('')

  const canvasRef = useRef(null)
  const pointsRef = useRef([])  
  const stompRef  = useRef(null)
  const unsubRef  = useRef(null)
  const socketRef = useRef(null)

  const api = useMemo(
    () => createApi(tech === 'stomp' ? API_BASE : IO_BASE),
    [tech]
  )

  // Dibuja todos los puntos acumulados 
  function redraw() {
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, 600, 400)
    ctx.strokeStyle = '#2563eb'
    ctx.lineWidth = 2
    const pts = pointsRef.current
    if (pts.length === 0) return
    ctx.beginPath()
    ctx.moveTo(pts[0].x, pts[0].y)
    pts.forEach(p => ctx.lineTo(p.x, p.y))
    ctx.stroke()
    pts.forEach(p => {
      ctx.beginPath()
      ctx.arc(p.x, p.y, 4, 0, Math.PI * 2)
      ctx.fillStyle = '#2563eb'
      ctx.fill()
    })
  }

  // Agrega nuevos puntos al estado y redibuja
  function appendPoints(newPoints) {
    pointsRef.current = [...pointsRef.current, ...newPoints]
    redraw()
  }

    // Lista del autor para mostrar el total de puntos
  async function loadList() {
    try {
      const data = await api.list(author)
      setList(data.blueprints ?? [])
      setTotal(data.totalPoints ?? 0)
    } catch { setList([]); setTotal(0) }
  }

  useEffect(() => { loadList() }, [author, tech])

  // Carga el estado inicial
  useEffect(() => {
    const base = tech === 'stomp' ? API_BASE : IO_BASE
    pointsRef.current = []
    fetch(`${base}/api/blueprints/${author}/${name}`)
      .then(r => r.json())
      .then(bp => appendPoints(bp.points ?? []))
      .catch(err => console.error('GET inicial falló:', err))
  }, [tech, author, name])

  // Configura la conexion WebSocket 
  useEffect(() => {
    unsubRef.current?.()
    unsubRef.current = null
    stompRef.current?.deactivate?.()
    stompRef.current = null
    socketRef.current?.disconnect?.()
    socketRef.current = null

    if (tech === 'stomp') {
      const client = createStompClient(API_BASE)
      stompRef.current = client
      client.onConnect = () => {
        unsubRef.current = subscribeBlueprint(client, author, name, upd => {
          appendPoints(upd.points ?? [])
        })
      }
      client.activate()
    } else {
      const s = createSocket(IO_BASE)
      socketRef.current = s
      const room = `blueprints.${author}.${name}`
      s.on('connect', () => {
        console.log('Socket.IO conectado, joining room:', room)
        s.emit('join-room', room)
      })
      s.on('blueprint-update', upd => {
        console.log('blueprint-update recibido:', upd)
        appendPoints(upd.points ?? [])
      })
    }

    return () => {
      unsubRef.current?.()
      unsubRef.current = null
      stompRef.current?.deactivate?.()
      socketRef.current?.disconnect?.()
    }
  }, [tech, author, name])

  // Maneja clicks en el canvas para dibujar y enviar eventos
  function onClick(e) {
    const rect = e.target.getBoundingClientRect()
    const point = {
      x: Math.round(e.clientX - rect.left),
      y: Math.round(e.clientY - rect.top),
    }

    appendPoints([point])

    if (tech === 'stomp' && stompRef.current?.connected) {
      stompRef.current.publish({
        destination: '/app/draw',
        body: JSON.stringify({ author, name, point }),
      })
    } else if (tech === 'socketio' && socketRef.current?.connected) {
      const room = `blueprints.${author}.${name}`
      socketRef.current.emit('draw-event', { room, author, name, point })
    }
  }

    // Maneja la creacion de un nuevo plano
  async function handleCreate() {
    if (!newName.trim()) return
    try {
      await api.create(author, newName.trim())
      setStatus(`✅ Creado: ${newName}`)
      setNewName('')
      loadList()
    } catch (e) { setStatus(`❌ ${e.error ?? 'Error al crear'}`) }
  }
 
  // Maneja el guardado del plano actual
  async function handleSave() {
    try {
      await api.save(author, name, pointsRef.current)
      setStatus('✅ Guardado')
      loadList()
    } catch { setStatus('❌ Error al guardar') }
  }

  // Maneja la eliminacion del plano actual
  async function handleDelete(bpName) {
    try {
      await api.remove(author, bpName)
      setStatus(`🗑️ Eliminado: ${bpName}`)
      if (bpName === name) { pointsRef.current = []; redraw() }
      loadList()
    } catch { setStatus('❌ Error al eliminar') }
  }

  return (
    <div style={{ fontFamily: 'Inter, system-ui', padding: 16, display: 'flex', gap: 24, maxWidth: 1100 }}>

      {/* Panel izquierdo — CRUD */}
      <div style={{ width: 300, flexShrink: 0 }}>
        <h2 style={{ marginTop: 0 }}>BluePrints RT</h2>

        <div style={{ display: 'flex', gap: 6, marginBottom: 10, alignItems: 'center' }}>
          <label>Tecnología:</label>
          <select value={tech} onChange={e => setTech(e.target.value)}>
            <option value="socketio">Socket.IO (Node)</option>
            <option value="stomp">STOMP (Spring)</option>
          </select>
        </div>

        <div style={{ display: 'flex', gap: 6, marginBottom: 12, alignItems: 'center' }}>
          <label>Autor:</label>
          <input value={author} onChange={e => setAuthor(e.target.value)} placeholder="autor" style={{ width: 120 }} />
        </div>

        <h3 style={{ marginBottom: 4 }}>Planos de {author}</h3>
        <p style={{ margin: '0 0 8px', opacity: .7, fontSize: 13 }}>
          Total puntos: <strong>{total}</strong>
        </p>

        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#f1f5f9' }}>
              <th style={{ textAlign: 'left', padding: '4px 8px' }}>Nombre</th>
              <th style={{ textAlign: 'right', padding: '4px 8px' }}>Pts</th>
              <th style={{ padding: '4px 8px' }}></th>
            </tr>
          </thead>
          <tbody>
            {list.map(bp => (
              <tr key={bp.name}
                style={{ background: bp.name === name ? '#dbeafe' : 'transparent', cursor: 'pointer' }}
                onClick={() => setName(bp.name)}>
                <td style={{ padding: '4px 8px' }}>{bp.name}</td>
                <td style={{ padding: '4px 8px', textAlign: 'right' }}>{bp.points.length}</td>
                <td style={{ padding: '4px 8px', textAlign: 'center' }}>
                  <button onClick={e => { e.stopPropagation(); handleDelete(bp.name) }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                    🗑️
                  </button>
                </td>
              </tr>
            ))}
            {list.length === 0 && (
              <tr><td colSpan={3} style={{ padding: 8, opacity: .5 }}>Sin planos</td></tr>
            )}
          </tbody>
        </table>

        {/* Crear nuevo plano */}
        <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
          <input value={newName} onChange={e => setNewName(e.target.value)}
            placeholder="nuevo nombre" style={{ flex: 1 }} />
          <button onClick={handleCreate}>➕</button>
        </div>

        {/* Guardar plano activo */}
        <button onClick={handleSave}
          style={{ marginTop: 8, width: '100%', background: '#2563eb', color: 'white',
            border: 'none', padding: '7px 0', borderRadius: 6, cursor: 'pointer', fontSize: 14 }}>
          💾 Guardar plano
        </button>

        {status && <p style={{ marginTop: 8, fontSize: 13 }}>{status}</p>}
      </div>

      {/* Panel derecho — Canvas */}
      <div>
        <p style={{ margin: '0 0 6px', opacity: .7, fontSize: 13 }}>
          Plano activo: <strong>{author}/{name}</strong>
        </p>
        <canvas ref={canvasRef} width={600} height={400}
          style={{ border: '1px solid #ddd', borderRadius: 12, cursor: 'crosshair', display: 'block' }}
          onClick={onClick} />
        <p style={{ opacity: .7, marginTop: 8, fontSize: 13 }}>
          Tip: abre 2 pestañas y dibuja alternando para ver la colaboración.
        </p>
      </div>
    </div>
  )
}