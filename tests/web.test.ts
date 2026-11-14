import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { createApp } from '../src/app'

test('La página de proyectos sirve HTML español y referencia los assets permitidos', async () => {
  const db = new DatabaseSync(':memory:')
  try {
    const app = createApp(db)
    const response = await app.request('/projects')
    assert.equal(response.status, 200)
    assert.match(response.headers.get('content-type')!, /text\/html/)
    const html = await response.text()
    assert.match(html, /<html lang="es">/)
    assert.match(html, /id="project-form"/)
    assert.match(html, /aria-live="polite"/)
    for (const [path, type] of [
      ['/assets/styles.css', 'text/css'], ['/assets/projects.js', 'text/javascript']
    ]) {
      assert.ok(html.includes(path))
      const asset = await app.request(path)
      assert.equal(asset.status, 200)
      assert.ok(asset.headers.get('content-type')!.startsWith(type))
      assert.equal(asset.headers.get('x-content-type-options'), 'nosniff')
      assert.ok((await asset.text()).length > 0)
    }
  } finally { db.close() }
})

test('Los assets se resuelven independientemente del directorio de ejecución', async () => {
  const db = new DatabaseSync(':memory:')
  const original = process.cwd()
  try {
    process.chdir('tests')
    const app = createApp(db)
    assert.equal((await app.request('/assets/projects.js')).status, 200)
    assert.equal((await app.request('/assets/styles.css')).status, 200)
  } finally {
    process.chdir(original)
    db.close()
  }
})

test('Las rutas web no exponen archivos privados ni capturan rutas desconocidas', async () => {
  const db = new DatabaseSync(':memory:')
  try {
    const app = createApp(db)
    for (const path of [
      '/projects/missing', '/assets/missing.css', '/assets/package.json',
      '/assets/data/qa-forge.sqlite', '/data/qa-forge.sqlite', '/package.json',
      '/src/storage.ts', '/.git/config', '/public/projects.js',
      '/assets/%2e%2e%2fdata%2fqa-forge.sqlite', '/api/usuarios'
    ]) assert.equal((await app.request(path)).status, 404, path)
  } finally { db.close() }
})

test('La interfaz conserva la bienvenida y los contratos de creación y listado', async () => {
  const db = new DatabaseSync(':memory:')
  try {
    const app = createApp(db)
    const home = await app.request('/')
    assert.match(home.headers.get('content-type')!, /application\/json/)
    assert.deepEqual(await home.json(), { message: 'Bienvenido a QA Forge', status: 'ok' })
    await app.request('/projects')
    const response = await app.request('/api/projects', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '  <script>alert(1)</script>  ', description: 'Descripción' })
    })
    assert.equal(response.status, 201)
    const { project } = await response.json()
    assert.equal(project.name, '<script>alert(1)</script>')
    assert.equal(db.prepare('SELECT name FROM projects WHERE id = ?').get(project.id)?.name, project.name)
    const list = await app.request('/api/projects')
    assert.equal(list.status, 200)
    assert.deepEqual(await list.json(), { projects: [project] })
  } finally { db.close() }
})
