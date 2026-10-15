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

function fechaOk(f) {
  if (!f || typeof f !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(f)) return false;
  const p = f.split('-');
  const d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
  return d.getFullYear() === Number(p[0]) && d.getMonth() === Number(p[1]) - 1 && d.getDate() === Number(p[2]);
}

ipcMain.handle('cxc:crear', (e, datos) => {
  try {
    const numeroFactura = String((datos && datos.numeroFactura) || '').trim();
    const cliente = String((datos && datos.cliente) || '').trim();
    const monto = Number(datos && datos.monto);
    const abono = Number(datos && datos.abono);
    const vencimiento = String((datos && datos.fechaVencimiento) || '').trim();
    if (!cliente) return { ok: false, error: 'El cliente no puede estar vacío.' };
    if (!Number.isFinite(monto) || monto <= 0) return { ok: false, error: 'El monto debe ser un número mayor que cero.' };
    if (!vencimiento) return { ok: false, error: 'La fecha de vencimiento no puede estar vacía.' };
    if (!fechaOk(vencimiento)) return { ok: false, error: 'La fecha de vencimiento no es válida.' };
    const abonado = Math.min(Number.isFinite(abono) && abono > 0 ? abono : 0, monto);
    const id = crypto.randomUUID();
    stmts.insert.run({
      id, factura: numeroFactura || ('F-' + new Date().getFullYear() + '-' + String(id.slice(0, 8))),
      cliente, monto, abonado, vencimiento, estado: estadoPara(abonado, monto)
    });
    return { ok: true, data: toRow(stmts.get.get(id)) };
  } catch (error) {
    return { ok: false, error: 'Error interno al guardar la cuenta.' };
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
    if (!id) return { ok: false, error: 'Identificador de cuenta no válido.' };
    const cantidad = Number(monto);
    if (!Number.isFinite(cantidad) || cantidad <= 0) return { ok: false, error: 'El monto de abono debe ser un número mayor que cero.' };
    const fila = stmts.get.get(id);
    if (!fila) return { ok: false, error: 'La cuenta por cobrar no existe.' };
    const nuevoAbonado = Math.min(Number(fila.abonado) + cantidad, Number(fila.monto));
    stmts.updateAbonado.run({ id, abonado: nuevoAbonado, estado: estadoPara(nuevoAbonado, fila.monto) });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: 'Error interno al registrar el abono.' };
  }
});

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    title: 'Contavex · Cuentas por Cobrar',
    backgroundColor: '#070a0f',
    webPreferences: {
      preload: path.join(__dirname, 'preload-cxc.js'),
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
