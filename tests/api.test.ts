import { test } from 'node:test'
import assert from 'node:assert/strict'
import { app, createApp } from '../src/app'

test('GET /api/projects devuelve una lista de proyectos', async () => {
  const response = await app.request('/api/projects')
  const body = await response.json()

  assert.equal(response.status, 200)
  assert.deepEqual(body, { projects: [] })
})

test('Una ruta inexistente devuelve 404', async () => {
  const response = await app.request('/api/usuarios')

  assert.equal(response.status, 404)
})

test('GET / conserva la bienvenida', async () => {
  const response = await createApp().request('/')
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), {
    message: 'Bienvenido a QA Forge', status: 'ok'
  })
})

function createProject(app: ReturnType<typeof createApp>, body: unknown) {
  return app.request('/api/projects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
}

test('POST /api/projects crea proyectos con IDs únicos y descripción opcional', async () => {
  const app = createApp()
  const response = await createProject(app, { name: '  QA Forge  ', description: 'Pruebas de API' })
  assert.equal(response.status, 201)
  const { project } = await response.json()
  assert.equal(project.name, 'QA Forge')
  assert.equal(project.description, 'Pruebas de API')
  assert.match(project.id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)

  const secondResponse = await createProject(app, { name: 'Otro proyecto' })
  assert.equal(secondResponse.status, 201)
  const second = (await secondResponse.json()).project
  assert.notEqual(second.id, project.id)
  assert.equal(second.name, 'Otro proyecto')
  assert.equal('description' in second, false)
})

test('GET /api/projects lista los proyectos creados en esa aplicación', async () => {
  const app = createApp()
  const first = (await (await createProject(app, { name: 'Primero' })).json()).project
  const second = (await (await createProject(app, { name: 'Segundo', description: '' })).json()).project
  const response = await app.request('/api/projects')
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { projects: [first, second] })
  const isolatedResponse = await createApp().request('/api/projects')
  assert.deepEqual(await isolatedResponse.json(), { projects: [] })
})

test('POST /api/projects rechaza datos inválidos sin guardar proyectos', async () => {
  const app = createApp()
  const cases = [
    {}, { name: '' }, { name: '  \n ' }, { name: 42 }, { name: null },
    { name: true }, null, [], 'texto', 42,
    ...[null, 42, true, {}, []].map(description => ({ name: 'Proyecto', description }))
  ]
  for (const body of cases) {
    const response = await createProject(app, body)
    assert.equal(response.status, 400, JSON.stringify(body))
    assert.match((await response.json()).error, /debe|obligatorio/)
  }
  for (const body of ['{', '']) {
    const response = await app.request('/api/projects', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body
    })
    assert.equal(response.status, 400)
    assert.deepEqual(await response.json(), { error: 'El cuerpo debe contener JSON válido.' })
  }
  const response = await app.request('/api/projects')
  assert.deepEqual(await response.json(), { projects: [] })
})
