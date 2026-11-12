import { test } from 'node:test'
import assert from 'node:assert/strict'
import { app } from '../src/app'

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