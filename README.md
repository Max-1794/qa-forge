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

## Ejecución visual de casos (etapa 6C)

En la pantalla de casos, «Ejecutar / ver historial» abre un panel compartido debajo
del listado. Muestra el caso, sus pasos y el resultado esperado. Los pasos se
realizan manualmente: el panel registra el resultado, no automatiza el navegador.
No agrega rutas web, dependencias, contratos ni cambios al esquema SQLite.

Es obligatorio seleccionar explícitamente PASS, FAIL o BLOCKED; no hay resultado
por defecto. Las notas son opcionales: se envían literalmente, incluidos espacios
y saltos de línea. Un campo vacío se omite del POST. La API genera ID y fecha;
el formulario no permite editarlos. Se reutiliza exclusivamente
`GET/POST /api/test-cases/:testCaseId/executions`.

El historial se carga al abrir el panel, manualmente con «Actualizar historial» y
después de un registro confirmado. Se muestra invirtiendo el orden de creación
recibido, con las ejecuciones más recientes primero, sin cambiar SQLite ni ordenar
por fechas. Las fechas se presentan en la zona horaria del navegador. No se hacen
solicitudes de historial por cada tarjeta. La API devuelve el historial completo,
sin paginación ni actualizaciones en tiempo real.

Cerrar o cambiar de caso pide confirmación mediante el diálogo nativo cuando hay
notas (incluso espacios) o un resultado sin guardar. Cancelar conserva el borrador.
Actualizar o crear casos no reconstruye el panel. Durante el POST se bloquean los
campos, el doble envío, el cierre y el cambio de caso. La protección del borrador
se aplica al cierre del panel y al cambio de caso; recargar o abandonar la página
no conserva el borrador.

Un 400 conserva el formulario y muestra el error como texto. Un 404 de ejecuciones
bloquea el registro de ese caso y pide actualizar los casos; no se interpreta como
proyecto inexistente. Ante red, 5xx o respuesta inválida, se conserva el formulario
y se indica consultar el historial antes de reenviar. Nunca se reintenta un POST
automáticamente. Sin idempotencia no puede garantizarse ausencia de duplicados
si se pierde una respuesta.

Los GET atrasados, incluso durante el parseo JSON, se descartan al cambiar de caso,
cerrar o enviar. Las ejecuciones confirmadas se conservan hasta que el GET las
incluya; si falla la actualización, siguen visibles junto con el mensaje de éxito.
Los errores de carga tienen un estado independiente y permiten actualizar sin
borrar el historial visible. Títulos, pasos, notas y errores usan `textContent`.

El panel usa radios nativos con etiquetas y leyenda, regiones de estado, foco en
el encabezado al abrir y regreso al botón de origen al cerrar. Los estados se
identifican con texto además del estilo. La aplicación sigue sin autenticación
ni autorización: la selección desde un proyecto no constituye control de acceso
en el servidor. No es una solución de aislamiento multiusuario.

### Verificación manual de ejecuciones

1. Iniciar con `npm.cmd run dev`, abrir `/projects`, elegir un proyecto y abrir
   «Ejecutar / ver historial» en uno de sus casos. Verificar pasos, resultado
   esperado y estado vacío del historial en un caso sin ejecuciones.
2. Intentar registrar sin selección. Registrar PASS, FAIL y BLOCKED, con notas
   vacías y con espacios, saltos de línea y `<script>alert(1)</script>`: las notas
   deben verse literalmente. Comprobar orden reciente primero y persistencia
   después de recargar y reiniciar el servidor.
3. Con notas o selección sin guardar, intentar cerrar y cambiar de caso. Cancelar
   debe conservar todo; aceptar debe descartar. Actualizar los casos o crear otro
   caso debe conservar el panel y su borrador.
4. Con red lenta, enviar dos veces e intentar cerrar o cambiar de caso: sólo debe
   salir un POST y los controles deben estar bloqueados durante el envío.
5. Simular desconexión o respuesta fallida: conservar el formulario y consultar
   el historial antes de reenviar. Si falla sólo el GET posterior al POST, el
   resultado confirmado y el mensaje de éxito deben seguir visibles.
6. Cambiar rápidamente entre casos con cargas pendientes: los resultados deben
   pertenecer siempre al caso seleccionado. Actualizar el historial en otra
   pestaña y comprobar que se obtiene al solicitarlo manualmente.
7. Revisar teclado, radios con flechas, confirmación nativa, foco al abrir/cerrar,
   lector de pantalla, zoom y anchos de 375 y 1280 píxeles, con textos largos y
   multilínea. No debe haber desbordamiento horizontal.

Los tests de cliente cubren selección, notas, orden, descarte, concurrencia,
errores y respuestas atrasadas mediante el DOM simulado existente. Los tests web
verifican el marcado inicial sin selección por defecto. No sustituyen la revisión
visual ni las pruebas reales con teclado y lector de pantalla.

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
