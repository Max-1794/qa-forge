import { Hono } from 'hono'
import { randomUUID } from 'node:crypto'

interface Project {
  id: string
  name: string
  description?: string
}

export function createApp() {
  const app = new Hono()
  const projects: Project[] = []

  app.get('/', (c) => {
    return c.json({
      message: 'Bienvenido a QA Forge',
      status: 'ok'
    })
  })

  app.get('/api/projects', (c) => {
    return c.json({
      projects
    })
  })

  app.post('/api/projects', async (c) => {
    let body: unknown
    try {
      body = await c.req.json()
    } catch {
      return c.json({ error: 'El cuerpo debe contener JSON válido.' }, 400)
    }

    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
      return c.json({ error: 'El cuerpo debe ser un objeto JSON.' }, 400)
    }

    if (!('name' in body) || typeof body.name !== 'string' || body.name.trim() === '') {
      return c.json({ error: 'El nombre (name) es obligatorio y debe ser texto no vacío.' }, 400)
    }

    if ('description' in body && typeof body.description !== 'string') {
      return c.json({ error: 'La descripción (description) debe ser texto.' }, 400)
    }

    const project: Project = { id: randomUUID(), name: body.name.trim() }
    if ('description' in body && typeof body.description === 'string') {
      project.description = body.description
    }
    projects.push(project)
    return c.json({ project }, 201)
  })

  return app
}

export const app = createApp()
