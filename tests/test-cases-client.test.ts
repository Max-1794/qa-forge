import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { runInNewContext } from 'node:vm'

class Element {
  textContent = ''; className = ''; value = ''; disabled = false; hidden = false
  required = false; rows = 0; type = ''; validity = ''; focused = false
  children: Element[] = []; parent?: Element
  attributes: Record<string, string> = {}
  listeners: Record<string, (event: { preventDefault(): void }) => unknown> = {}
  append(...items: Element[]) { for (const item of items) { item.parent = this; this.children.push(item) } }
  replaceChildren(...items: Element[]) { this.children = []; this.append(...items) }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter(item => item !== this) }
  setAttribute(key: string, value: string) { this.attributes[key] = value }
  removeAttribute(key: string) { delete this.attributes[key] }
  addEventListener(key: string, listener: Element['listeners'][string]) { this.listeners[key] = listener }
  setCustomValidity(value: string) { this.validity = value }
  reportValidity() {}
  focus() { this.focused = true }
}
const source = readFileSync(resolve(__dirname, '../public/test-cases.js'), 'utf8')
const flush = () => new Promise<void>(resolve => setImmediate(resolve))
const reply = (body: unknown, status = 200) => ({ status, ok: status < 400, json: async () => body })
const testCase = { id: 'c', projectId: 'p', title: '<script>alert(1)</script>', steps: ['<img onerror=alert(1)>'], expectedResult: '<b>OK</b>' }
function setup(fetchCases: (options?: { method: string; body: string }) => Promise<unknown>, pathname = '/projects/p/test-cases', projectFetch?: () => Promise<unknown>) {
  const elements = new Map<string, Element>()
  const get = (id: string) => {
    if (!elements.has(id)) elements.set(id, new Element())
    return elements.get(id)!
  }
  const urls: string[] = []
  runInNewContext(source, {
    document: { querySelector: (selector: string) => get(selector.slice(1)), createElement: () => new Element() },
    location: { pathname },
    fetch: async (url: string, options?: { method: string; body: string }) => {
      urls.push(url)
      return url === '/api/projects'
        ? projectFetch ? projectFetch() : reply({ projects: [{ id: 'p', name: '<script>Proyecto</script>' }] })
        : fetchCases(options)
    }
  })
  const click = (element: Element) => element.listeners.click({ preventDefault() {} })
  const submit = () => get('case-form').listeners.submit({ preventDefault() {} })
  const fill = () => {
    get('title').value = '  Título  '
    get('expected-result').value = '  Resultado  '
    get('steps').children[0].children[1].value = '  Paso  '
  }
  return { get, click, submit, fill, urls }
}

test('Carga nombre, vacío y casos como texto seguro; permite reintentar errores', async () => {
  let attempt = 0
  const ui = setup(async () => {
    if (++attempt === 1) throw new Error('offline')
    return reply({ testCases: attempt === 2 ? [] : [testCase] })
  })
  await flush()
  assert.equal(ui.get('project-name').textContent, '<script>Proyecto</script>')
  assert.equal(ui.get('retry-button').hidden, false)
  await ui.click(ui.get('retry-button'))
  assert.match(ui.get('list-status').textContent, /Todavía no hay/)
  await ui.click(ui.get('refresh-button'))
  const card = ui.get('case-list').children[0]
  assert.equal(card.children[0].textContent, testCase.title)
  assert.equal(card.children[0].children.length, 0)
  assert.equal(card.children[1].children[0].textContent, testCase.steps[0])
  assert.equal(card.children[3].textContent, testCase.expectedResult)
})

test('Pasos dinámicos mantienen uno, etiquetas estables, orden y foco; validación no descarta vacíos', async () => {
  let posts = 0
  const ui = setup(async options => { if (options) posts++; return reply({ testCases: [] }) })
  await flush()
  ui.fill()
  const first = ui.get('steps').children[0]
  assert.equal(first.children[2].disabled, true)
  await ui.click(ui.get('add-step'))
  const second = ui.get('steps').children[1]
  assert.equal(second.children[1].focused, true)
  assert.equal(second.children[0].attributes.for, second.children[1].attributes.id)
  await ui.submit()
  assert.equal(posts, 0)
  assert.ok(second.children[1].validity)
  await ui.click(first.children[2])
  assert.equal(ui.get('steps').children.length, 1)
  assert.equal(second.children[0].textContent, 'Paso 1')
  assert.equal(second.children[2].disabled, true)
  await ui.click(second.children[2])
  assert.equal(ui.get('steps').children.length, 1)
  for (const id of ['title', 'expected-result']) {
    ui.fill(); ui.get(id).value = ' \n '
    await ui.submit()
    assert.ok(ui.get(id).validity)
  }
  assert.equal(posts, 0)
})

