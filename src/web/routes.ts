import type { Hono } from 'hono'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { projectsPage } from './page'
import { testCasesPage } from './test-cases-page'

export function registerWebRoutes(app: Hono) {
  app.get('/projects', (c) => c.html(projectsPage))
  app.get('/projects/:projectId/test-cases', (c) => c.html(testCasesPage))

  // Explicit allowlist: request paths never become filesystem paths.
  for (const [name, contentType] of [
    ['styles.css', 'text/css; charset=utf-8'],
    ['projects.js', 'text/javascript; charset=utf-8'],
    ['test-cases.js', 'text/javascript; charset=utf-8']
  ] as const) {
    const path = resolve(__dirname, '../../public', name)
    app.get(`/assets/${name}`, async (c) => {
      const content = await readFile(path, 'utf8')
      c.header('X-Content-Type-Options', 'nosniff')
      return c.body(content, 200, { 'Content-Type': contentType })
    })
  }
}
