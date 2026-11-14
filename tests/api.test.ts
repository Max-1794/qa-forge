import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { createApp } from '../src/app'
import { DatabaseSync } from 'node:sqlite'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const databases: DatabaseSync[] = []

function createTestApp() {
  const db = new DatabaseSync(':memory:')
  databases.push(db)
  return createApp(db)
}

afterEach(() => {
  for (const db of databases.splice(0)) db.close()
})

test('SQLite conserva proyectos, casos y ejecuciones al cerrar y reabrir la base', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'qa-forge-'))
  const path = join(directory, 'persistence.sqlite')
  let db = new DatabaseSync(path)
  try {
    const app = createApp(db)
    assert.equal(db.prepare('PRAGMA foreign_keys').get()?.foreign_keys, 1)
    const { project } = await (await createProject(app, { name: 'Persistente', description: '' })).json()
    const { project: secondProject } = await (await createProject(app, { name: 'Segundo' })).json()
    const cases = []
    for (let i = 0; i < 2; i++) {
      cases.push((await (await createTestCase(app, project.id, validTestCase)).json()).testCase)
    }
    const executions = []
    for (const notes of [undefined, '', 'Observacion']) {
      executions.push((await (await createExecution(app, cases[0].id, {
        status: 'PASS', ...(notes === undefined ? {} : { notes })
      })).json()).execution)
    }
    assert.throws(() => db.prepare(`INSERT INTO test_cases
      (id, project_id, title, steps, expected_result) VALUES (?, ?, ?, ?, ?)`)
      .run('orphan-case', 'missing', 'Titulo', '[]', 'Resultado'), /FOREIGN KEY/)
    assert.throws(() => db.prepare(`INSERT INTO test_executions
      (id, test_case_id, status, executed_at) VALUES (?, ?, ?, ?)`)
      .run('orphan-execution', 'missing', 'PASS', new Date().toISOString()), /FOREIGN KEY/)
    db.close()
    db = new DatabaseSync(path)
    const reopened = createApp(db)
    assert.equal(db.prepare('PRAGMA foreign_keys').get()?.foreign_keys, 1)
    assert.deepEqual(await (await reopened.request('/api/projects')).json(), {
      projects: [project, secondProject]
    })
    assert.deepEqual(await (await reopened.request(`/api/projects/${project.id}/test-cases`)).json(), {
      testCases: cases
    })
    assert.deepEqual(await (await reopened.request(executionPath(cases[0].id))).json(), { executions })
    const { project: thirdProject } = await (await createProject(reopened, { name: 'Tercero' })).json()
    assert.deepEqual(await (await reopened.request('/api/projects')).json(), {
      projects: [project, secondProject, thirdProject]
    })
  } finally {
    if (db.isOpen) db.close()
    rmSync(directory, { recursive: true, force: true })
  }
})

function executionPath(testCaseId: string) {
  return `/api/test-cases/${testCaseId}/executions`
}

function createExecution(app: ReturnType<typeof createApp>, testCaseId: string, body: unknown) {
  return app.request(executionPath(testCaseId), {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  })
}

async function setupExecutionCase(app: ReturnType<typeof createApp>) {
  const { project } = await (await createProject(app, { name: 'Proyecto' })).json()
  return (await (await createTestCase(app, project.id, validTestCase)).json()).testCase
}

