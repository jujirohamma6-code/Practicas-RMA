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
db.exec(`
  CREATE TABLE IF NOT EXISTS productos (
    codigo TEXT PRIMARY KEY,
    nombre TEXT NOT NULL,
    categoria TEXT,
    bodega TEXT,
    costo REAL NOT NULL DEFAULT 0,
    precio REAL NOT NULL DEFAULT 0,
    existencia REAL NOT NULL DEFAULT 0,
    minimo REAL NOT NULL DEFAULT 0
  )
`);

const stmts = {
  insert: db.prepare('INSERT INTO cuentas_por_cobrar (id, factura, cliente, monto, abonado, vencimiento, estado) VALUES (@id, @factura, @cliente, @monto, @abonado, @vencimiento, @estado)'),
  getAll: db.prepare('SELECT id, factura, cliente, monto, abonado, vencimiento, estado FROM cuentas_por_cobrar ORDER BY vencimiento ASC'),
  get: db.prepare('SELECT id, factura, cliente, monto, abonado, vencimiento, estado FROM cuentas_por_cobrar WHERE id = ?'),
  updateEstado: db.prepare('UPDATE cuentas_por_cobrar SET estado = @estado WHERE id = @id'),
  updateAbonado: db.prepare('UPDATE cuentas_por_cobrar SET abonado = @abonado, estado = @estado WHERE id = @id')
};

const pstmts = {
  insert: db.prepare('INSERT INTO productos (codigo, nombre, categoria, bodega, costo, precio, existencia, minimo) VALUES (@codigo, @nombre, @categoria, @bodega, @costo, @precio, @existencia, @minimo)'),
  getAll: db.prepare('SELECT codigo, nombre, categoria, bodega, costo, precio, existencia, minimo FROM productos ORDER BY nombre ASC'),
  get: db.prepare('SELECT codigo, nombre, categoria, bodega, costo, precio, existencia, minimo FROM productos WHERE codigo = ?'),
  update: db.prepare('UPDATE productos SET nombre = @nombre, categoria = @categoria, bodega = @bodega, costo = @costo, precio = @precio, existencia = @existencia, minimo = @minimo WHERE codigo = @codigo'),
  remove: db.prepare('DELETE FROM productos WHERE codigo = ?')
};

function toProducto(row) {
  if (!row) return null;
  return {
    codigo: row.codigo,
    nombre: row.nombre,
    categoria: row.categoria,
    bodega: row.bodega,
    costo: row.costo,
    precio: row.precio,
    existencia: row.existencia,
    minimo: row.minimo
  };
}

function normalizarProducto(datos) {
  const codigo = String((datos && datos.codigo) || '').trim();
  const nombre = String((datos && datos.nombre) || '').trim();
  const categoria = String((datos && datos.categoria) || '').trim();
  const bodega = String((datos && datos.bodega) || '').trim();
  const costo = Number(datos && datos.costo);
  const precio = Number(datos && datos.precio);
  const rawExistencia = datos ? datos.existencia : null;
  const rawMinimo = datos ? datos.minimo : null;
  const existencia = (rawExistencia == null || rawExistencia === '') ? 0 : Number(rawExistencia);
  const minimo = (rawMinimo == null || rawMinimo === '') ? 0 : Number(rawMinimo);
  if (!codigo) return { error: 'El código del producto es requerido.' };
  if (!nombre) return { error: 'El nombre del producto es requerido.' };
  if (!Number.isFinite(costo) || costo <= 0) return { error: 'El costo debe ser un número mayor que cero.' };
  if (!Number.isFinite(precio) || precio <= 0) return { error: 'El precio de venta debe ser un número mayor que cero.' };
  if (!Number.isFinite(existencia) || existencia < 0) return { error: 'La existencia no puede ser negativa.' };
  if (!Number.isFinite(minimo) || minimo < 0) return { error: 'El mínimo no puede ser negativo.' };
  return { data: { codigo, nombre, categoria, bodega, costo, precio, existencia, minimo } };
}

ipcMain.handle('inv:crear', (e, datos) => {
  try {
    const v = normalizarProducto(datos);
    if (v.error) return { ok: false, error: v.error };
    if (pstmts.get.get(v.data.codigo)) return { ok: false, error: 'Ya existe un producto con el código "' + v.data.codigo + '".' };
    pstmts.insert.run(v.data);
    return { ok: true, data: toProducto(pstmts.get.get(v.data.codigo)) };
  } catch (error) {
    return { ok: false, error: 'Error interno al guardar el producto.' };
  }
});

ipcMain.handle('inv:listar', () => {
  try {
    return pstmts.getAll.all().map(toProducto);
  } catch (error) {
    return [];
  }
});

ipcMain.handle('inv:actualizar', (e, { codigo, datos } = {}) => {
  try {
    const key = String(codigo || '').trim();
    if (!key) return { ok: false, error: 'Debe indicar el código del producto a actualizar.' };
    if (!pstmts.get.get(key)) return { ok: false, error: 'El producto "' + key + '" no existe.' };
    const v = normalizarProducto(Object.assign({}, datos, { codigo: key }));
    if (v.error) return { ok: false, error: v.error };
    pstmts.update.run(v.data);
    return { ok: true, data: toProducto(pstmts.get.get(key)) };
  } catch (error) {
    return { ok: false, error: 'Error interno al actualizar el producto.' };
  }
});

ipcMain.handle('inv:eliminar', (e, codigo) => {
  try {
    const key = String(codigo || '').trim();
    if (!key) return { ok: false, error: 'Debe indicar el código del producto a eliminar.' };
    const res = pstmts.remove.run(key);
    if (res.changes === 0) return { ok: false, error: 'El producto "' + key + '" no existe.' };
    return { ok: true };
  } catch (error) {
    return { ok: false, error: 'Error interno al eliminar el producto.' };
  }
});

ipcMain.handle('inv:seed', (e, lista) => {
  try {
    if (!Array.isArray(lista)) return { ok: false, error: 'Los datos de ejemplo no son válidos.' };
    if (pstmts.getAll.all().length > 0) return { ok: true, data: { sembrados: 0 } };
    const insertar = db.transaction((rows) => {
      for (const r of rows) {
        const codigo = String((r && r.codigo) || '').trim();
        const nombre = String((r && r.nombre) || '').trim();
        if (!codigo || !nombre) continue;
        pstmts.insert.run({
          codigo: codigo,
          nombre: nombre,
          categoria: String((r.categoria) || '').trim(),
          bodega: String((r.bodega) || '').trim(),
          costo: Number(r.costo) || 0,
          precio: Number(r.precio) || 0,
          existencia: Number(r.existencia) || 0,
          minimo: Number(r.minimo) || 0
        });
      }
    });
    insertar(lista);
    return { ok: true, data: { sembrados: pstmts.getAll.all().length } };
  } catch (error) {
    return { ok: false, error: 'Error interno al crear los datos de ejemplo.' };
  }
});

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

function vistaInicial() {
  const arg = process.argv.find(a => a.startsWith('--vista='));
  const vista = (arg ? arg.split('=')[1] : process.env.M9_VISTA) || 'inventario';
  return vista === 'inventario' ? 'inventario.html' : 'cuentas_por_cobrar.html';
}

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
  win.loadFile(vistaInicial());
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