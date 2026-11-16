# QA Forge

API de proyectos, casos de prueba y ejecuciones. Requiere Node.js 24 o superior
(verificado con Node.js 24.21.0). Usa `DatabaseSync` de `node:sqlite`, sin
dependencias adicionales para persistencia.

## Iniciar el servidor

```powershell
npm.cmd install
npm.cmd run dev
```

El servidor escucha en `http://localhost:3000`. Por defecto guarda los datos en
`data/qa-forge.sqlite`, relativo a la raiz del proyecto, independientemente del
directorio desde el cual se inicia. Crea el directorio si no existe.

Para elegir otro archivo en PowerShell:

```powershell
$env:QA_FORGE_DB_PATH = 'data/otra-base.sqlite'
npm.cmd run dev
```

Las rutas relativas se resuelven desde la raiz del proyecto; tambien se aceptan
rutas absolutas. Los archivos SQLite locales y sus archivos auxiliares se ignoran
en Git. Al reiniciar se reutilizan las tablas y los datos existentes; la
inicializacion usa `CREATE TABLE IF NOT EXISTS`, sin eliminar tablas.

## Interfaz web (etapa 6A)

Con el servidor iniciado, abrir `http://localhost:3000/projects`.
La pantalla permite listar proyectos y crear uno con nombre obligatorio y
descripción opcional. Usa HTML, CSS y JavaScript nativos, sin compilación frontend
ni dependencias adicionales. `GET /` conserva su bienvenida JSON.

`src/web/page.ts` define el HTML y `src/web/routes.ts` registra la página y las
dos rutas públicas explícitas: `/assets/styles.css` y `/assets/projects.js`.
Los archivos se resuelven desde el módulo, independientemente del directorio de
ejecución. No hay un servidor estático general ni acceso público a `data/`.
`public/projects.js` consume exclusivamente la API existente; SQLite y sus
validaciones siguen a cargo del servidor. Los datos se representan con
`textContent` y elementos DOM, sin interpretar HTML de usuarios.

La carga incluye lista vacía, errores y reintento. El formulario impide envíos
simultáneos, conserva sus datos ante errores y anuncia el resultado mediante una
región accesible. Un POST incierto nunca se reintenta automáticamente: actualizar
primero el listado antes de volver a enviar, porque el servidor podría haberlo
guardado. Los nombres repetidos están permitidos por el contrato actual.

### Verificación manual

1. Ejecutar `npm.cmd run dev` y abrir `/projects`.
2. Comprobar carga, lista vacía (en una base nueva) y proyectos existentes.
3. Crear proyectos con y sin descripción; recargar y reiniciar para confirmar
   persistencia. No se modifica el esquema SQLite.
4. Probar nombre vacío y solo espacios, texto largo y un nombre como
   `<script>alert(1)</script>`: debe mostrarse literalmente.
5. Simular desconexión en las herramientas del navegador: verificar error de
   carga, reintento y conservación del formulario tras un POST fallido. Restaurar
   la conexión y actualizar antes de reenviar.
6. Revisar con teclado y a anchos de 375 y 1280 píxeles: foco visible, etiquetas,
   mensajes y ausencia de desbordamiento horizontal.

Los tests HTTP cubren tipos de contenido, assets, rutas privadas y compatibilidad
de la API. Los tests del cliente usan un DOM simulado sin dependencias; cubren
renderizado de texto, reintento, validación, doble envío y errores. No sustituyen
la revisión visual ni la comprobación con lector de pantalla en un navegador real.

## Gestión visual de casos de prueba (etapa 6B)

Desde `/projects`, elegir «Ver casos de prueba» en una tarjeta. Se abre
`/projects/:projectId/test-cases`, con el nombre del proyecto, sus casos en orden
de creación y un enlace «Volver a proyectos». También se puede abrir esa URL
directamente o recargarla.

El formulario requiere título, al menos un paso y resultado esperado. «Agregar
paso» enfoca el nuevo campo; «Quitar paso» renumera los pasos y mueve el foco a
un campo vecino. El único paso no se puede quitar. Ningún paso vacío se descarta:
debe completarse o quitarse antes de enviar. Durante el envío se deshabilitan
los campos y controles del formulario para evitar cambios y envíos simultáneos.

