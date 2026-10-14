<<<<<<< HEAD
"use strict";

const path = require("path");
const { app, BrowserWindow, ipcMain } = require("electron");
const db = require("./db/database");

let ventanaPrincipal = null;

function crearVentana() {
  ventanaPrincipal = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 900,
    minHeight: 620,
    backgroundColor: "#0f172a",
    autoHideMenuBar: true,
    title: "MÓNICA 9 · Módulo Parámetros",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  ventanaPrincipal.webContents.on("did-finish-load", () => {
    console.log("Renderer cargado correctamente.");
    if (process.env.MONICA_SMOKE_TEST === "1") {
      console.log("SMOKE_OK");
      setTimeout(() => app.quit(), 600);
    }
  });

  ventanaPrincipal.webContents.on("did-fail-load", (_e, code, desc, url) => {
    console.error("Fallo al cargar el renderer:", code, desc, url);
  });

  ventanaPrincipal.loadFile(
    path.join(__dirname, "renderer", process.env.MONICA_SMOKE_PAGE || "index.html")
  );
}

/** Registra todos los controladores IPC del módulo de parámetros. */
function registrarIpc() {
  ipcMain.handle("app:version", () => app.getVersion());
  ipcMain.handle("db:ruta", () => db.rutaBase);

  ipcMain.handle("parametros:leer", () => db.leerParametros());
  ipcMain.handle("parametros:guardar", (_evt, payload) => db.guardarParametros(payload || {}));

  ipcMain.handle("contadores:leer", () => db.leerContadores());
  ipcMain.handle("contadores:actualizar", (_evt, { clave, valor }) =>
    db.actualizarContador(clave, valor)
  );

  ipcMain.handle("preferencias:leer", (_evt, clave) => db.leerPreferencia(clave));
  ipcMain.handle("preferencias:guardar", (_evt, { clave, valor }) =>
    db.guardarPreferencia(clave, valor)
  );
}

app.whenReady().then(async () => {
  try {
    const ruta = await db.init(app.getPath("userData"));
    console.log("Base de datos inicializada en:", ruta);
  } catch (err) {
    console.error("No se pudo inicializar la base de datos:", err);
  }

  registrarIpc();
  crearVentana();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) crearVentana();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
=======
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const db = new sqlite3.Database('contabilidad.db');

// --- INICIALIZACIÓN DE TABLAS EN SQLITE ---
db.serialize(() => {
  // 1. Tabla Estimados
  db.run(`
    CREATE TABLE IF NOT EXISTS estimados (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cliente TEXT,
      fecha TEXT,
      descripcion TEXT,
      cantidad INTEGER,
      precio REAL,
      total REAL
    )
  `);

  // 2. Tabla Facturación
  db.run(`
    CREATE TABLE IF NOT EXISTS facturas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cliente TEXT,
      fecha TEXT,
      item TEXT,
      cantidad INTEGER,
      precio REAL,
      total REAL
    )
  `);

  // 3. Tabla Cuentas por Pagar (CxP)
  db.run(`
    CREATE TABLE IF NOT EXISTS cxp (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      proveedor TEXT,
      fecha TEXT,
      monto REAL,
      estado TEXT DEFAULT 'Pendiente'
    )
  `);
});

function createWindow() {
  const win = new BrowserWindow({
    width: 1050,
    height: 750,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  win.loadFile(path.join(__dirname, 'src/index.html'));
  win.focus();
}

// --- CANALES IPC PARA ESTIMADOS ---
ipcMain.handle('estimados:obtener', () => {
  return new Promise((resolve) => {
    db.all('SELECT * FROM estimados ORDER BY id DESC', [], (err, rows) => {
      resolve(err ? [] : rows);
    });
  });
});

ipcMain.handle('estimados:guardar', (event, datos) => {
  return new Promise((resolve) => {
    const total = datos.cantidad * datos.precio;
    const stmt = db.prepare('INSERT INTO estimados (cliente, fecha, descripcion, cantidad, precio, total) VALUES (?, ?, ?, ?, ?, ?)');
    stmt.run([datos.cliente, datos.fecha, datos.descripcion, datos.cantidad, datos.precio, total], function (err) {
      resolve({ success: !err, id: this ? this.lastID : null, error: err ? err.message : null });
    });
    stmt.finalize();
  });
});

ipcMain.handle('estimados:eliminar', (event, id) => {
  return new Promise((resolve) => {
    db.run('DELETE FROM estimados WHERE id = ?', [id], (err) => {
      resolve({ success: !err });
    });
  });
});

// --- CANALES IPC PARA FACTURACIÓN ---
ipcMain.handle('facturas:obtener', () => {
  return new Promise((resolve) => {
    db.all('SELECT * FROM facturas ORDER BY id DESC', [], (err, rows) => {
      resolve(err ? [] : rows);
    });
  });
});

ipcMain.handle('facturas:guardar', (event, datos) => {
  return new Promise((resolve) => {
    const total = datos.cantidad * datos.precio;
    const stmt = db.prepare('INSERT INTO facturas (cliente, fecha, item, cantidad, precio, total) VALUES (?, ?, ?, ?, ?, ?)');
    stmt.run([datos.cliente, datos.fecha, datos.item, datos.cantidad, datos.precio, total], function (err) {
      resolve({ success: !err, id: this ? this.lastID : null, error: err ? err.message : null });
    });
    stmt.finalize();
  });
});

ipcMain.handle('facturas:eliminar', (event, id) => {
  return new Promise((resolve) => {
    db.run('DELETE FROM facturas WHERE id = ?', [id], (err) => {
      resolve({ success: !err });
    });
  });
});

// --- CANALES IPC PARA CXP ---
ipcMain.handle('cxp:obtener', () => {
  return new Promise((resolve) => {
    db.all('SELECT * FROM cxp ORDER BY id DESC', [], (err, rows) => {
      resolve(err ? [] : rows);
    });
  });
});

ipcMain.handle('cxp:guardar', (event, datos) => {
  return new Promise((resolve) => {
    const stmt = db.prepare('INSERT INTO cxp (proveedor, fecha, monto, estado) VALUES (?, ?, ?, ?)');
    stmt.run([datos.proveedor, datos.fecha, datos.monto, datos.estado || 'Pendiente'], function (err) {
      resolve({ success: !err, id: this ? this.lastID : null, error: err ? err.message : null });
    });
    stmt.finalize();
  });
});

ipcMain.handle('cxp:eliminar', (event, id) => {
  return new Promise((resolve) => {
    db.run('DELETE FROM cxp WHERE id = ?', [id], (err) => {
      resolve({ success: !err });
    });
  });
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
>>>>>>> e075c6cc744bc1199a369dc263fe9e0ce334e795
