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
