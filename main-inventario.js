const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const Database = require('better-sqlite3');

const dbPath = path.join(app.getPath('userData'), 'contabilidad.db');
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
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

function ensureColumn(table, column, definition) {
  try {
    const cols = db.prepare('PRAGMA table_info(' + table + ')').all();
    const existe = cols.some(function (c) { return c.name === column; });
    if (!existe) db.exec('ALTER TABLE ' + table + ' ADD COLUMN ' + column + ' ' + definition);
  } catch (error) {
    // La columna ya existe o la tabla no es inspeccionable: no romper el arranque.
  }
}

ensureColumn('productos', 'categoria', 'TEXT');
ensureColumn('productos', 'bodega', 'TEXT');
ensureColumn('productos', 'costo', 'REAL DEFAULT 0');
ensureColumn('productos', 'precio', 'REAL DEFAULT 0');
ensureColumn('productos', 'existencia', 'REAL DEFAULT 0');
ensureColumn('productos', 'minimo', 'REAL DEFAULT 0');

try {
  db.prepare("UPDATE productos SET costo = 0 WHERE costo IS NULL OR costo = '' OR costo = 'NaN'").run();
  db.prepare("UPDATE productos SET precio = 0 WHERE precio IS NULL OR precio = '' OR precio = 'NaN'").run();
  db.prepare("UPDATE productos SET existencia = 0 WHERE existencia IS NULL OR existencia = '' OR existencia = 'NaN'").run();
  db.prepare("UPDATE productos SET minimo = 0 WHERE minimo IS NULL OR minimo = '' OR minimo = 'NaN'").run();
} catch (e) {
  console.error('No se pudieron actualizar los costos antiguos:', e);
}

const pstmts = {
  insert: db.prepare('INSERT INTO productos (codigo, nombre, categoria, bodega, costo, precio, existencia, minimo) VALUES (@codigo, @nombre, @categoria, @bodega, @costo, @precio, @existencia, @minimo)'),
  getAll: db.prepare('SELECT codigo, nombre, categoria, bodega, costo, precio, existencia, minimo FROM productos ORDER BY nombre ASC'),
  get: db.prepare('SELECT codigo, nombre, categoria, bodega, costo, precio, existencia, minimo FROM productos WHERE codigo = ?'),
  update: db.prepare('UPDATE productos SET nombre = @nombre, categoria = @categoria, bodega = @bodega, costo = @costo, precio = @precio, existencia = @existencia, minimo = @minimo WHERE codigo = @codigo'),
  remove: db.prepare('DELETE FROM productos WHERE codigo = ?')
};

function toProducto(row) {
  if (!row) return null;
  const costo = Number(row.costo) || 0;
  const precio = Number(row.precio) || 0;
  const existencia = Number(row.existencia) || 0;
  const minimo = Number(row.minimo) || 0;
  return {
    codigo: row.codigo,
    nombre: row.nombre,
    categoria: row.categoria,
    bodega: row.bodega,
    costo: costo,
    precio: precio,
    existencia: existencia,
    minimo: minimo,
    valor: Number(row.valor) || (costo * existencia)
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
  if (!Number.isFinite(costo) || costo < 0) return { error: 'El costo debe ser un número mayor o igual a cero.' };
  if (!Number.isFinite(precio) || precio < 0) return { error: 'El precio de venta debe ser un número mayor o igual a cero.' };
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
    const rows = pstmts.getAll.all();
    const productosMapeados = rows.map((p) => ({
      ...p,
      costo: Number(p.costo) || 0,
      precio: Number(p.precio) || 0,
      existencia: Number(p.existencia) || 0,
      minimo: Number(p.minimo) || 0,
      valor: Number(p.valor) || ((Number(p.costo) || 0) * (Number(p.existencia) || 0))
    }));
    return productosMapeados;
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

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    title: 'Contavex · Inventario',
    backgroundColor: '#070a0f',
    webPreferences: {
      preload: path.join(__dirname, 'preload-inventario.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  win.loadFile('inventario.html');
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
