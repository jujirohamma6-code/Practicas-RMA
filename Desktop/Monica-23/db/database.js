"use strict";

/**
 * Capa de persistencia SQLite (sql.js / WebAssembly) para el Módulo Parámetros.
 * El archivo .db se guarda en la carpeta userData de la aplicación.
 */

const path = require("path");
const fs = require("fs");
const initSqlJs = require("sql.js");

const ESQUEMA = `
CREATE TABLE IF NOT EXISTS empresa_parametros (
  id               INTEGER PRIMARY KEY CHECK (id = 1),
  titulo           TEXT NOT NULL DEFAULT 'C T RMA',
  codigo           TEXT NOT NULL DEFAULT '45PC11L3',
  fecha            TEXT NOT NULL DEFAULT '',
  licencia         TEXT NOT NULL DEFAULT 'Gratuita',
  sistema_operativo TEXT NOT NULL DEFAULT 'Windows 8',
  directorio_empresa TEXT NOT NULL DEFAULT 'C:\\MONICA9\\mi_empresa\\',
  actualizado_en   TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS contadores (
  clave    TEXT PRIMARY KEY,
  etiqueta TEXT NOT NULL,
  valor    INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS preferencias (
  clave TEXT PRIMARY KEY,
  valor TEXT NOT NULL DEFAULT ''
);
`;

const CONTADORES_INICIALES = [
  ["productos_almacen", "Productos registrados en almacén"],
  ["facturas", "Facturas registradas"],
  ["estimados", "Estimados registrados"],
  ["clientes_proveedores", "Registros en Cltes./Proveeds."],
  ["catalogo_cuentas", "Registros en Catálogo de Cuentas"],
  ["asientos_contables", "Registros en Asientos Contables"],
  ["cierres_contables", "Total de Cierres Contables"]
];

let SQL = null;
let db = null;
let dbPath = null;

/** Inicializa la base de datos (crea el archivo si no existe). */
async function init(userDataDir) {
  SQL = await initSqlJs({
    locateFile: (file) => path.join(path.dirname(require.resolve("sql.js")), file)
  });

  dbPath = path.join(userDataDir, "monica.db");

  if (fs.existsSync(dbPath)) {
    const archivo = fs.readFileSync(dbPath);
    db = new SQL.Database(new Uint8Array(archivo));
  } else {
    db = new SQL.Database();
  }

  db.run(ESQUEMA);
  sembrarValoresIniciales();
  persistir();
  return dbPath;
}

/** Inserta los valores por defecto una sola vez. */
function sembrarValoresIniciales() {
  const hay = get("SELECT COUNT(*) AS n FROM empresa_parametros")[0].n;
  if (hay === 0) {
    db.run(
      `INSERT INTO empresa_parametros
         (id, titulo, codigo, fecha, licencia, sistema_operativo, directorio_empresa, actualizado_en)
       VALUES (1, ?, ?, ?, ?, ?, ?, ?)`,
      [
        "C T RMA",
        "45PC11L3",
        "09/10/2026",
        "Gratuita",
        "Windows 8",
        "C:\\MONICA9\\mi_empresa\\",
        new Date().toISOString()
      ]
    );
  }

  for (const [clave, etiqueta] of CONTADORES_INICIALES) {
    db.run(
      "INSERT OR IGNORE INTO contadores (clave, etiqueta, valor) VALUES (?, ?, 0)",
      [clave, etiqueta]
    );
  }
}

/** Ejecuta una consulta y devuelve las filas como objetos. */
function get(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const filas = [];
  while (stmt.step()) filas.push(stmt.getAsObject());
  stmt.free();
  return filas;
}

/** Guarda el estado en disco. */
function persistir() {
  const datos = Buffer.from(db.export());
  fs.writeFileSync(dbPath, datos);
}

/* ------------------------- API pública ------------------------- */

function leerParametros() {
  return get("SELECT * FROM empresa_parametros WHERE id = 1")[0] || null;
}

function guardarParametros(p = {}) {
  const actual = leerParametros() || {};
  const fusionado = {
    titulo: p.titulo ?? actual.titulo ?? "C T RMA",
    codigo: p.codigo ?? actual.codigo ?? "45PC11L3",
    fecha: p.fecha ?? actual.fecha ?? "",
    licencia: p.licencia ?? actual.licencia ?? "Gratuita",
    sistema_operativo: p.sistema_operativo ?? actual.sistema_operativo ?? "Windows 8",
    directorio_empresa: p.directorio_empresa ?? actual.directorio_empresa ?? "C:\\MONICA9\\mi_empresa\\"
  };

  db.run(
    `INSERT INTO empresa_parametros
       (id, titulo, codigo, fecha, licencia, sistema_operativo, directorio_empresa, actualizado_en)
     VALUES (1, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       titulo = excluded.titulo,
       codigo = excluded.codigo,
       fecha = excluded.fecha,
       licencia = excluded.licencia,
       sistema_operativo = excluded.sistema_operativo,
       directorio_empresa = excluded.directorio_empresa,
       actualizado_en = excluded.actualizado_en`,
    [
      fusionado.titulo,
      fusionado.codigo,
      fusionado.fecha,
      fusionado.licencia,
      fusionado.sistema_operativo,
      fusionado.directorio_empresa,
      new Date().toISOString()
    ]
  );

  persistir();
  return leerParametros();
}

function leerContadores() {
  return get("SELECT clave, etiqueta, valor FROM contadores ORDER BY rowid");
}

function actualizarContador(clave, valor) {
  if (!clave) throw new Error("La clave del contador es obligatoria");
  const n = Number.isFinite(Number(valor)) ? Number(valor) : 0;
  db.run("UPDATE contadores SET valor = ? WHERE clave = ?", [n, clave]);
  persistir();
  return get("SELECT clave, etiqueta, valor FROM contadores WHERE clave = ?", [clave])[0] || null;
}

function leerPreferencia(clave) {
  const fila = get("SELECT valor FROM preferencias WHERE clave = ?", [clave])[0];
  return fila ? fila.valor : null;
}

function guardarPreferencia(clave, valor) {
  db.run(
    "INSERT INTO preferencias (clave, valor) VALUES (?, ?) ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor",
    [clave, String(valor ?? "")]
  );
  persistir();
  return leerPreferencia(clave);
}

module.exports = {
  init,
  leerParametros,
  guardarParametros,
  leerContadores,
  actualizarContador,
  leerPreferencia,
  guardarPreferencia,
  get rutaBase() {
    return dbPath;
  }
};
