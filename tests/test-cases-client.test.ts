import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { runInNewContext } from 'node:vm'

class Element {
  textContent = ''; className = ''; value = ''; disabled = false; hidden = false
  required = false; rows = 0; type = ''; validity = ''; focused = false; checked = false
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
const execution = { id: 'e', testCaseId: 'c', status: 'PASS', executedAt: '2026-11-17T12:00:00.000Z' }
function setup(fetchCases: (options?: { method: string; body: string }, url?: string) => Promise<unknown>, pathname = '/projects/p/test-cases', projectFetch?: () => Promise<unknown>) {
  const elements = new Map<string, Element>()
  const get = (id: string) => {
    if (!elements.has(id)) elements.set(id, new Element())
    return elements.get(id)!
  }
  const urls: string[] = []
  const confirmations: string[] = []
  let discard = true
  runInNewContext(source, {
    document: { querySelector: (selector: string) => get(selector.slice(1)), createElement: () => new Element() },
    location: { pathname },
    window: { confirm: (message: string) => { confirmations.push(message); return discard } },
    fetch: async (url: string, options?: { method: string; body: string }) => {
      urls.push(url)
      return url === '/api/projects'
        ? projectFetch ? projectFetch() : reply({ projects: [{ id: 'p', name: '<script>Proyecto</script>' }] })
        : fetchCases(options, url)
    }
  })
  const click = (element: Element) => element.listeners.click({ preventDefault() {} })
  const submit = () => get('case-form').listeners.submit({ preventDefault() {} })
  const fill = () => {
    get('title').value = '  Título  '
    get('expected-result').value = '  Resultado  '
    get('steps').children[0].children[1].value = '  Paso  '
  }
  for (const status of ['PASS', 'FAIL', 'BLOCKED']) get(`execution-${status.toLowerCase()}`).value = status
  const execute = (index = 0) => click(get('case-list').children[index].children[4])
  const submitExecution = () => get('execution-form').listeners.submit({ preventDefault() {} })
  return { get, click, submit, fill, urls, execute, submitExecution, confirmations, discard: (value: boolean) => { discard = value } }
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

test('Ejecución exige selección explícita, envía los tres estados y conserva notas literales', async () => {
  for (const status of ['PASS', 'FAIL', 'BLOCKED']) {
    let posts = 0
    const notes = '  <script>alert(1)</script>\n  '
    const ui = setup(async (options, url) => {
      if (!url!.endsWith('/executions')) return reply({ testCases: [testCase] })
      if (!options) return reply({ executions: [] })
      posts++
      assert.deepEqual(JSON.parse(options.body), { status, notes })
      return reply({ execution: { ...execution, status, notes } }, 201)
    })
    await flush()
    assert.equal(ui.urls.some(url => url.endsWith('/executions')), false)
    await ui.execute()
    assert.equal(ui.get('execution-title').focused, true)
    assert.equal(ui.get('execution-steps').children[0].textContent, testCase.steps[0])
    assert.equal(ui.get('execution-expected').textContent, testCase.expectedResult)
    assert.match(ui.get('history-status').textContent, /Todavía no hay/)
    await ui.submitExecution()
    assert.equal(posts, 0)
    assert.match(ui.get('execution-status').textContent, /Seleccioná/)
    ui.get(`execution-${status.toLowerCase()}`).checked = true
    ui.get('execution-notes').value = notes
    await ui.submitExecution()
    assert.equal(posts, 1)
    assert.equal(ui.get('execution-notes').value, '')
    assert.equal(ui.get(`execution-${status.toLowerCase()}`).checked, false)
    assert.equal(ui.get('execution-history').children[0].children[2].textContent, notes)
    assert.equal(ui.get('execution-history').children[0].children[2].children.length, 0)
    assert.match(ui.get('execution-status').textContent, /correctamente/)
  }
})

test('Historial invierte el orden recibido sin ordenar fechas y codifica el identificador', async () => {
  const id = 'c/a?b'
  const rows = [{ ...execution, testCaseId: id }, { ...execution, id: 'older-clock', testCaseId: id, executedAt: '2000-01-01T00:00:00Z', status: 'FAIL' }]
  const ui = setup(async (_options, url) => url!.endsWith('/executions') ? reply({ executions: rows }) : reply({ testCases: [{ ...testCase, id }] }))
  await flush(); await ui.execute()
  assert.ok(ui.urls.includes('/api/test-cases/c%2Fa%3Fb/executions'))
  assert.equal(ui.get('execution-history').children[0].children[0].textContent, 'FAIL')
  assert.equal(ui.get('execution-history').children[0].children[1].attributes.datetime, rows[1].executedAt)
  assert.equal(rows[0].id, 'e')
})

test('Cerrar o cambiar confirma notas o selección; cancelar conserva borrador y actualizar casos no lo destruye', async () => {
  for (const draft of ['notes', 'selection']) {
    const ui = setup(async (_options, url) => url!.endsWith('/executions') ? reply({ executions: [] }) : reply({ testCases: [testCase, { ...testCase, id: 'second' }] }))
    await flush(); await ui.execute()
    if (draft === 'notes') ui.get('execution-notes').value = ' '
    else ui.get('execution-fail').checked = true
    ui.discard(false)
    await ui.click(ui.get('execution-close'))
    await ui.execute(1)
    assert.equal(ui.confirmations.length, 2)
    assert.equal(ui.get('execution-panel').hidden, false)
    assert.equal(ui.get('execution-title').textContent, `Ejecución: ${testCase.title}`)
    await ui.click(ui.get('refresh-button'))
    assert.equal(draft === 'notes' ? ui.get('execution-notes').value : ui.get('execution-fail').checked, draft === 'notes' ? ' ' : true)
    ui.discard(true)
    await ui.execute(1)
    assert.equal(ui.get('execution-notes').value, '')
    assert.equal(ui.get('execution-fail').checked, false)
    await ui.click(ui.get('execution-close'))
    assert.equal(ui.get('execution-panel').hidden, true)
    assert.equal(ui.get('case-list').children[1].children[4].focused, true)
  }
})

test('POST bloquea doble envío, cierre y cambio; éxito sobrevive a GET fallido', async () => {
  let finish!: (value: unknown) => void
  let posts = 0; let gets = 0
  const ui = setup(async (options, url) => {
    if (!url!.endsWith('/executions')) return reply({ testCases: [testCase, { ...testCase, id: 'second' }] })
    if (!options) { if (++gets > 1) throw new Error('offline'); return reply({ executions: [] }) }
    posts++
    assert.deepEqual(JSON.parse(options.body), { status: 'PASS' })
    return new Promise(resolve => { finish = resolve })
  })
  await flush(); await ui.execute()
  ui.get('execution-pass').checked = true
  const pending = ui.submitExecution()
  await ui.submitExecution(); await ui.execute(1); await ui.click(ui.get('execution-close'))
  assert.equal(posts, 1)
  assert.equal(ui.get('execution-close').disabled, true)
  assert.equal(ui.get('execution-fields').disabled, true)
  assert.equal(ui.get('execution-form').attributes['aria-busy'], 'true')
  assert.equal(ui.confirmations.length, 0)
  finish(reply({ execution }, 201)); await pending
  assert.equal(ui.get('execution-history').children[0].children[0].textContent, 'PASS')
  assert.match(ui.get('execution-status').textContent, /correctamente/)
  assert.match(ui.get('history-status').textContent, /No se pudo/)
  assert.equal(ui.get('execution-close').disabled, false)
})

test('Errores POST conservan el borrador sin reenvío; 404 bloquea sólo ejecución', async () => {
  for (const failure of ['400', '404', '500', 'network', 'json', 'invalid', 'wrong-case']) {
    let posts = 0
    const ui = setup(async (options, url) => {
      if (!url!.endsWith('/executions')) return reply({ testCases: [testCase] })
      if (!options) return reply({ executions: [] })
      posts++
      if (failure === 'network') throw new Error('offline')
      if (failure === 'json') return { status: 201, json: async () => { throw new Error('json') } }
      if (failure === 'invalid') return reply({ execution: {} }, 201)
      if (failure === 'wrong-case') return reply({ execution: { ...execution, testCaseId: 'other' } }, 201)
      return reply({ error: '<b>Revisar</b>' }, Number(failure))
    })
    await flush(); await ui.execute()
    ui.get('execution-pass').checked = true; ui.get('execution-notes').value = ' notas '
    await ui.submitExecution(); await flush()
    assert.equal(posts, 1)
    assert.equal(ui.get('execution-notes').value, ' notas ')
    assert.equal(ui.get('execution-pass').checked, true)
    assert.equal(ui.get('execution-status').children.length, 0)
    assert.match(ui.get('execution-status').textContent, failure === '400' ? /Revisar/ : failure === '404' ? /caso de prueba no existe/ : /Consultá el historial/)
    assert.equal(ui.get('execution-fields').disabled, failure === '404')
    if (failure === '404') { await ui.submitExecution(); assert.equal(posts, 1) }
  }
})

test('GET atrasado durante parseo no reemplaza otro caso ni borra ejecución confirmada', async () => {
  let finish!: (value: unknown) => void
  let gets = 0
  const ui = setup(async (options, url) => {
    if (!url!.endsWith('/executions')) return reply({ testCases: [testCase, { ...testCase, id: 'second' }] })
    if (options) return reply({ execution }, 201)
    if (++gets === 1 || gets === 3) return { status: 200, json: () => new Promise(resolve => { finish = resolve }) }
    return reply({ executions: [] })
  })
  await flush()
  const oldCase = ui.execute(); await flush()
  await ui.execute(1)
  finish({ executions: [execution] }); await oldCase
  assert.equal(ui.get('execution-history').children.length, 0)
  const beforePost = ui.execute(); await flush()
  ui.get('execution-pass').checked = true
  await ui.submitExecution()
  finish({ executions: [] }); await beforePost
  assert.equal(ui.get('execution-history').children.length, 1)
  assert.match(ui.get('execution-status').textContent, /correctamente/)
})

test('GET inválido, red y 404 ofrecen recuperación sin borrar historial visible', async () => {
  for (const failure of ['network', 'json', 'invalid', 'wrong-case', '404']) {
    let gets = 0
    const ui = setup(async (_options, url) => {
      if (!url!.endsWith('/executions')) return reply({ testCases: [testCase] })
      if (++gets === 1 || gets > 2) return reply({ executions: [execution] })
      if (failure === 'network') throw new Error('offline')
      if (failure === 'json') return { status: 200, json: async () => { throw new Error('json') } }
      if (failure === '404') return reply({}, 404)
      return reply({ executions: [failure === 'invalid' ? {} : { ...execution, testCaseId: 'other' }] })
    })
    await flush(); await ui.execute(); await ui.click(ui.get('history-refresh'))
    assert.equal(ui.get('execution-history').children.length, 1)
    assert.match(ui.get('history-status').textContent, failure === '404' ? /no existe/ : /No se pudo/)
    assert.equal(ui.get('history-refresh').disabled, false)
    assert.equal(ui.get('execution-history').attributes['aria-busy'], 'false')
    await ui.click(ui.get('history-refresh'))
    assert.match(ui.get('history-status').textContent, /Más recientes/)
  }
})