test('POST exacto evita doble envío y conserva confirmación aunque falle la actualización', async () => {
  let posts = 0; let gets = 0
  let finish!: (value: unknown) => void
  const ui = setup(async options => {
    if (!options) { if (++gets > 1) throw new Error('offline'); return reply({ testCases: [] }) }
    posts++
    assert.equal(options.method, 'POST')
    assert.deepEqual(JSON.parse(options.body), { title: 'Título', steps: ['Paso', 'Segundo'], expectedResult: 'Resultado' })
    return new Promise(resolve => { finish = resolve })
  })
  await flush(); ui.fill()
  await ui.click(ui.get('add-step'))
  ui.get('steps').children[1].children[1].value = ' Segundo '
  const pending = ui.submit()
  await ui.submit()
  assert.equal(posts, 1)
  assert.equal(ui.get('case-fields').disabled, true)
  finish(reply({ testCase }, 201))
  await pending
  assert.match(ui.get('form-status').textContent, /creado correctamente/)
  assert.match(ui.get('list-status').textContent, /No se pudo actualizar/)
  assert.equal(ui.get('case-list').children.length, 1)
  assert.equal(ui.get('steps').children.length, 1)
  assert.equal(ui.get('title').value, '')
  assert.equal(ui.get('title').focused, true)
})

test('GET atrasado no reemplaza el caso confirmado', async () => {
  let finish!: (value: unknown) => void
  let gets = 0
  const ui = setup(async options => {
    if (options) return reply({ testCase }, 201)
    if (++gets === 1) return new Promise(resolve => { finish = resolve })
    return reply({ testCases: [testCase] })
  })
  await flush(); ui.fill()
  await ui.submit()
  finish(reply({ testCases: [] }))
  await flush()
  assert.equal(ui.get('case-count').textContent, '1')
  assert.equal(ui.get('case-list').attributes['aria-busy'], 'false')
})

test('Rechazo 400, red, 500 y respuesta inválida conservan formulario sin reintento automático', async () => {
  for (const failure of ['400', 'network', '500', 'invalid']) {
    let posts = 0
    const ui = setup(async options => {
      if (!options) return reply({ testCases: [] })
      posts++
      if (failure === 'network') throw new Error('offline')
      if (failure === '400') return reply({ error: '<b>Datos inválidos</b>' }, 400)
      if (failure === '500') return reply({}, 500)
      return reply({ testCase: {} }, 201)
    })
    await flush(); ui.fill(); await ui.submit()
    assert.equal(posts, 1)
    assert.equal(ui.get('title').value, '  Título  ')
    assert.equal(ui.get('case-fields').disabled, false)
    assert.equal(ui.get('form-status').children.length, 0)
    assert.match(ui.get('form-status').textContent, failure === '400' ? /Datos inválidos/ : /Actualizá la lista/)
  }
})

test('Proyecto inexistente, errores de proyecto y rutas malformadas no habilitan creación', async () => {
  const missing = setup(async () => reply({}, 404))
  await flush()
  assert.equal(missing.get('case-content').hidden, true)
  assert.match(missing.get('project-status').textContent, /no existe/)
  let attempts = 0
  const retry = setup(async () => reply({ testCases: [] }), undefined, async () => {
    if (++attempts === 1) return reply({ projects: null })
    return reply({ projects: [] })
  })
  await flush()
  assert.equal(retry.get('project-retry').hidden, false)
  await retry.click(retry.get('project-retry'))
  assert.match(retry.get('project-status').textContent, /no existe/)
  const bad = setup(async () => reply({}), '/projects/%ZZ/test-cases')
  assert.equal(bad.urls.length, 0)
  assert.match(bad.get('project-status').textContent, /no es válida/)
})

test('POST 404 muestra proyecto inexistente y JSON de listado inválido permite reintento', async () => {
  const ui = setup(async options => options ? reply({}, 404) : reply({ testCases: [{}] }))
  await flush()
  assert.equal(ui.get('retry-button').hidden, false)
  ui.fill(); await ui.submit()
  assert.equal(ui.get('case-content').hidden, true)
  assert.match(ui.get('project-status').textContent, /no existe/)
})
