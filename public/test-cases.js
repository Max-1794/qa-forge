'use strict'

const select = (id) => document.querySelector(`#${id}`)
const form = select('case-form')
const fields = select('case-fields')
const titleInput = select('title')
const expectedInput = select('expected-result')
const formStatus = select('form-status')
const listStatus = select('list-status')
const list = select('case-list')
const refresh = select('refresh-button')
const retry = select('retry-button')
const projectStatus = select('project-status')
const projectRetry = select('project-retry')
let projectId
let endpoint
let ready = false
let saving = false
let projectLoading = false
let requestVersion = 0
let nextStepId = 0
let steps = []
let cases = []

function message(element, text, kind = '') {
  element.textContent = text
  element.className = kind
}

function validCase(value) {
  return value && typeof value.id === 'string' && value.projectId === projectId &&
    typeof value.title === 'string' && value.title.trim() !== '' &&
    Array.isArray(value.steps) && value.steps.length > 0 &&
    value.steps.every(step => typeof step === 'string' && step.trim() !== '') &&
    typeof value.expectedResult === 'string' && value.expectedResult.trim() !== ''
}

function renderCases() {
  list.replaceChildren(...cases.map(testCase => {
    const card = document.createElement('li')
    card.className = 'project-card'
    const title = document.createElement('h3')
    title.textContent = testCase.title
    const ordered = document.createElement('ol')
    for (const step of testCase.steps) {
      const item = document.createElement('li')
      item.textContent = step
      ordered.append(item)
    }
    const heading = document.createElement('h4')
    heading.textContent = 'Resultado esperado'
    const expected = document.createElement('p')
    expected.textContent = testCase.expectedResult
    card.append(title, ordered, heading, expected)
    return card
  }))
  select('case-count').textContent = String(cases.length)
}

function renumberSteps() {
  steps.forEach((step, index) => {
    step.label.textContent = `Paso ${index + 1}`
    step.remove.textContent = `Quitar paso ${index + 1}`
    step.remove.disabled = steps.length === 1
  })
}

function addStep(focus = true) {
  if (saving) return
  const row = document.createElement('div')
  row.className = 'step-row'
  const input = document.createElement('textarea')
  const id = `step-${++nextStepId}`
  input.setAttribute('id', id)
  input.setAttribute('name', id)
  input.required = true
  input.rows = 2
  const label = document.createElement('label')
  label.setAttribute('for', id)
  const remove = document.createElement('button')
  remove.type = 'button'
  remove.className = 'secondary'
  const step = { row, input, label, remove }
  remove.addEventListener('click', () => {
    if (saving || steps.length === 1) return
    const index = steps.indexOf(step)
    steps.splice(index, 1)
    row.remove()
    renumberSteps()
    steps[Math.min(index, steps.length - 1)].input.focus()
    select('step-status').textContent = `Paso quitado. Quedan ${steps.length} pasos.`
  })
  input.addEventListener('input', () => input.setCustomValidity(''))
  row.append(label, input, remove)
  steps.push(step)
  select('steps').append(row)
  renumberSteps()
  if (focus) {
    input.focus()
    select('step-status').textContent = `Paso ${steps.length} agregado.`
  }
}

function missingProject() {
  ready = false
  requestVersion++
  select('case-content').hidden = true
  projectRetry.hidden = true
  message(projectStatus, 'El proyecto no existe.', 'error')
}

async function loadCases() {
  if (!ready || saving) return
  const version = ++requestVersion
  refresh.disabled = true
  retry.hidden = true
  list.setAttribute('aria-busy', 'true')
  message(listStatus, 'Cargando casos de prueba…')
  try {
    const response = await fetch(endpoint)
    if (version !== requestVersion) return
    if (response.status === 404) { missingProject(); return }
    if (!response.ok) throw new Error('Carga fallida')
    const body = await response.json()
    if (version !== requestVersion) return
    if (!Array.isArray(body.testCases) || !body.testCases.every(validCase)) throw new Error('Respuesta inválida')
    cases = body.testCases
    renderCases()
    message(listStatus, cases.length ? 'Casos en orden de creación.' : 'Todavía no hay casos. Creá el primero con el formulario.')
  } catch {
    if (version !== requestVersion) return
    message(listStatus, 'No se pudo actualizar la lista. Revisá tu conexión y reintentá.', 'error')
    retry.hidden = false
  } finally {
    if (version === requestVersion) {
      refresh.disabled = false
      list.setAttribute('aria-busy', 'false')
    }
  }
}

