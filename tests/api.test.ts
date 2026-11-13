import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createApp } from '../src/app'

test('GET /api/projects devuelve una lista de proyectos', async () => {
  const app = createApp()
  const response = await app.request('/api/projects')
  const body = await response.json()

  assert.equal(response.status, 200)
  assert.deepEqual(body, { projects: [] })
})

test('Una ruta inexistente devuelve 404', async () => {
  const app = createApp()
  const response = await app.request('/api/usuarios')

  assert.equal(response.status, 404)
})

const validTestCase = {
  title: '  Iniciar sesión  ',
  steps: ['  Abrir el formulario  ', 'Ingresar credenciales'],
  expectedResult: '  Se muestra el panel  '
}

function createTestCase(app: ReturnType<typeof createApp>, projectId: string, body: unknown) {
  return app.request(`/api/projects/${projectId}/test-cases`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
}

test('POST test-cases crea casos asociados al proyecto con UUIDs únicos', async () => {
  const app = createApp()
  const { project } = await (await createProject(app, { name: 'Proyecto' })).json()
  const response = await createTestCase(app, project.id, {
    ...validTestCase, id: 'id-del-cliente', projectId: 'otro-proyecto'
  })
  assert.equal(response.status, 201)
  const { testCase } = await response.json()
  assert.deepEqual(testCase, {
    id: testCase.id, projectId: project.id, title: 'Iniciar sesión',
    steps: ['Abrir el formulario', 'Ingresar credenciales'], expectedResult: 'Se muestra el panel'
  })
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  assert.match(testCase.id, uuid)
  const secondResponse = await createTestCase(app, project.id, validTestCase)
  assert.equal(secondResponse.status, 201)
  const second = (await secondResponse.json()).testCase
  assert.match(second.id, uuid)
  assert.notEqual(second.id, testCase.id)
  const list = await app.request(`/api/projects/${project.id}/test-cases`)
  assert.equal(list.status, 200)
  assert.deepEqual(await list.json(), { testCases: [testCase, second] })
})

test('GET test-cases devuelve listas vacías y aísla los casos entre proyectos', async () => {
  const app = createApp()
  const first = (await (await createProject(app, { name: 'Primero' })).json()).project
  const second = (await (await createProject(app, { name: 'Segundo' })).json()).project
  const path = (id: string) => `/api/projects/${id}/test-cases`
  const firstCase = (await (await createTestCase(app, first.id, validTestCase)).json()).testCase
  assert.deepEqual(await (await app.request(path(second.id))).json(), { testCases: [] })
  const secondCase = (await (await createTestCase(app, second.id, validTestCase)).json()).testCase
  assert.deepEqual(await (await app.request(path(first.id))).json(), { testCases: [firstCase] })
  assert.deepEqual(await (await app.request(path(second.id))).json(), { testCases: [secondCase] })
})

test('POST test-cases rechaza campos inválidos sin guardar datos', async () => {
  const app = createApp()
  const { project } = await (await createProject(app, { name: 'Proyecto' })).json()
  const cases: unknown[] = [null, [], 'texto', 42, true, {}]
  for (const field of ['title', 'steps', 'expectedResult']) {
    const missing: Record<string, unknown> = { ...validTestCase }
    delete missing[field]
    cases.push(missing)
    const invalidValues = field === 'steps'
      ? [null, '', 'paso', 42, true, {}, [], [''], [' \n '], [42], [null], [true], [{}], [[]], ['Válido', ' ']]
      : [null, '', ' \n ', 42, true, {}, []]
    for (const value of invalidValues) cases.push({ ...validTestCase, [field]: value })
  }
  for (const body of cases) {
    const response = await createTestCase(app, project.id, body)
    assert.equal(response.status, 400, JSON.stringify(body))
    assert.equal(typeof (await response.json()).error, 'string')
  }
  for (const body of ['{', '']) {
    const response = await app.request(`/api/projects/${project.id}/test-cases`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body
    })
    assert.equal(response.status, 400)
    assert.deepEqual(await response.json(), { error: 'El cuerpo debe contener JSON válido.' })
  }
  const list = await app.request(`/api/projects/${project.id}/test-cases`)
  assert.deepEqual(await list.json(), { testCases: [] })
})

test('GET y POST test-cases devuelven 404 para un proyecto inexistente', async () => {
  const app = createApp()
  const responses = [
    await app.request('/api/projects/inexistente/test-cases'),
    await createTestCase(app, 'inexistente', validTestCase)
  ]
  for (const response of responses) {
    assert.equal(response.status, 404)
    assert.deepEqual(await response.json(), { error: 'El proyecto no existe.' })
  }
})

test('Los proyectos y casos de prueba quedan aislados entre instancias de createApp', async () => {
  const firstApp = createApp()
  const secondApp = createApp()
  const first = (await (await createProject(firstApp, { name: 'Primero' })).json()).project
  const firstCase = (await (await createTestCase(firstApp, first.id, validTestCase)).json()).testCase
  assert.deepEqual(await (await secondApp.request('/api/projects')).json(), { projects: [] })
  assert.equal((await secondApp.request(`/api/projects/${first.id}/test-cases`)).status, 404)
  assert.equal((await createTestCase(secondApp, first.id, validTestCase)).status, 404)
  const second = (await (await createProject(secondApp, { name: 'Segundo' })).json()).project
  const list = await secondApp.request(`/api/projects/${second.id}/test-cases`)
  assert.deepEqual(await list.json(), { testCases: [] })
  assert.deepEqual(await (await firstApp.request(`/api/projects/${first.id}/test-cases`)).json(), {
    testCases: [firstCase]
  })
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