test('Las ejecuciones aceptan los tres estados y conservan el historial con IDs y fechas del servidor', async () => {
  const app = createTestApp()
  const testCase = await setupExecutionCase(app)
  const empty = await app.request(executionPath(testCase.id))
  assert.equal(empty.status, 200)
  assert.deepEqual(await empty.json(), { executions: [] })
  const executions = []
  for (const [status, notes] of [['PASS', undefined], ['FAIL', '  Error observado  '], ['BLOCKED', '']] as const) {
    const before = Date.now()
    const response = await createExecution(app, testCase.id, {
      status, ...(notes === undefined ? {} : { notes }),
      id: 'id-cliente', executedAt: '2000-01-01T00:00:00.000Z', testCaseId: 'otro-caso'
    })
    const after = Date.now()
    assert.equal(response.status, 201)
    const { execution } = await response.json()
    assert.deepEqual(execution, {
      id: execution.id, testCaseId: testCase.id, status,
      executedAt: execution.executedAt, ...(notes === undefined ? {} : { notes })
    })
    assert.match(execution.id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
    const timestamp = Date.parse(execution.executedAt)
    assert.ok(timestamp >= before && timestamp <= after)
    assert.equal(new Date(timestamp).toISOString(), execution.executedAt)
    executions.push(execution)
  }
  assert.equal(new Set(executions.map(execution => execution.id)).size, 3)
  const history = await app.request(executionPath(testCase.id))
  assert.equal(history.status, 200)
  assert.deepEqual(await history.json(), { executions })
})

test('Las ejecuciones rechazan cuerpos, estados, notas y JSON inválidos sin alterar el historial', async () => {
  const app = createTestApp()
  const testCase = await setupExecutionCase(app)
  const { execution } = await (await createExecution(app, testCase.id, { status: 'PASS' })).json()
  const invalid: unknown[] = [null, [], 'texto', 42, true, {}, { notes: 'sin estado' }]
  for (const status of [null, '', 'pass', 'FAIL ', 'SKIPPED', 42, true, {}, []]) {
    invalid.push({ status })
  }
  for (const notes of [null, 42, false, {}, []]) invalid.push({ status: 'PASS', notes })
  for (const body of invalid) {
    const response = await createExecution(app, testCase.id, body)
    assert.equal(response.status, 400, JSON.stringify(body))
    assert.equal(typeof (await response.json()).error, 'string')
  }
  for (const body of ['{', '', '{"status":"PASS",}']) {
    const response = await app.request(executionPath(testCase.id), {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body
    })
    assert.equal(response.status, 400)
    assert.deepEqual(await response.json(), { error: 'El cuerpo debe contener JSON válido.' })
  }
  assert.deepEqual(await (await app.request(executionPath(testCase.id))).json(), { executions: [execution] })
})

test('GET y POST executions devuelven 404 para casos inexistentes', async () => {
  const app = createTestApp()
  for (const response of [
    await app.request(executionPath('inexistente')),
    await createExecution(app, 'inexistente', { status: 'PASS' })
  ]) {
    assert.equal(response.status, 404)
    assert.deepEqual(await response.json(), { error: 'El caso de prueba no existe.' })
  }
})

test('Los historiales quedan aislados entre casos e instancias de createApp', async () => {
  const firstApp = createTestApp()
  const first = await setupExecutionCase(firstApp)
  const second = (await (await createTestCase(firstApp, first.projectId, validTestCase)).json()).testCase
  const { execution: firstExecution } = await (await createExecution(firstApp, first.id, { status: 'PASS' })).json()
  assert.deepEqual(await (await firstApp.request(executionPath(second.id))).json(), { executions: [] })
  const { execution: secondExecution } = await (await createExecution(firstApp, second.id, { status: 'FAIL' })).json()
  const secondApp = createTestApp()
  assert.equal((await secondApp.request(executionPath(first.id))).status, 404)
  assert.equal((await createExecution(secondApp, first.id, { status: 'PASS' })).status, 404)
  const third = await setupExecutionCase(secondApp)
  assert.deepEqual(await (await secondApp.request(executionPath(third.id))).json(), { executions: [] })
  const { execution: thirdExecution } = await (await createExecution(secondApp, third.id, { status: 'BLOCKED' })).json()
  assert.deepEqual(await (await secondApp.request(executionPath(third.id))).json(), { executions: [thirdExecution] })
  assert.equal((await firstApp.request(executionPath(third.id))).status, 404)
  assert.deepEqual(await (await firstApp.request(executionPath(first.id))).json(), { executions: [firstExecution] })
  assert.deepEqual(await (await firstApp.request(executionPath(second.id))).json(), { executions: [secondExecution] })
})

test('GET /api/projects devuelve una lista de proyectos', async () => {
  const app = createTestApp()
  const response = await app.request('/api/projects')
  const body = await response.json()

  assert.equal(response.status, 200)
  assert.deepEqual(body, { projects: [] })
})

test('Una ruta inexistente devuelve 404', async () => {
  const app = createTestApp()
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
  const app = createTestApp()
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
  const app = createTestApp()
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
  const app = createTestApp()
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
  const app = createTestApp()
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
  const firstApp = createTestApp()
  const secondApp = createTestApp()
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
  const response = await createTestApp().request('/')
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
  const app = createTestApp()
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
  const app = createTestApp()
  const first = (await (await createProject(app, { name: 'Primero' })).json()).project
  const second = (await (await createProject(app, { name: 'Segundo', description: '' })).json()).project
  const response = await app.request('/api/projects')
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { projects: [first, second] })
  const isolatedResponse = await createTestApp().request('/api/projects')
  assert.deepEqual(await isolatedResponse.json(), { projects: [] })
})

test('POST /api/projects rechaza datos inválidos sin guardar proyectos', async () => {
  const app = createTestApp()
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
