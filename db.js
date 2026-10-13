const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Ruta donde se guardará la base de datos localmente
const dbPath = path.join(__dirname, 'monica_gestion.db');

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error al conectar con la base de datos SQLite:', err.message);
    } else {
        console.log('Conectado a la base de datos SQLite con éxito.');
        crearTablas();
    }
});

function crearTablas() {
    db.serialize(() => {
        // 1. Tabla para Contabilidad
        db.run(`CREATE TABLE IF NOT EXISTS asientos_contables (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nro_asiento TEXT,
            fecha TEXT,
            libro TEXT,
            dcmto TEXT,
            cuenta TEXT,
            descripcion TEXT
        )`);

        // 2. Tabla para Cuentas Corrientes / Chequera
        db.run(`CREATE TABLE IF NOT EXISTS movimientos_chequera (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nro_cheque TEXT,
            fecha TEXT,
            beneficiario TEXT,
            monto TEXT,
            estado TEXT
        )`);

        // 3. Tabla para Clientes y Proveedores
        db.run(`CREATE TABLE IF NOT EXISTS clientes_proveedores (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            codigo TEXT,
            nombre_razon TEXT,
            tipo TEXT,
            telefono TEXT,
            estado TEXT
        )`);
        
        console.log('Tablas verificadas/creadas correctamente.');
    });
}

module.exports = db;