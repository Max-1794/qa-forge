'use strict'

const form = document.querySelector('#project-form')
const nameInput = document.querySelector('#name')
const descriptionInput = document.querySelector('#description')
const createButton = document.querySelector('#create-button')
const formStatus = document.querySelector('#form-status')
const listStatus = document.querySelector('#list-status')
const list = document.querySelector('#project-list')
const count = document.querySelector('#project-count')
const retryButton = document.querySelector('#retry-button')
const refreshButton = document.querySelector('#refresh-button')
let projects = []
let saving = false
let loading = false

function renderProjects() {
  const cards = projects.map((project) => {
    const item = document.createElement('li')
    item.className = 'project-card'
    const title = document.createElement('h3')
    title.textContent = project.name
    const description = document.createElement('p')
    description.textContent = project.description || 'Sin descripción'
    item.append(title, description)
    return item
  })
  list.replaceChildren(...cards)
  count.textContent = String(projects.length)
}

async function loadProjects() {
  if (loading || saving) return
  loading = true
  refreshButton.disabled = true
  retryButton.hidden = true
  list.setAttribute('aria-busy', 'true')
  listStatus.className = ''
  listStatus.textContent = 'Cargando proyectos…'
  try {
    const response = await fetch('/api/projects')
    if (!response.ok) throw new Error('No se pudieron cargar los proyectos.')
    const body = await response.json()
    projects = body.projects
    renderProjects()
    listStatus.textContent = projects.length ? 'Tus proyectos, en orden de creación.' : 'Todavía no hay proyectos. Creá el primero con el formulario.'
  } catch {
    listStatus.className = 'error'
    listStatus.textContent = 'No se pudo actualizar la lista. Revisá tu conexión y reintentá.'
    retryButton.hidden = false
  } finally {
    loading = false
    refreshButton.disabled = false
    list.setAttribute('aria-busy', 'false')
    if (pendingRefresh) {
      pendingRefresh = false
      await loadProjects()
    }
  }
}

nameInput.addEventListener('input', () => nameInput.setCustomValidity(''))
form.addEventListener('submit', async (event) => {
  event.preventDefault()
  if (saving) return
  if (!nameInput.value.trim()) {
    nameInput.setCustomValidity('Ingresá un nombre para el proyecto.')
    nameInput.reportValidity()
    return
  }
  saving = true
  createButton.disabled = true
  form.setAttribute('aria-busy', 'true')
  formStatus.className = ''
  formStatus.textContent = 'Guardando proyecto…'
  const submittedName = nameInput.value
  const submittedDescription = descriptionInput.value
  let confirmed = false
  try {
    const response = await fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: submittedName.trim(), ...(submittedDescription === '' ? {} : { description: submittedDescription }) })
    })
    if (!response.ok) {
      // Only a validation rejection is known to be safe to submit again.
      if (response.status === 400) {
        const body = await response.json()
        formStatus.className = 'error'
        formStatus.textContent = body.error || 'Revisá los datos del proyecto.'
        return
      }
      throw new Error('Resultado incierto')
    }
    const { project } = await response.json()
    confirmed = true
    projects.push(project)
    renderProjects()
    // Preserve edits made while the request was pending.
    if (nameInput.value === submittedName && descriptionInput.value === submittedDescription) form.reset()
    formStatus.className = 'success'
    formStatus.textContent = 'Proyecto creado correctamente.'
    nameInput.focus()
  } catch {
    formStatus.className = 'error'
    formStatus.textContent = 'No pudimos confirmar la creación. Conservamos tus datos. Actualizá la lista antes de volver a enviar para evitar duplicados.'
  } finally {
    saving = false
    createButton.disabled = false
    form.removeAttribute('aria-busy')
  }
  // Reconcile with SQLite, also if an earlier GET was still in flight.
  if (confirmed) {
    if (loading) pendingRefresh = true
    else await loadProjects()
  }
})

let pendingRefresh = false
refreshButton.addEventListener('click', loadProjects)
retryButton.addEventListener('click', loadProjects)
loadProjects()
