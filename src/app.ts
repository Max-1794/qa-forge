import { Hono } from 'hono'
import { randomUUID } from 'node:crypto'

import { DatabaseSync } from 'node:sqlite'
import { createStorage, type Project, type TestCase, type TestExecution } from './storage'
import { registerWebRoutes } from './web/routes'

function isNonEmptyText(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== ''
}

export function createApp(db: DatabaseSync) {
  const app = new Hono()
  const storage = createStorage(db)
  registerWebRoutes(app)

  app.get('/', (c) => {
    return c.json({
      message: 'Bienvenido a QA Forge',
      status: 'ok'
    })
  })

  app.get('/api/projects', (c) => {
    return c.json({
      projects: storage.listProjects()
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
    storage.addProject(project)
    return c.json({ project }, 201)
  })

  app.get('/api/projects/:projectId/test-cases', (c) => {
    const projectId = c.req.param('projectId')
    if (!storage.hasProject(projectId)) {
      return c.json({ error: 'El proyecto no existe.' }, 404)
    }
    return c.json({ testCases: storage.listTestCases(projectId) })
  })

  app.post('/api/projects/:projectId/test-cases', async (c) => {
    const projectId = c.req.param('projectId')
    if (!storage.hasProject(projectId)) {
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
    storage.addTestCase(testCase)
    return c.json({ testCase }, 201)
  })

  app.get('/api/test-cases/:testCaseId/executions', (c) => {
    const testCaseId = c.req.param('testCaseId')
    if (!storage.hasTestCase(testCaseId)) {
      return c.json({ error: 'El caso de prueba no existe.' }, 404)
    }
    return c.json({ executions: storage.listExecutions(testCaseId) }, 200)
  })

  app.post('/api/test-cases/:testCaseId/executions', async (c) => {
    const testCaseId = c.req.param('testCaseId')
    if (!storage.hasTestCase(testCaseId)) {
      return c.json({ error: 'El caso de prueba no existe.' }, 404)
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
    if (!('status' in body) ||
        (body.status !== 'PASS' && body.status !== 'FAIL' && body.status !== 'BLOCKED')) {
      return c.json({ error: 'El estado (status) debe ser PASS, FAIL o BLOCKED.' }, 400)
    }
    if ('notes' in body && typeof body.notes !== 'string') {
      return c.json({ error: 'Las notas (notes) deben ser texto.' }, 400)
    }

    const execution: TestExecution = {
      id: randomUUID(),
      testCaseId,
      status: body.status,
      executedAt: new Date().toISOString()
    }
    if ('notes' in body && typeof body.notes === 'string') {
      execution.notes = body.notes
    }
    storage.addExecution(execution)
    return c.json({ execution }, 201)
  })

  return app
}
