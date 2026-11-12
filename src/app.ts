import { Hono } from 'hono'

export const app = new Hono()

app.get('/', (c) => {
  return c.json({
    message: 'Bienvenido a QA Forge',
    status: 'ok'
  })
})

app.get('/api/projects', (c) => {
  return c.json({
    projects: []
  })
})