async function loadProject() {
  if (projectLoading || !projectId) return
  projectLoading = true
  projectRetry.hidden = true
  message(projectStatus, 'Cargando proyecto…')
  try {
    const response = await fetch('/api/projects')
    if (!response.ok) throw new Error('Carga fallida')
    const body = await response.json()
    if (!Array.isArray(body.projects) || !body.projects.every(project =>
      project && typeof project.id === 'string' && typeof project.name === 'string')) throw new Error('Respuesta inválida')
    const project = body.projects.find(project => project.id === projectId)
    if (!project) { missingProject(); return }
    select('project-name').textContent = project.name
    document.title = `${project.name} · Casos de prueba · QA Forge`
    message(projectStatus, 'Gestioná los casos de prueba de este proyecto.')
    ready = true
    select('case-content').hidden = false
    await loadCases()
  } catch {
    message(projectStatus, 'No se pudo cargar el proyecto. Revisá tu conexión y reintentá.', 'error')
    projectRetry.hidden = false
  } finally {
    projectLoading = false
  }
}

for (const input of [titleInput, expectedInput]) {
  input.addEventListener('input', () => input.setCustomValidity(''))
}
form.addEventListener('submit', async event => {
  event.preventDefault()
  if (!ready || saving) return
  for (const input of [titleInput, ...steps.map(step => step.input), expectedInput]) {
    input.setCustomValidity(input.value.trim() ? '' : 'Completá este campo con texto no vacío.')
    if (!input.value.trim()) { input.reportValidity(); input.focus(); return }
  }
  const payload = {
    title: titleInput.value.trim(),
    steps: steps.map(step => step.input.value.trim()),
    expectedResult: expectedInput.value.trim()
  }
  saving = true
  fields.disabled = true
  form.setAttribute('aria-busy', 'true')
  // Invalidate any older GET, including one still parsing JSON.
  requestVersion++
  refresh.disabled = true
  retry.hidden = true
  list.setAttribute('aria-busy', 'false')
  message(listStatus, 'La lista se actualizará después del envío.')
  message(formStatus, 'Guardando caso de prueba…')
  let confirmed = false
  try {
    const response = await fetch(endpoint, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
    })
    if (response.status === 404) { missingProject(); return }
    if (response.status === 400) {
      const body = await response.json()
      message(formStatus, typeof body.error === 'string' ? body.error : 'Revisá los datos del caso.', 'error')
      return
    }
    if (response.status !== 201) throw new Error('Resultado incierto')
    const body = await response.json()
    if (!validCase(body.testCase)) throw new Error('Respuesta inválida')
    confirmed = true
    cases = [...cases.filter(testCase => testCase.id !== body.testCase.id), body.testCase]
    renderCases()
    titleInput.value = ''
    expectedInput.value = ''
    select('steps').replaceChildren()
    steps = []
    message(formStatus, 'Caso de prueba creado correctamente.', 'success')
  } catch {
    message(formStatus, 'No pudimos confirmar la creación. Conservamos tus datos. Actualizá la lista antes de volver a enviar para evitar duplicados.', 'error')
  } finally {
    saving = false
    fields.disabled = false
    refresh.disabled = false
    form.removeAttribute('aria-busy')
    if (confirmed) { addStep(false); titleInput.focus() }
    else if (ready) message(listStatus, 'Actualizá la lista para consultar los casos guardados.')
  }
  // This function handles its own errors without changing creation confirmation.
  if (confirmed) await loadCases()
})

select('add-step').addEventListener('click', () => addStep())
refresh.addEventListener('click', loadCases)
retry.addEventListener('click', loadCases)
projectRetry.addEventListener('click', loadProject)
addStep(false)
try {
  const match = location.pathname.match(/^\/projects\/([^/]+)\/test-cases\/?$/)
  if (!match) throw new Error('Ruta inválida')
  projectId = decodeURIComponent(match[1])
  endpoint = `/api/projects/${encodeURIComponent(projectId)}/test-cases`
  loadProject()
} catch {
  message(projectStatus, 'La dirección del proyecto no es válida. Volvé al listado de proyectos.', 'error')
}
