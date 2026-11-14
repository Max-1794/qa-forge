import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { runInNewContext } from 'node:vm'

// Small DOM double: verify client behavior without adding browser dependencies.
class Element {
  textContent = ''
  className = ''
  value = ''
  disabled = false
  hidden = false
  children: Element[] = []
  listeners: Record<string, (event: { preventDefault(): void }) => unknown> = {}
  attributes: Record<string, string> = {}
  validity = ''
  append(...children: Element[]) { this.children.push(...children) }
  replaceChildren(...children: Element[]) { this.children = children }
  setAttribute(name: string, value: string) { this.attributes[name] = value }
  removeAttribute(name: string) { delete this.attributes[name] }
  addEventListener(name: string, callback: Element['listeners'][string]) { this.listeners[name] = callback }
  setCustomValidity(message: string) { this.validity = message }
  reportValidity() {}
  focus() {}
  reset() {}
}

const source = readFileSync(resolve(__dirname, '../public/projects.js'), 'utf8')
const flush = () => new Promise<void>((resolve) => setImmediate(resolve))
function setup(fetch: (url: string, options?: { method: string; body: string }) => Promise<unknown>) {
  const elements = new Map<string, Element>()
  const get = (selector: string) => {
    if (!elements.has(selector)) elements.set(selector, new Element())
    return elements.get(selector)!
  }
  runInNewContext(source, {
    document: { querySelector: get, createElement: () => new Element() }, fetch
  })
  return { get, submit: () => get('#project-form').listeners.submit({ preventDefault() {} }) }
}

test('El cliente representa texto de usuarios como texto y permite reintentar el listado', async () => {
  let attempts = 0
  const ui = setup(async () => {
    if (++attempts === 1) throw new Error('offline')
    return { ok: true, json: async () => ({ projects: [{ name: '<script>alert(1)</script>' }] }) }
  })
  await flush()
  assert.equal(ui.get('#retry-button').hidden, false)
  await ui.get('#retry-button').listeners.click({ preventDefault() {} })
  assert.equal(ui.get('#retry-button').hidden, true)
  const title = ui.get('#project-list').children[0].children[0]
  assert.equal(title.textContent, '<script>alert(1)</script>')
  assert.equal(title.children.length, 0)
})

test('El cliente rechaza nombres vacíos, evita doble envío y conserva datos ante resultado incierto', async () => {
  let posts = 0
  let failPost!: (error: Error) => void
  const ui = setup(async (_url, options) => {
    if (!options) return { ok: true, json: async () => ({ projects: [] }) }
    posts++
    return new Promise((_resolve, reject) => { failPost = reject })
  })
  await flush()
  ui.get('#name').value = '   '
  await ui.submit()
  assert.equal(posts, 0)
  assert.ok(ui.get('#name').validity)
  ui.get('#name').value = 'Proyecto'
  ui.get('#description').value = 'Conservar'
  const pending = ui.submit()
  await ui.submit()
  assert.equal(posts, 1)
  assert.equal(ui.get('#create-button').disabled, true)
  failPost(new Error('offline'))
  await pending
  await flush()
  assert.equal(posts, 1)
  assert.equal(ui.get('#name').value, 'Proyecto')
  assert.equal(ui.get('#description').value, 'Conservar')
  assert.equal(ui.get('#create-button').disabled, false)
  assert.match(ui.get('#form-status').textContent, /Actualizá la lista/)
})

test('El cliente envía los campos a la API y anuncia una creación confirmada', async () => {
  let created = false
  const project = { id: 'id', name: 'Proyecto' }
  const ui = setup(async (_url, options) => {
    if (!options) return { ok: true, json: async () => ({ projects: created ? [project] : [] }) }
    assert.equal(options.method, 'POST')
    assert.deepEqual(JSON.parse(options.body), { name: 'Proyecto' })
    created = true
    return { ok: true, json: async () => ({ project }) }
  })
  await flush()
  ui.get('#name').value = '  Proyecto  '
  await ui.submit()
  assert.equal(ui.get('#form-status').textContent, 'Proyecto creado correctamente.')
  assert.equal(ui.get('#project-count').textContent, '1')
  assert.equal(ui.get('#project-list').children[0].children[0].textContent, 'Proyecto')
})
