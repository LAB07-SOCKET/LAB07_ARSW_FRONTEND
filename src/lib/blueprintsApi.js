export function createApi(baseUrl) {
  const h = { 'Content-Type': 'application/json' }

  return {
    async list(author) {
      const r = await fetch(`${baseUrl}/api/blueprints?author=${author}`)
      return r.json()
    },
    async get(author, name) {
      const r = await fetch(`${baseUrl}/api/blueprints/${author}/${name}`)
      return r.json()
    },
    async create(author, name) {
      const r = await fetch(`${baseUrl}/api/blueprints`, {
        method: 'POST', headers: h,
        body: JSON.stringify({ author, name, points: [] }),
      })
      if (!r.ok) throw await r.json()
      return r.json()
    },
    async save(author, name, points) {
      const r = await fetch(`${baseUrl}/api/blueprints/${author}/${name}`, {
        method: 'PUT', headers: h,
        body: JSON.stringify({ points }),
      })
      if (!r.ok) throw new Error('Error al guardar')
      return r.json()
    },
    async remove(author, name) {
      const r = await fetch(`${baseUrl}/api/blueprints/${author}/${name}`, {
        method: 'DELETE',
      })
      if (!r.ok) throw new Error('Error al eliminar')
    },
  }
}