La pantalla usa exclusivamente los endpoints existentes: obtiene el nombre desde
`GET /api/projects` y lista/crea casos con
`GET/POST /api/projects/:projectId/test-cases`. No cambia contratos ni tablas.
El HTML inicial responde 200 incluso si el proyecto no existe; el cliente informa
esa situación a partir de la API y oculta la gestión. Los assets siguen una lista
explícita; no hay publicación general de archivos.

Los datos se representan con nodos DOM y `textContent`. Las cargas incluyen error,
reintento y lista vacía; los mensajes de creación y carga se anuncian en regiones
accesibles independientes. Las respuestas GET anteriores a un envío se descartan.
Si el POST se confirma y falla el refresco, se conserva el caso visible y la
confirmación de creación. Un resultado incierto conserva el formulario y no se
reintenta automáticamente: actualizar la lista antes de reenviar. Sin idempotencia
en la API, no se puede garantizar ausencia de duplicados tras perder una respuesta.

### Verificación manual de casos

1. Ejecutar `npm.cmd run dev`, abrir `http://localhost:3000/projects`, crear o
   elegir un proyecto y seguir «Ver casos de prueba».
2. Verificar nombre, lista vacía, enlace de regreso, navegación atrás/adelante y
   acceso directo a la URL de casos.
3. Crear un caso con varios pasos. Quitar el primero y uno intermedio; comprobar
   numeración, orden y que siempre quede al menos uno. Intentar enviar campos
   vacíos o con espacios, incluyendo un paso vacío entre pasos completos.
4. Crear un caso válido; comprobar confirmación y formulario limpio. Recargar y
   reiniciar el servidor para comprobar persistencia y aislamiento entre proyectos.
5. Probar `<script>alert(1)</script>` en el nombre del proyecto, título, pasos y
   resultado: debe verse como texto. Revisar textos largos y saltos de línea.
6. Simular desconexión para las cargas y probar sus reintentos. Interrumpir un POST:
   los datos deben conservarse y no debe haber reenvío automático. Con conexión
   lenta, enviar dos veces y comprobar que sale un solo POST. Si falla únicamente
   el GET posterior al POST, la confirmación debe seguir visible.
7. Abrir `/projects/inexistente/test-cases`: debe informar que el proyecto no
   existe, sin habilitar creación, y permitir volver.
8. Revisar a 375 y 1280 píxeles, con zoom y teclado: enlaces, campos, botones,
   foco al agregar/quitar pasos y ausencia de desbordamiento. Con lector de pantalla,
   verificar etiquetas y anuncios de carga, error y confirmación.

Los tests nuevos usan `node:test`, `node:vm` y un DOM simulado, sin dependencias
adicionales. Cubren navegación, assets, pasos, validación, XSS, errores, doble
envío y GET atrasados. No sustituyen la revisión visual y de accesibilidad real.
Además de los comandos habituales, ejecutar `node --check public/test-cases.js`.

## Capas del servidor

- `src/index.ts` elige la ruta, abre la conexion y la cierra al detener el servidor.
- `src/app.ts` recibe una conexion obligatoria con `createApp(db)`, valida las
  solicitudes y conserva los contratos HTTP anteriores. Importarlo no abre archivos.
- `src/storage.ts` inicializa las tres tablas y concentra las consultas SQL con
  parametros. Las claves foraneas impiden guardar casos o ejecuciones sin su padre.

Cada tabla tiene una clave primaria interna autoincremental para ordenar por
creacion. Los UUID siguen siendo identificadores unicos publicos y las relaciones
usan esos UUID. Los pasos se guardan con `JSON.stringify` y se recuperan con
`JSON.parse`, conservando su orden. Las fechas de ejecucion siguen siendo texto ISO.
Los campos opcionales ausentes se guardan como NULL y se omiten al responder;
las cadenas vacias se conservan.

## Pruebas

```powershell
npm.cmd test
npm.cmd run typecheck
git diff --check
```

Cada instancia de prueba recibe su propia base `:memory:` y la cierra al terminar.
Los tests no importan `src/index.ts` ni leen `QA_FORGE_DB_PATH`: no existe una
conexion de desarrollo por defecto en `createApp`. La prueba de persistencia usa
un archivo en un directorio temporal exclusivo, lo cierra, lo reabre y elimina
ese directorio al finalizar.
