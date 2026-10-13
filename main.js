const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const crypto = require('crypto');
const Database = require('better-sqlite3');

const dbPath = path.join(app.getPath('userData'), 'contabilidad.db');
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.exec(`
  CREATE TABLE IF NOT EXISTS cuentas_por_cobrar (
    id TEXT PRIMARY KEY,
    factura TEXT NOT NULL,
    cliente TEXT NOT NULL,
    monto REAL NOT NULL DEFAULT 0,
    abonado REAL NOT NULL DEFAULT 0,
    vencimiento TEXT,
    estado TEXT NOT NULL DEFAULT 'Pendiente'
  )
`);

const stmts = {
  insert: db.prepare('INSERT INTO cuentas_por_cobrar (id, factura, cliente, monto, abonado, vencimiento, estado) VALUES (@id, @factura, @cliente, @monto, @abonado, @vencimiento, @estado)'),
  getAll: db.prepare('SELECT id, factura, cliente, monto, abonado, vencimiento, estado FROM cuentas_por_cobrar ORDER BY vencimiento ASC'),
  get: db.prepare('SELECT id, factura, cliente, monto, abonado, vencimiento, estado FROM cuentas_por_cobrar WHERE id = ?'),
  updateEstado: db.prepare('UPDATE cuentas_por_cobrar SET estado = @estado WHERE id = @id'),
  updateAbonado: db.prepare('UPDATE cuentas_por_cobrar SET abonado = @abonado, estado = @estado WHERE id = @id')
};

function toRow(reg) {
  if (!reg) return null;
  return {
    id: reg.id,
    factura: reg.factura,
    cliente: reg.cliente,
    monto: reg.monto,
    abono: reg.abonado,
    fecha_vencimiento: reg.vencimiento,
    estado: reg.estado
  };
}

function estadoPara(abonado, monto) {
  if (abonado >= monto) return 'Pagado';
  if (abonado > 0) return 'Parcial';
  return 'Pendiente';
}

ipcMain.handle('cxc:crear', (e, datos) => {
  try {
    const numeroFactura = String((datos && datos.numeroFactura) || '').trim();
    const cliente = String((datos && datos.cliente) || '').trim();
    const monto = Number(datos && datos.monto);
    const abono = Math.max(Number(datos && datos.abono) || 0, 0);
    const vencimiento = String((datos && datos.fechaVencimiento) || '').trim() || null;
    if (!cliente || !(monto > 0)) return false;
    const id = crypto.randomUUID();
    const abonado = Math.min(abono, monto);
    stmts.insert.run({
      id, factura: numeroFactura || ('F-' + new Date().getFullYear() + '-' + String(id.slice(0, 8))),
      cliente, monto, abonado, vencimiento, estado: estadoPara(abonado, monto)
    });
    return toRow(stmts.get.get(id));
  } catch (error) {
    return false;
  }
});

ipcMain.handle('cxc:listar', () => {
  try {
    return stmts.getAll.all().map(toRow);
  } catch (error) {
    return [];
  }
});

ipcMain.handle('cxc:actualizar-estado', (e, { id, estado }) => {
  try {
    if (!id || !estado) return false;
    if (['Pendiente', 'Parcial', 'Pagado'].indexOf(estado) === -1) return false;
    const res = stmts.updateEstado.run({ id, estado });
    return res.changes > 0;
  } catch (error) {
    return false;
  }
});

ipcMain.handle('cxc:abonar', (e, { id, monto }) => {
  try {
    if (!id || !(Number(monto) > 0)) return false;
    const fila = stmts.get.get(id);
    if (!fila) return false;
    const nuevoAbonado = Math.min(Number(fila.abonado) + Number(monto), Number(fila.monto));
    const res = stmts.updateAbonado.run({ id, abonado: nuevoAbonado, estado: estadoPara(nuevoAbonado, fila.monto) });
    return res.changes > 0;
  } catch (error) {
    return false;
  }
});

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    title: 'Mónica 9 · Gestión Contable',
    backgroundColor: '#070a0f',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  win.loadFile('cuentas_por_cobrar.html');
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