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
    const execute = document.createElement('button')
    execute.type = 'button'
    execute.className = 'secondary execution-open'
    execute.textContent = 'Ejecutar / ver historial'
    execute.setAttribute('aria-label', `Ejecutar o ver historial de ${testCase.title}`)
    execute.disabled = executionSaving
    execute.addEventListener('click', () => openExecution(testCase.id))
    card.append(title, ordered, heading, expected, execute)
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
  historyVersion++
  select('execution-panel').hidden = true
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

const executionForm = select('execution-form')
const executionFields = select('execution-fields')
const executionNotes = select('execution-notes')
const executionStatus = select('execution-status')
const historyStatus = select('history-status')
const historyList = select('execution-history')
const historyRefresh = select('history-refresh')
const executionRadios = ['pass', 'fail', 'blocked'].map(value => select(`execution-${value}`))
let selectedCaseId = null
let executionSaving = false
let executionMissing = false
let historyVersion = 0
let executions = []
// Confirmed results survive a subsequent GET that has not observed them yet.
let confirmedExecutions = []

function selectedStatus() {
  return executionRadios.find(input => input.checked)?.value
}

function mayDiscardExecution() {
  if (executionSaving) return false
  return !(selectedStatus() || executionNotes.value !== '') ||
    window.confirm('Hay un resultado o notas sin guardar. ¿Descartar el borrador?')
}

function executionEndpoint(id) {
  return `/api/test-cases/${encodeURIComponent(id)}/executions`
}

function validExecution(value, id) {
  return value && typeof value.id === 'string' && value.id !== '' && value.testCaseId === id &&
    ['PASS', 'FAIL', 'BLOCKED'].includes(value.status) &&
    typeof value.executedAt === 'string' && Number.isFinite(Date.parse(value.executedAt)) &&
    (!('notes' in value) || typeof value.notes === 'string')
}

function renderHistory() {
  historyList.replaceChildren(...[...executions].reverse().map(execution => {
    const item = document.createElement('li')
    const status = document.createElement('strong')
    status.textContent = execution.status
    const time = document.createElement('time')
    time.setAttribute('datetime', execution.executedAt)
    time.textContent = new Intl.DateTimeFormat('es', {
      dateStyle: 'medium', timeStyle: 'long'
    }).format(new Date(execution.executedAt))
    item.append(status, time)
    if ('notes' in execution) {
      const notes = document.createElement('p')
      notes.textContent = execution.notes
      item.append(notes)
    }
    return item
  }))
}

function missingExecutionCase() {
  executionMissing = true
  executionFields.disabled = true
  message(executionStatus, 'El caso de prueba no existe. Actualizá la lista de casos.', 'error')
}

async function loadHistory() {
  if (!selectedCaseId || executionSaving || !ready) return
  const id = selectedCaseId
  const version = ++historyVersion
  historyRefresh.disabled = true
  historyList.setAttribute('aria-busy', 'true')
  message(historyStatus, 'Cargando historial…')
  try {
    const response = await fetch(executionEndpoint(id))
    if (version !== historyVersion || id !== selectedCaseId) return
    if (response.status === 404) { missingExecutionCase(); message(historyStatus, 'El caso de prueba no existe.', 'error'); return }
    if (response.status !== 200) throw new Error('Carga fallida')
    const body = await response.json()
    if (version !== historyVersion || id !== selectedCaseId) return
    if (!Array.isArray(body.executions) || !body.executions.every(value => validExecution(value, id)) ||
        new Set(body.executions.map(value => value.id)).size !== body.executions.length) throw new Error('Respuesta inválida')
    const ids = new Set(body.executions.map(value => value.id))
    confirmedExecutions = confirmedExecutions.filter(value => !ids.has(value.id))
    executions = [...body.executions, ...confirmedExecutions]
    renderHistory()
    message(historyStatus, executions.length ? 'Más recientes primero. Fechas en la zona horaria del navegador.' : 'Todavía no hay ejecuciones.')
  } catch {
    if (version !== historyVersion || id !== selectedCaseId) return
    message(historyStatus, 'No se pudo actualizar el historial. Los resultados visibles pueden estar desactualizados. Reintentá con Actualizar historial.', 'error')
  } finally {
    if (version === historyVersion && id === selectedCaseId) {
      historyRefresh.disabled = false
      historyList.setAttribute('aria-busy', 'false')
    }
  }
}

