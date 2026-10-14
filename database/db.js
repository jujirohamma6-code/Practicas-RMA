/* ==========================================================================
   CORNAVEX · CAPA DE DATOS (SQLite)
   --------------------------------------------------------------------------
   Responsabilidades de este archivo:
     1. Abrir la conexión con la base de datos local.
     2. Crear automáticamente las tablas de cada módulo si no existen.
     3. Exponer un "modelo" (whitelist de tabla + campos) por módulo para que
        el proceso principal construya SQL seguro.
     4. Ofrecer helpers promisificados (all / get / run) para usar async/await.
     5. Publicar la promesa `listo`: se resuelve cuando las tablas ya existen,
        para que los módulos que consultan al arrancar (usuarios) la esperen.
   ========================================================================== */
'use strict';

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Ruta del archivo de base de datos (vive junto a este script, en database/).
const dbPath = path.join(__dirname, 'monica_gestion.db');

// Se resuelve cuando termina crearTablas(): evita consultar tablas aún inexistentes.
let marcarListo;
const listo = new Promise((resolve) => { marcarListo = resolve; });

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error al conectar con la base de datos SQLite:', err.message);
        marcarListo();   // no dejar colgado a quien espere la base
        return;
    }
    console.log('Conectado a la base de datos SQLite con éxito.');
    crearTablas()
        .then(() => console.log('Tablas verificadas/creadas correctamente.'))
        .catch((e) => console.error('Error al crear las tablas:', e.message))
        .finally(marcarListo);
});

/* ==========================================================================
   MODELOS · un módulo -> una tabla + sus campos permitidos
   Esta whitelist es lo que hace seguro el CRUD genérico del proceso principal:
   ni los nombres de tabla ni los de columna vienen del renderer.
   La tabla `usuarios` NO se expone aquí: se gestiona en database/usuarios.js
   porque sus contraseñas nunca deben pasar por el CRUD genérico.
   ========================================================================== */
const MODELOS = {
    contabilidad: {
        tabla: 'asientos_contables',
        campos: ['nro_asiento', 'fecha', 'libro', 'dcmto', 'cuenta', 'descripcion', 'cliente_proveedor_id']
    },
    chequera: {
        tabla: 'movimientos_chequera',
        campos: ['nro_cheque', 'fecha', 'cliente_proveedor_id', 'beneficiario', 'monto', 'estado']
    },
    clientes: {
        tabla: 'clientes_proveedores',
        campos: ['codigo', 'nombre_razon', 'tipo', 'telefono', 'estado']
    }
};

/* ==========================================================================
   CREACIÓN AUTOMÁTICA DE TABLAS
   Devuelve una promesa que se cumple cuando la última tabla está creada.
   ========================================================================== */
function crearTablas() {
    return new Promise((resolve, reject) => {
        db.serialize(() => {
            // 1. Contabilidad · Asientos contables
            db.run(`CREATE TABLE IF NOT EXISTS asientos_contables (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                nro_asiento TEXT,
                fecha TEXT,
                libro TEXT,
                dcmto TEXT,
                cuenta TEXT,
                descripcion TEXT,
                cliente_proveedor_id INTEGER,
                FOREIGN KEY (cliente_proveedor_id) REFERENCES clientes_proveedores(id)
            )`);

            // 2. Cuentas Corrientes · Movimientos de chequera
            db.run(`CREATE TABLE IF NOT EXISTS movimientos_chequera (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                nro_cheque TEXT,
                fecha TEXT,
                cliente_proveedor_id INTEGER,
                beneficiario TEXT,
                monto TEXT,
                estado TEXT,
                FOREIGN KEY (cliente_proveedor_id) REFERENCES clientes_proveedores(id)
            )`);

            // 3. Clientes y Proveedores · Directorio de contactos
            db.run(`CREATE TABLE IF NOT EXISTS clientes_proveedores (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                codigo TEXT,
                nombre_razon TEXT,
                tipo TEXT,
                telefono TEXT,
                estado TEXT
            )`);

            // 4. Usuarios · acceso al sistema (la contraseña se guarda con scrypt)
            db.run(`CREATE TABLE IF NOT EXISTS usuarios (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                usuario TEXT NOT NULL UNIQUE,
                nombre TEXT,
                rol TEXT NOT NULL DEFAULT 'consulta',
                hash TEXT NOT NULL,
                salt TEXT NOT NULL,
                activo INTEGER NOT NULL DEFAULT 1,
                ultimo_acceso TEXT,
                creado TEXT
            )`, (err) => (err ? reject(err) : resolve()));
        });
    });
}

/* ==========================================================================
   HELPERS PROMISIFICADOS
   Permiten usar async/await en los manejadores IPC en lugar de callbacks.
   ========================================================================== */
function all(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, filas) => (err ? reject(err) : resolve(filas)));
    });
}

function get(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (err, fila) => (err ? reject(err) : resolve(fila)));
    });
}

function run(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function (err) {
            // `this` es el statement: expone lastID y changes.
            if (err) reject(err);
            else resolve({ id: this.lastID, cambios: this.changes });
        });
    });
}

module.exports = { db, all, get, run, crearTablas, listo, MODELOS };
