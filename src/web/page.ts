export const projectsPage = `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="Organizá los proyectos de tu equipo en QA Forge.">
  <title>Proyectos · QA Forge</title>
  <link rel="stylesheet" href="/assets/styles.css">
  <script src="/assets/projects.js" defer></script>
</head>
<body>
  <header class="topbar"><a class="brand" href="/projects"><span class="brand-mark" aria-hidden="true">Q</span> QA Forge</a><span class="workspace">Espacio de trabajo</span></header>
  <main>
    <div class="intro"><p class="eyebrow">ORGANIZÁ TU TRABAJO</p><h1>Todo comienza con un proyecto.</h1><p>Un espacio para dar forma a tus pruebas y construir con confianza.</p></div>
    <div class="layout">
      <section class="panel form-panel" aria-labelledby="new-title">
        <p class="eyebrow">UN NUEVO COMIENZO</p><h2 id="new-title">Nuevo proyecto</h2><p class="muted">Dale un nombre y contanos de qué se trata.</p>
        <form id="project-form">
          <label for="name">Nombre <span class="required">(obligatorio)</span></label>
          <input id="name" name="name" required autocomplete="off" placeholder="Ej. Portal de clientes" aria-describedby="name-help">
          <small id="name-help">Usá un nombre que tu equipo reconozca.</small>
          <label for="description">Descripción <span class="required">(opcional)</span></label>
          <textarea id="description" name="description" rows="4" placeholder="¿Qué vamos a poner a prueba?"></textarea>
          <button id="create-button" type="submit">Crear proyecto <span aria-hidden="true">→</span></button>
          <p id="form-status" role="status" aria-live="polite" aria-atomic="true"></p>
        </form>
      </section>
      <section class="projects-section" aria-labelledby="projects-title">
        <div class="section-heading"><div><p class="eyebrow">TU ESPACIO DE CALIDAD</p><h2 id="projects-title">Proyectos <span id="project-count" class="count">0</span></h2></div><button id="refresh-button" type="button" class="secondary">Actualizar</button></div>
        <p id="list-status" role="status" aria-live="polite" aria-atomic="true">Cargando proyectos…</p>
        <button id="retry-button" class="secondary" type="button" hidden>Reintentar carga</button>
        <ul id="project-list" class="project-list" aria-label="Proyectos" aria-busy="true"></ul>
        <noscript><p>Activá JavaScript para listar y crear proyectos.</p></noscript>
      </section>
    </div>
    <footer>QA Forge <span aria-hidden="true">/</span> La calidad se construye, proyecto a proyecto.</footer>
  </main>
</body>
</html>`
