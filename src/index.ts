import { serve } from '@hono/node-server'
import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { createApp } from './app'

// Resolve against the project directory, independently of the working directory.
const databasePath = resolve(__dirname, '..', process.env.QA_FORGE_DB_PATH || 'data/qa-forge.sqlite')
mkdirSync(dirname(databasePath), { recursive: true })
const db = new DatabaseSync(databasePath)
const app = createApp(db)

const server = serve({
  fetch: app.fetch,
  port: 3000
})

console.log('QA Forge funcionando en http://localhost:3000')

function shutdown() {
  server.close(() => {
    db.close()
  })
}

process.once('SIGINT', shutdown)
process.once('SIGTERM', shutdown)
