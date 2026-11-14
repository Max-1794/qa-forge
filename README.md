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

## Arquitectura

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