function openExecution(id) {
  if (!ready || executionSaving) return
  const testCase = cases.find(value => value.id === id)
  if (!testCase) return
  if (selectedCaseId === id) { select('execution-title').focus(); return }
  if (!mayDiscardExecution()) return
  historyVersion++
  selectedCaseId = id
  executionMissing = false
  executionFields.disabled = false
  executions = []
  confirmedExecutions = []
  executionRadios.forEach(input => { input.checked = false })
  executionNotes.value = ''
  message(executionStatus, '')
  select('execution-title').textContent = `Ejecución: ${testCase.title}`
  select('execution-steps').replaceChildren(...testCase.steps.map(step => {
    const item = document.createElement('li')
    item.textContent = step
    return item
  }))
  select('execution-expected').textContent = testCase.expectedResult
  renderHistory()
  select('execution-panel').hidden = false
  select('execution-title').focus()
  return loadHistory()
}

select('execution-close').addEventListener('click', () => {
  if (!mayDiscardExecution()) return
  const index = cases.findIndex(value => value.id === selectedCaseId)
  historyVersion++
  selectedCaseId = null
  executionNotes.value = ''
  executionRadios.forEach(input => { input.checked = false })
  select('execution-panel').hidden = true
  const origin = list.children[index]?.children[4]
  if (origin) origin.focus()
  else refresh.focus()
})
historyRefresh.addEventListener('click', loadHistory)
executionForm.addEventListener('submit', async event => {
  event.preventDefault()
  if (!ready || !selectedCaseId || executionSaving || executionMissing) return
  const status = selectedStatus()
  if (!['PASS', 'FAIL', 'BLOCKED'].includes(status)) {
    message(executionStatus, 'Seleccioná PASS, FAIL o BLOCKED antes de registrar.', 'error')
    executionRadios[0].focus()
    return
  }
  const id = selectedCaseId
  const payload = { status, ...(executionNotes.value === '' ? {} : { notes: executionNotes.value }) }
  executionSaving = true
  executionFields.disabled = true
  select('execution-close').disabled = true
  for (const card of list.children) card.children[4].disabled = true
  historyRefresh.disabled = true
  historyVersion++
  historyList.setAttribute('aria-busy', 'false')
  message(historyStatus, 'Consultá el historial después del envío para ver los resultados guardados.')
  executionForm.setAttribute('aria-busy', 'true')
  message(executionStatus, 'Guardando resultado…')
  let confirmed = false
  try {
    const response = await fetch(executionEndpoint(id), {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
    })
    if (response.status === 404) { missingExecutionCase(); return }
    if (response.status === 400) {
      const body = await response.json()
      message(executionStatus, typeof body.error === 'string' ? body.error : 'Revisá el resultado y las notas.', 'error')
      return
    }
    if (response.status !== 201) throw new Error('Resultado incierto')
    const body = await response.json()
    if (!validExecution(body.execution, id) || body.execution.status !== status ||
        body.execution.notes !== payload.notes) throw new Error('Respuesta inválida')
    confirmed = true
    confirmedExecutions.push(body.execution)
    executions = [...executions.filter(value => value.id !== body.execution.id), body.execution]
    renderHistory()
    executionNotes.value = ''
    executionRadios.forEach(input => { input.checked = false })
    message(executionStatus, 'Resultado registrado correctamente.', 'success')
  } catch {
    message(executionStatus, 'No pudimos confirmar el registro. Conservamos tus datos. Consultá el historial antes de volver a enviar para evitar duplicados.', 'error')
  } finally {
    executionSaving = false
    executionFields.disabled = executionMissing
    select('execution-close').disabled = false
    for (const card of list.children) card.children[4].disabled = false
    historyRefresh.disabled = false
    executionForm.removeAttribute('aria-busy')
  }
  if (confirmed) await loadHistory()
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
