export const testCasesPage = `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Casos de prueba · QA Forge</title>
  <link rel="stylesheet" href="/assets/styles.css">
  <script src="/assets/test-cases.js" defer></script>
</head>
<body>
  <header class="topbar"><a class="brand" href="/projects"><span class="brand-mark" aria-hidden="true">Q</span> QA Forge</a><span class="workspace">Espacio de trabajo</span></header>
  <main>
    <a href="/projects">← Volver a proyectos</a>
    <div class="intro case-intro"><p class="eyebrow">CASOS DE PRUEBA</p><h1 id="project-name">Proyecto</h1>
      <p id="project-status" role="status" aria-live="polite" aria-atomic="true">Cargando proyecto…</p>
      <button id="project-retry" type="button" class="secondary" hidden>Reintentar carga del proyecto</button>
    </div>
    <div id="case-content" class="layout" hidden>
      <section class="panel form-panel" aria-labelledby="new-title">
        <h2 id="new-title">Nuevo caso de prueba</h2>
        <form id="case-form">
          <fieldset id="case-fields">
            <legend class="visually-hidden">Datos del caso; todos los campos son obligatorios</legend>
            <label for="title">Título (obligatorio)</label>
            <input id="title" name="title" required autocomplete="off">
            <fieldset class="steps-fieldset"><legend>Pasos (obligatorios)</legend>
              <div id="steps"></div>
              <button id="add-step" type="button" class="secondary">Agregar paso</button>
            </fieldset>
            <p id="step-status" class="visually-hidden" role="status" aria-live="polite"></p>
            <label for="expected-result">Resultado esperado (obligatorio)</label>
            <textarea id="expected-result" name="expectedResult" rows="4" required></textarea>
            <button id="create-button" type="submit">Crear caso de prueba</button>
          </fieldset>
          <p id="form-status" role="status" aria-live="polite" aria-atomic="true"></p>
        </form>
      </section>
      <section aria-labelledby="cases-title">
        <div class="section-heading"><h2 id="cases-title">Casos de prueba <span id="case-count" class="count">0</span></h2><button id="refresh-button" type="button" class="secondary">Actualizar</button></div>
        <p id="list-status" role="status" aria-live="polite" aria-atomic="true"></p>
        <button id="retry-button" type="button" class="secondary" hidden>Reintentar carga de casos</button>
        <ul id="case-list" class="project-list" aria-label="Casos de prueba" aria-busy="false"></ul>
      </section>
    </div>
    <noscript><p>Activá JavaScript para listar y crear casos de prueba.</p></noscript>
    <footer>QA Forge / La calidad se construye, caso a caso.</footer>
  </main>
</body>
</html>`
