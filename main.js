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