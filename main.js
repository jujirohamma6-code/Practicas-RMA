const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

// Crear/conectar la base de datos local
const db = new DatabasePath();

function DatabasePath() {
  return new sqlite3.Database('contabilidad.db');
}

// Crear tabla de prueba
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS prueba (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      mensaje TEXT
    )
  `);

  db.get('SELECT COUNT(*) as count FROM prueba', (err, row) => {
    if (row && row.count === 0) {
      db.run('INSERT INTO prueba (mensaje) VALUES (?)', ['Conexión exitosa a SQLite vía IPC']);
    }
  });
});

function createWindow() {
  const win = new BrowserWindow({
    width: 1000,
    height: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  win.loadFile(path.join(__dirname, 'src/index.html'));
}

// Canal IPC de prueba para leer datos
ipcMain.handle('db:test-conexion', () => {
  return new Promise((resolve, reject) => {
    db.get('SELECT mensaje FROM prueba LIMIT 1', (err, row) => {
      if (err) resolve('Error en SQLite');
      else resolve(row ? row.mensaje : 'Sin datos');
    });
  });
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});