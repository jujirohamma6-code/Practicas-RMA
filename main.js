const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

let mainWindow;

// Inicialización de la base de datos SQLite
const dbPath = path.join(__dirname, 'monica.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error al abrir la base de datos', err.message);
  } else {
    console.log('Conectado a la base de datos SQLite.');
  }
});

// Creación de tablas por defecto si no existen
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS cuentas_por_cobrar (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    codigo TEXT,
    cliente TEXT,
    factura TEXT,
    fecha TEXT,
    vencimiento TEXT,
    monto REAL,
    saldo REAL,
    estado TEXT DEFAULT 'PENDIENTE'
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS productos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    codigo TEXT UNIQUE,
    nombre TEXT,
    categoria TEXT,
    costo REAL,
    precio REAL,
    existencia INTEGER,
    min_stock INTEGER DEFAULT 5,
    max_stock INTEGER DEFAULT 100
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS facturas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    numero TEXT,
    cliente TEXT,
    fecha TEXT,
    subtotal REAL,
    iva REAL,
    total REAL
  )`);
});

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webSecurity: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// IPC Handlers para la base de datos
ipcMain.handle('db:query', async (event, query, params = []) => {
  return new Promise((resolve, reject) => {
    db.all(query, params, (err, rows) => {
      if (err) reject(err.message);
      else resolve(rows);
    });
  });
});

ipcMain.handle('db:run', async (event, query, params = []) => {
  return new Promise((resolve, reject) => {
    db.run(query, params, function (err) {
      if (err) reject(err.message);
      else resolve({ id: this.lastID, changes: this.changes });
    });
  });
});

// NUEVO: Receptor para manejar la navegación entre los módulos
ipcMain.on('navegar-a', (event, pagina) => {
  mainWindow.loadFile(path.join(__dirname, 'renderer', pagina));
});