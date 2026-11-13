import { Hono } from 'hono'
import { randomUUID } from 'node:crypto'

interface Project {
  id: string
  name: string
  description?: string
}

interface TestCase {
  id: string
  projectId: string
  title: string
  steps: string[]
  expectedResult: string
}

function isNonEmptyText(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== ''
}

export function createApp() {
  const app = new Hono()
  const projects: Project[] = []
  const testCases: TestCase[] = []

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

  app.get('/api/projects/:projectId/test-cases', (c) => {
    const projectId = c.req.param('projectId')
    if (!projects.some(project => project.id === projectId)) {
      return c.json({ error: 'El proyecto no existe.' }, 404)
    }
    return c.json({ testCases: testCases.filter(testCase => testCase.projectId === projectId) })
  })

  app.post('/api/projects/:projectId/test-cases', async (c) => {
    const projectId = c.req.param('projectId')
    if (!projects.some(project => project.id === projectId)) {
      return c.json({ error: 'El proyecto no existe.' }, 404)
    }

    let body: unknown
    try {
      body = await c.req.json()
    } catch {
      return c.json({ error: 'El cuerpo debe contener JSON válido.' }, 400)
    }

    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
      return c.json({ error: 'El cuerpo debe ser un objeto JSON.' }, 400)
    }
    if (!('title' in body) || !isNonEmptyText(body.title)) {
      return c.json({ error: 'El título (title) debe ser texto no vacío.' }, 400)
    }
    if (!('steps' in body) || !Array.isArray(body.steps) ||
        body.steps.length === 0 || !body.steps.every(isNonEmptyText)) {
      return c.json({ error: 'Los pasos (steps) deben ser un arreglo no vacío de textos no vacíos.' }, 400)
    }
    if (!('expectedResult' in body) || !isNonEmptyText(body.expectedResult)) {
      return c.json({ error: 'El resultado esperado (expectedResult) debe ser texto no vacío.' }, 400)
    }

    const testCase: TestCase = {
      id: randomUUID(),
      projectId,
      title: body.title.trim(),
      steps: body.steps.map(step => step.trim()),
      expectedResult: body.expectedResult.trim()
    }
    testCases.push(testCase)
    return c.json({ testCase }, 201)
  })

  return app
}

export const app = createApp()
