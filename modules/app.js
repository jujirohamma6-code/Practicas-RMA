/* ==========================================================================
   CORNAVEX · LÓGICA DE INTERFAZ (Bloque 1)
   --------------------------------------------------------------------------
   Arquitectura del archivo:
     01. Configuración de módulos
     02. Utilidades de formato y DOM
     03. Capa de datos (API Electron + respaldo local)
     04. Estado de la aplicación
     05. Navegación entre módulos
     06. Render de estadísticas, tablas y acciones
     07. Formularios (abrir / validar / guardar / cancelar)
     08. Notificaciones (toasts) — implementadas en modules/ui.js
     09. Inicialización y eventos globales
     10. Sesión de usuario y permisos
   ========================================================================== */
'use strict';

/* ==========================================================================
   01. CONFIGURACIÓN DE MÓDULOS
   Cada módulo declara cómo se nombra, qué columnas muestra su tabla cuyos
   datos provienen de las mismas llaves que espera el backend.
   ========================================================================== */
const MODULOS = {
  contabilidad: {
    backend: 'contabilidad',
    titulo: 'Contabilidad',
    subtitulo: 'Registro y control de asientos contables.',
    singular: 'asiento',
    nuevoTitulo: 'Nuevo asiento contable',
    editarTitulo: 'Editar asiento contable',
    columnas: [
      { key: 'nro_asiento', label: 'Nro. Asiento' },
      { key: 'fecha', label: 'Fecha', render: (r) => formatearFecha(r.fecha) },
      { key: 'libro', label: 'Libro', render: (r) => badge(r.libro || '—', 'badge--info') },
      { key: 'dcmto', label: 'Dcmto.' },
      { key: 'cuenta', label: 'Cuenta' },
      { key: 'cliente_proveedor_id', label: 'Cliente / Proveedor', render: (r) => {
        const cp = r.cliente_proveedor_id ? `CP-${r.cliente_proveedor_id}` : '--';
        return cp;
      }},
      { key: 'descripcion', label: 'Descripción / Nombre' }
    ],
    // Reglas de validación del formulario (las aplica modules/ui.js)
    validaciones: [
      { campo: 'nro_asiento', requerido: true, minLongitud: 2, mensaje: 'El nro. de asiento no puede estar vacío (mínimo 2 caracteres).' },
      { campo: 'fecha', requerido: true, mensaje: 'La fecha es obligatoria.' }
    ],
    stats: (rows) => {
      const cuentas = new Set(rows.map((r) => r.cuenta).filter(Boolean));
      const ultima = rows[0] ? formatearFecha(rows[0].fecha) : '—';
      return [
        { label: 'Total de asientos', value: rows.length },
        { label: 'Cuentas distintas', value: cuentas.size },
        { label: 'Último registro', value: ultima }
      ];
    }
  },

  chequera: {
    backend: 'chequera',
    titulo: 'Cuentas Corrientes',
    subtitulo: 'Movimientos de chequera y cuentas corrientes.',
    singular: 'movimiento',
    nuevoTitulo: 'Nuevo movimiento',
    editarTitulo: 'Editar movimiento',
    columnas: [
      { key: 'nro_cheque', label: 'Nro. Cheque / Dcmto.' },
      { key: 'fecha', label: 'Fecha', render: (r) => formatearFecha(r.fecha) },
      { 
        key: 'beneficiario', 
        label: 'Beneficiario / Concepto', 
        render: (r) => {
          const cp = r.cliente_proveedor_id ? `CP-${r.cliente_proveedor_id}` : '--';
          return cp;
        }
      },
      { key: 'monto', label: 'Monto', align: 'num', render: (r) => formatearMonto(r.monto) },
      { key: 'estado', label: 'Estado', render: (r) => badgeEstadoChequera(r.estado) }
    ],
    // Reglas de validación del formulario (las aplica modules/ui.js)
    validaciones: [
      { campo: 'nro_cheque', requerido: true, minLongitud: 2, mensaje: 'El nro. de cheque/documento no puede estar vacío (mínimo 2 caracteres).' },
      { campo: 'fecha', requerido: true, mensaje: 'La fecha es obligatoria.' },
      { campo: 'monto', requerido: true, noNegativo: true, mensaje: 'El monto debe ser un número igual o mayor que 0.' }
    ],
    stats: (rows) => {
      const total = rows.reduce((acc, r) => acc + (Number(String(r.monto).replace(/[^0-9.-]/g, '')) || 0), 0);
      const pendientes = rows.filter((r) => /pendiente|emitido/i.test(r.estado || '')).length;
      return [
        { label: 'Movimientos', value: rows.length },
        { label: 'Monto total', value: formatearMonto(total) },
        { label: 'Pendientes / emitidos', value: pendientes }
      ];
    }
  },

  clientes: {
    backend: 'clientes',
    titulo: 'Clientes y Proveedores',
    subtitulo: 'Directorio de contactos y proveedores.',
    singular: 'contacto',
    nuevoTitulo: 'Nuevo contacto',
    editarTitulo: 'Editar contacto',
    columnas: [
      { key: 'codigo', label: 'Código' },
      { key: 'nombre_razon', label: 'Nombre / Razón Social' },
      { key: 'tipo', label: 'Tipo', render: (r) => badge(r.tipo || '—', r.tipo === 'Proveedor' ? 'badge--warning' : 'badge--info') },
      { key: 'telefono', label: 'Teléfono' },
      { key: 'estado', label: 'Estado', render: (r) => badgeEstadoContacto(r.estado) }
    ],
    // Reglas de validación del formulario (las aplica modules/ui.js)
    validaciones: [
      { campo: 'codigo', requerido: true, minLongitud: 3, mensaje: 'El código no puede estar vacío (mínimo 3 caracteres).' },
      { campo: 'nombre_razon', requerido: true, minLongitud: 3, mensaje: 'El nombre / razón social es obligatorio (mínimo 3 caracteres).' }
    ],
    stats: (rows) => {
      const clientes = rows.filter((r) => /cliente/i.test(r.tipo || '')).length;
      const proveedores = rows.filter((r) => /proveedor/i.test(r.tipo || '')).length;
      return [
        { label: 'Contactos', value: rows.length },
        { label: 'Clientes', value: clientes },
        { label: 'Proveedores', value: proveedores }
      ];
    }
  },

  usuarios: {
    backend: 'usuarios',
    titulo: 'Usuarios',
    subtitulo: 'Cuentas de acceso, roles y estado.',
    singular: 'usuario',
    nuevoTitulo: 'Nuevo usuario',
    editarTitulo: 'Editar usuario',
    soloAdmin: true,   // la vista solo existe para el rol administrador
    columnas: [
      { key: 'usuario', label: 'Usuario' },
      { key: 'nombre', label: 'Nombre' },
      { key: 'rol', label: 'Rol', render: (r) => badgeRol(r.rol) },
      { key: 'activo', label: 'Estado', render: (r) => badgeActivo(r.activo) },
      { key: 'ultimo_acceso', label: 'Último acceso', render: (r) => formatearFechaHora(r.ultimo_acceso) }
    ],
    // La contraseña NO se valida aquí: es obligatoria solo al crear y se
    // comprueba aparte en guardarFormulario().
    validaciones: [
      { campo: 'usuario', requerido: true, minLongitud: 3, mensaje: 'El usuario es obligatorio (mínimo 3 caracteres).' }
    ],
    stats: (rows) => {
      const activos = rows.filter((r) => r.activo).length;
      const admins = rows.filter((r) => r.rol === 'admin').length;
      return [
        { label: 'Usuarios', value: rows.length },
        { label: 'Activos', value: activos },
        { label: 'Administradores', value: admins }
      ];
    }
  }
};

const MODULO_INICIAL = 'contabilidad';

// Usuario y rol por defecto cuando no hay sesión interactiva.
const USUARIO_POR_DEFECTO = { id: 1, usuario: 'admin', nombre: 'Administrador', rol: 'admin' };

/* ==========================================================================
   02. UTILIDADES DE FORMATO Y DOM
   ========================================================================== */
const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

/** Escapa texto para insertarlo de forma segura dentro de HTML. */
function esc(valor) {
  return String(valor ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Normaliza texto para comparar/buscar sin acentos y sin mayúsculas. */
function norm(valor) {
  return String(valor ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/** Capitaliza la primera letra de un texto. */
function capitalizar(texto) {
  const s = String(texto || '');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Etiqueta legible de un registro (para mensajes y confirmaciones). */
function etiquetaRegistro(registro = {}) {
  return registro.nro_asiento || registro.nro_cheque || registro.codigo || registro.usuario || registro.nombre_razon || 'sin identificar';
}

/** Fecha de hoy en formato YYYY-MM-DD (zona local). */
function hoyISO() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

/** Convierte una fecha (ISO o dd/mm/yyyy) a dd/mm/yyyy para mostrarla. */
function formatearFecha(valor) {
  if (!valor) return '—';
  const s = String(valor);
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
  return s;
}

/** Da formato de moneda a un valor numérico. */
function formatearMonto(valor) {
  if (valor === null || valor === undefined || valor === '') return '$ 0.00';
  const n = Number(String(valor).replace(/[^0-9.-]/g, ''));
  if (!isFinite(n)) return esc(valor);
  return '$ ' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Genera una etiqueta de estado. */
function badge(texto, clase) {
  return `<span class="badge ${clase}">${esc(texto)}</span>`;
}

function badgeEstadoChequera(estado) {
  const e = String(estado || '').toLowerCase();
  if (e.includes('cobrado')) return badge(estado, 'badge--success');
  if (e.includes('anulado')) return badge(estado, 'badge--danger');
  if (e.includes('emitido')) return badge(estado, 'badge--info');
  return badge(estado || '—', 'badge--warning');
}

function badgeEstadoContacto(estado) {
  return /inactivo/i.test(estado || '')
    ? badge(estado || '—', 'badge--neutral')
    : badge(estado || '—', 'badge--success');
}

/** Convierte una marca de tiempo ISO a "dd/mm/yyyy hh:mm". */
function formatearFechaHora(valor) {
  if (!valor) return 'Nunca';
  const d = new Date(valor);
  if (isNaN(d.getTime())) return formatearFecha(valor);
  const hora = d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  return `${formatearFecha(valor)} ${hora}`;
}

/** Nombre legible de un rol ('admin' -> 'Administrador'). */
function etiquetaRol(rol) {
  const nombres = { admin: 'Administrador', contador: 'Contador', consulta: 'Consulta' };
  return nombres[rol] || capitalizar(rol || '—');
}

function badgeRol(rol) {
  return badge(etiquetaRol(rol), rol === 'admin' ? 'badge--rol' : 'badge--neutral');
}

function badgeActivo(activo) {
  return activo ? badge('Activo', 'badge--success') : badge('Inactivo', 'badge--danger');
}

/** Iniciales para el avatar del sidebar ("Juan Pérez" -> "JP"). */
function iniciales(texto) {
  const partes = String(texto || '').trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return '??';
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}

/* ==========================================================================
   03. CAPA DE DATOS
   Usa el puente IPC de Electron (window.api) cuando está disponible.
   En el navegador (sin Electron) cae a un almacén local en localStorage para
   poder probar la interfaz sin backend.
   ========================================================================== */
const MockDB = {
  KEY: 'monica-gestion:datos',
  cache: null,

  semilla() {
    return {
      contabilidad: [
        { id: 1, nro_asiento: 'AS-0001', fecha: '2026-04-11', libro: 'DIA', dcmto: 'ASIE', cuenta: '1101', descripcion: 'Caja General' },
        { id: 2, nro_asiento: 'AS-0002', fecha: '2026-04-12', libro: 'MAY', dcmto: 'ASIE', cuenta: '4101', descripcion: 'Ingresos por servicios' }
      ],
      chequera: [
        { id: 1, nro_cheque: 'CHK-001', fecha: '2026-10-12', cliente_proveedor_id: 1, beneficiario: 'Pago de Servicios Básicos', monto: '250.00', estado: 'Cobrado' },
        { id: 2, nro_cheque: 'CHK-002', fecha: '2026-10-13', cliente_proveedor_id: 2, beneficiario: 'Distribuidora Central', monto: '1840.50', estado: 'Pendiente' }
      ],
      clientes: [
        { id: 1, codigo: 'CLI-001', nombre_razon: 'Comercial San José S.A.', tipo: 'Cliente', telefono: '+505 8888-8888', estado: 'Activo' },
        { id: 2, codigo: 'PROV-001', nombre_razon: 'Distribuidora Central', tipo: 'Proveedor', telefono: '+505 2222-2222', estado: 'Activo' }
      ],
      usuarios: [
        { id: 1, usuario: 'admin', nombre: 'Administrador (demo)', rol: 'admin', activo: true, ultimo_acceso: '', creado: '' },
        { id: 2, usuario: 'consulta', nombre: 'Solo consulta (demo)', rol: 'consulta', activo: true, ultimo_acceso: '', creado: '' }
      ]
    };
  },

  leer() {
    if (this.cache) return this.cache;
    try {
      const guardado = localStorage.getItem(this.KEY);
      this.cache = guardado ? JSON.parse(guardado) : this.semilla();
    } catch (e) {
      this.cache = this.semilla();
    }
    return this.cache;
  },

  escribir() {
    try { localStorage.setItem(this.KEY, JSON.stringify(this.cache)); } catch (e) { /* sin persistencia */ }
  },

  listar(modulo) {
    return [...(this.leer()[modulo] || [])];
  },

  crear(modulo, datos) {
    const lista = this.leer()[modulo] || (this.leer()[modulo] = []);
    const id = lista.reduce((max, r) => Math.max(max, Number(r.id) || 0), 0) + 1;
    lista.unshift({ id, ...datos });
    this.escribir();
    return { success: true, id };
  },

  actualizar(modulo, id, datos) {
    const lista = this.leer()[modulo] || [];
    const idx = lista.findIndex((r) => String(r.id) === String(id));
    if (idx > -1) lista[idx] = { ...lista[idx], ...datos };
    this.escribir();
    return { success: idx > -1, cambios: idx > -1 ? 1 : 0 };
  },

  eliminar(modulo, id) {
    const lista = this.leer()[modulo] || [];
    const restantes = lista.filter((r) => String(r.id) !== String(id));
    this.leer()[modulo] = restantes;
    this.escribir();
    return { success: true, cambios: lista.length - restantes.length };
  }
};

const DataService = {
  /** Devuelve la API IPC del módulo si Electron está disponible. */
  api(modulo) {
    const cfg = MODULOS[modulo];
    return (window.api && window.api[cfg.backend]) || null;
  },

  /** Devuelve el listado completo de un módulo. */
  async listar(modulo) {
    const api = this.api(modulo);
    if (api) {
      try {
        const res = await api.listar();
        if (res && res.success) return res.data || [];
        console.warn('[Datos] Error del backend:', res && res.error);
        return [];
      } catch (e) {
        console.error('[Datos] Fallo al consultar:', e);
        return [];
      }
    }
    return MockDB.listar(modulo);
  },

  /** Carga la lista de clientes y proveedores para los selects dinámicos. */
  async listarClientesProveedores() {
    try {
      // Usa el CRUD genérico de clientes expuesto por el preload
      const res = await window.api.clientes.listar();
      if (res && res.success) return res.data || [];
    } catch (e) {
      console.error('[Datos] Error al listar clientes:', e);
    }
    // Fallback a MockDB
    return MockDB.listar('clientes');
  },

  /** Persiste un registro nuevo. */
  async crear(modulo, datos) {
    const api = this.api(modulo);
    if (api) {
      try {
        return (await api.crear(datos)) || { success: false, error: 'Sin respuesta del backend' };
      } catch (e) {
        return { success: false, error: e.message };
      }
    }
    return MockDB.crear(modulo, datos);
  },

  /** Actualiza un registro existente por su id. */
  async actualizar(modulo, id, datos) {
    const api = this.api(modulo);
    if (api) {
      try {
        return (await api.actualizar(id, datos)) || { success: false, error: 'Sin respuesta del backend' };
      } catch (e) {
        return { success: false, error: e.message };
      }
    }
    return MockDB.actualizar(modulo, id, datos);
  },

  /** Elimina un registro existente por su id. */
  async eliminar(modulo, id) {
    const api = this.api(modulo);
    if (api) {
      try {
        return (await api.eliminar(id)) || { success: false, error: 'Sin respuesta del backend' };
      } catch (e) {
        return { success: false, error: e.message };
      }
    }
    return MockDB.eliminar(modulo, id);
  }
};

/* ==========================================================================
   04. ESTADO DE LA APLICACIÓN
   `estado` guarda en memoria los registros de cada módulo (fuente única de
   verdad para la tabla). `filtros` guarda el texto de búsqueda por módulo.
   ========================================================================== */
const estado = {
  contabilidad: [],
  chequera: [],
  clientes: [],
  usuarios: [],
  cargado: { contabilidad: false, chequera: false, clientes: false, usuarios: false },
  filtros: { contabilidad: '', chequera: '', clientes: '', usuarios: '' }
};

/* ==========================================================================
   05. NAVEGACIÓN ENTRE MÓDULOS
   ========================================================================== */
function navegarA(modulo) {
  if (!MODULOS[modulo]) return;
  // Los módulos solo-admin no son accesibles para el resto de roles (aunque
  // alguien fuerce el botón desde la consola, aquí se redirige).
  if (MODULOS[modulo].soloAdmin && rolActual() !== 'admin') {
    modulo = MODULO_INICIAL;
  }
  const cfg = MODULOS[modulo];

  // Alternar vistas
  $$('.vista').forEach((v) => v.classList.toggle('is-active', v.dataset.vista === modulo));
  $$('.nav-item').forEach((b) => b.classList.toggle('is-active', b.dataset.vista === modulo));

  // Actualizar encabezado
  $('#tituloVista').textContent = cfg.titulo;
  $('#subtituloVista').textContent = cfg.subtitulo;

  // Cerrar el menú móvil si está abierto
  cerrarMenuMovil();

  // Cargar datos la primera vez que se visita el módulo
  cargarModulo(modulo);
}

/* --- Menú lateral: colapsable en escritorio, off-canvas en móvil --- */
function esVistaMovil() {
  return window.matchMedia('(max-width: 1024px)').matches;
}

function estaColapsado() {
  const shell = $('.app-shell');
  return !!shell && shell.classList.contains('is-menu-collapsed');
}

function estaAbiertoMovil() {
  const shell = $('.app-shell');
  return !!shell && shell.classList.contains('is-nav-open');
}

/** Alterna el sidebar: lo colapsa en escritorio y lo abre/cierra en móvil. */
function toggleMenu() {
  const shell = $('.app-shell');
  if (!shell) return;

  if (esVistaMovil()) {
    const abierto = shell.classList.toggle('is-nav-open');
    const scrim = $('#sidebarScrim');
    if (scrim) scrim.hidden = !abierto;
  } else {
    shell.classList.toggle('is-menu-collapsed');
  }
  actualizarBotonMenu();
}

/** Sincroniza el estado del sidebar con el botón (accesibilidad). */
function actualizarBotonMenu() {
  const btn = $('#menu-btn') || $('#btnMenu');
  if (!btn) return;
  const visible = esVistaMovil() ? estaAbiertoMovil() : !estaColapsado();
  btn.setAttribute('aria-expanded', String(visible));
}

function abrirMenuMovil() {
  const shell = $('.app-shell');
  if (shell) shell.classList.add('is-nav-open');
  const scrim = $('#sidebarScrim');
  if (scrim) scrim.hidden = false;
  actualizarBotonMenu();
}

function cerrarMenuMovil() {
  const shell = $('.app-shell');
  if (shell) shell.classList.remove('is-nav-open');
  const scrim = $('#sidebarScrim');
  if (scrim) scrim.hidden = true;
  actualizarBotonMenu();
}

/* ==========================================================================
   06. RENDER DE ESTADÍSTICAS, TABLAS Y ACCIONES
   ========================================================================== */
async function cargarModulo(modulo, forzar = false) {
  if (estado.cargado[modulo] && !forzar) {
    renderModulo(modulo);
    return;
  }
  estado[modulo] = await DataService.listar(modulo);
  estado.cargado[modulo] = true;
  renderModulo(modulo);
}

/** Vuelve a pintar estadísticas y tabla de un módulo. */
function renderModulo(modulo) {
  renderStats(modulo);
  renderTabla(modulo);
}

function renderStats(modulo) {
  const cont = $(`#stats-${modulo}`);
  if (!cont) return;
  const filas = MODULOS[modulo].stats(estado[modulo]);
  cont.innerHTML = filas
    .map((s) => `<div class="stat"><span class="stat__label">${esc(s.label)}</span><span class="stat__value">${esc(s.value)}</span></div>`)
    .join('');
}

/** Devuelve los registros filtrados según la búsqueda activa del módulo. */
function filasVisibles(modulo) {
  const q = norm(estado.filtros[modulo]);
  const filas = estado[modulo];
  if (!q) return filas;

  // Búsqueda por múltiples términos ("pulperia prov" encuentra ambos)
  const terminos = q.split(/\s+/);
  return filas.filter((r) => {
    const texto = norm(Object.values(r).join(' '));
    return terminos.every((t) => texto.includes(t));
  });
}

function renderTabla(modulo) {
  const cfg = MODULOS[modulo];
  const tbody = $(`[data-tbody="${modulo}"]`);
  if (!tbody) return;

  const filas = filasVisibles(modulo);
  const contador = $(`[data-count="${modulo}"]`);
  if (contador) {
    // Con filtro activo se muestra "X registros de Y"
    const hayFiltro = norm(estado.filtros[modulo]) !== '';
    const etiqueta = filas.length === 1 ? '1 registro' : `${filas.length} registros`;
    contador.textContent = hayFiltro ? `${etiqueta} de ${estado[modulo].length}` : etiqueta;
  }

  if (filas.length === 0) {
    const vacio = estado[modulo].length === 0
      ? 'Aún no hay registros. Crea el primero con el botón superior.'
      : 'No se encontraron coincidencias con la búsqueda.';
    tbody.innerHTML = `
      <tr>
        <td colspan="${cfg.columnas.length + 1}">
          <div class="empty">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
              <path d="M4 7l8-4 8 4-8 4-8-4z"/><path d="M4 12l8 4 8-4"/><path d="M4 17l8 4 8-4"/>
            </svg>
            <strong>Sin datos</strong>
            <span>${esc(vacio)}</span>
          </div>
        </td>
      </tr>`;
    return;
  }

  tbody.innerHTML = filas
    .map((r) => {
      const celdas = cfg.columnas
        .map((c) => {
          const clase = c.align === 'num' ? ' class="col-num"' : '';
          const contenido = c.render ? c.render(r) : esc(r[c.key] ?? '—');
          return `<td${clase}>${contenido}</td>`;
        })
        .join('');

      return `
        <tr>
          ${celdas}
          <td class="col-actions">
            <div class="row-actions">
              <button class="btn-icon" type="button" data-action="editar" data-id="${esc(r.id)}" title="Editar" aria-label="Editar registro">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>
                </svg>
              </button>
              <button class="btn-icon btn-icon--danger" type="button" data-action="eliminar" data-id="${esc(r.id)}" title="Eliminar" aria-label="Eliminar registro">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/>
                </svg>
              </button>
            </div>
          </td>
        </tr>`;
    })
    .join('');
}

/* ==========================================================================
   07. FORMULARIOS
   ========================================================================== */
function abrirFormulario(modulo, registro = null) {
  const cfg = MODULOS[modulo];
  const panel = $(`#form-${modulo}`);
  const form = $(`form[data-modulo="${modulo}"]`);
  if (!panel || !form) return;

  form.reset();
  form.elements.id.value = registro ? registro.id : '';
  UI.limpiarErrores(form); // el formulario se abre siempre limpio

  // Cargar clientes y proveedores en los selects dinámicos
  if (modulo === 'chequera' || modulo === 'contabilidad') {
    DataService.listarClientesProveedores().then((clientes) => {
      const benSelect = form.elements['beneficiario'];
      const cliSelect = form.elements['con-cliente'];
      if (benSelect) {
        // Limpiar opciones existentes (excepto la primera)
        benSelect.innerHTML = '<option value="">-- Seleccionar cliente/proveedor --</option>';
        clientes.forEach((c) => {
          const opt = document.createElement('option');
          opt.value = c.id;
          opt.textContent = `${c.usuario || c.codigo} - ${c.nombre_razon}`;
          benSelect.appendChild(opt);
        });
      }
      if (cliSelect) {
        cliSelect.innerHTML = '<option value="">-- Ninguno --</option>';
        clientes.forEach((c) => {
          const opt = document.createElement('option');
          opt.value = c.id;
          opt.textContent = `${c.usuario || c.codigo} - ${c.nombre_razon}`;
          cliSelect.appendChild(opt);
        });
      }
    });
  }

  if (registro) {
    // Se copian los campos del registro: `password` se omite a propósito (el
    // backend nunca lo devuelve) y `activo` (booleano) necesita conversión.
    Object.entries(registro).forEach(([clave, valor]) => {
      const campo = form.elements[clave];
      if (!campo || campo.type === 'password' || clave === 'activo') return;
      campo.value = valor ?? '';
    });
    if (form.elements.activo) form.elements.activo.value = registro.activo ? '1' : '0';
    form.querySelector('[data-form-title]').textContent = cfg.editarTitulo;
  } else {
    // Valores por defecto para registros nuevos
    if (form.elements.fecha) form.elements.fecha.value = hoyISO();
    if (form.elements.libro) form.elements.libro.value = 'DIA';
    if (form.elements.estado) form.elements.estado.value = form.elements.estado.options[0].value;
    if (form.elements.tipo) form.elements.tipo.value = 'Cliente';
    if (form.elements.rol) form.elements.rol.value = 'consulta';
    if (form.elements.activo) form.elements.activo.value = '1';
    form.querySelector('[data-form-title]').textContent = cfg.nuevoTitulo;
  }

  // La contraseña solo es obligatoria al crear: cambia la marca y la ayuda.
  marcarPasswordObligatoria(modulo, !registro);

  panel.classList.add('is-open');
  const primero = form.querySelector('input:not([type="hidden"]), select, textarea');
  if (primero) primero.focus();
}

/** En el módulo Usuarios, marca y explica el campo contraseña. */
function marcarPasswordObligatoria(modulo, esNuevo) {
  if (modulo !== 'usuarios') return;
  const marca = $('#usu-password-req');
  if (marca) marca.hidden = !esNuevo;
  const ayuda = $('#usu-password-hint');
  if (ayuda) {
    ayuda.textContent = esNuevo
      ? 'Mínimo 6 caracteres.'
      : 'Déjala vacía para conservar la contraseña actual.';
  }
}

function cerrarFormulario(modulo) {
  const panel = $(`#form-${modulo}`);
  const form = $(`form[data-modulo="${modulo}"]`);
  if (panel) panel.classList.remove('is-open');
  if (form) {
    form.reset();
    form.elements.id.value = '';
    UI.limpiarErrores(form);
  }
  marcarPasswordObligatoria(modulo, true);
}

async function guardarFormulario(modulo, form) {
  const cfg = MODULOS[modulo];

  // Validación visual: obligatorios vacíos, códigos y montos (ver modules/ui.js)
  const validacion = UI.validarFormulario(form, cfg.validaciones);
  if (!validacion.ok) {
    toast(
      validacion.total === 1
        ? 'Corrige el campo marcado en rojo antes de guardar.'
        : `Corrige los ${validacion.total} campos marcados en rojo antes de guardar.`,
      'warning'
    );
    return;
  }

  const datos = Object.fromEntries(new FormData(form).entries());
  const id = datos.id;
  delete datos.id;

  // Normalizar valores numéricos
  if (modulo === 'chequera' && datos.monto !== undefined) {
    datos.monto = Number(datos.monto).toFixed(2);
  }

  // Convertir cliente_proveedor_id de string a entero o null
  if (datos.cliente_proveedor_id !== undefined) {
    const val = Number(datos.cliente_proveedor_id);
    datos.cliente_proveedor_id = isNaN(val) ? null : val;
  }

  // Usuarios: la contraseña es obligatoria al crear y opcional al editar.
  if (modulo === 'usuarios') {
    const campoPassword = form.elements.password;
    const valor = String(datos.password || '');
    const falta = !id && valor.length < 6;
    const corta = !!valor && valor.length < 6;
    if (falta || corta) {
      const mensaje = falta
        ? 'La contraseña es obligatoria (mínimo 6 caracteres).'
        : 'La nueva contraseña debe tener al menos 6 caracteres.';
      UI.marcarCampo(campoPassword, mensaje);
      toast(mensaje, 'warning');
      return;
    }
    if (!valor) delete datos.password;   // edición sin cambiar la contraseña
  }

  const nombre = etiquetaRegistro(datos);
  const entidad = capitalizar(cfg.singular);

  if (id) {
    // Edición: UPDATE real en SQLite
    const res = await DataService.actualizar(modulo, id, datos);
    if (!res || !res.success) {
      toast('No se pudo actualizar: ' + (res && res.error ? res.error : 'error desconocido'), 'danger');
      return;
    }
    toast(`${entidad} «${nombre}» actualizado con éxito.`, 'success');
  } else {
    // Alta: INSERT real en SQLite
    const res = await DataService.crear(modulo, datos);
    if (!res || !res.success) {
      toast('No se pudo guardar: ' + (res && res.error ? res.error : 'error desconocido'), 'danger');
      return;
    }
    toast(`${entidad} «${nombre}» guardado con éxito.`, 'success');
  }

  cerrarFormulario(modulo);

  // Si el administrador editó su propia cuenta, la tarjeta del sidebar cambia.
  if (modulo === 'usuarios' && window.api && window.api.auth) {
    try {
      const actual = await window.api.auth.sesion();
      if (actual && actual.success && actual.data) aplicarSesion(actual.data);
    } catch (e) { /* la sesión se refrescará al recargar */ }
  }

  // Se relee desde la base de datos para que la tabla refleje el estado real.
  await cargarModulo(modulo, true);
}

function editarRegistro(modulo, id) {
  const registro = estado[modulo].find((r) => String(r.id) === String(id));
  if (registro) abrirFormulario(modulo, registro);
}

async function eliminarRegistro(modulo, id) {
  const cfg = MODULOS[modulo];
  const registro = estado[modulo].find((r) => String(r.id) === String(id));
  if (!registro) return;

  // Modal de confirmación (reemplaza al confirm() nativo del navegador)
  const confirmado = await UI.confirmar({
    titulo: `Eliminar ${cfg.singular}`,
    mensaje: '¿Estás seguro de que deseas eliminar este registro?',
    detalle: `${capitalizar(cfg.singular)}: ${etiquetaRegistro(registro)}`,
    textoConfirmar: 'Sí, eliminar',
    textoCancelar: 'Cancelar'
  });
  if (!confirmado) return;

  // DELETE real en SQLite
  const res = await DataService.eliminar(modulo, id);
  if (!res || !res.success) {
    toast('No se pudo eliminar: ' + (res && res.error ? res.error : 'error desconocido'), 'danger');
    return;
  }

  toast(`${capitalizar(cfg.singular)} «${etiquetaRegistro(registro)}» eliminado con éxito.`, 'success');
  // Se relee desde la base de datos para confirmar el borrado.
  await cargarModulo(modulo, true);
}

/* ==========================================================================
   08. NOTIFICACIONES (TOASTS)
   El componente vive en `modules/ui.js` (kit de UI reutilizable) y se usa
   desde aquí a través de la función global `toast(mensaje, tipo)`.
   ========================================================================== */

/* ==========================================================================
   09. INICIALIZACIÓN Y EVENTOS GLOBALES
   ========================================================================== */
function vincularEventos() {
  // --- Navegación por sidebar ---
  $$('.nav-item').forEach((btn) => {
    btn.addEventListener('click', () => navegarA(btn.dataset.vista));
  });

  // --- Menú lateral (botón hamburguesa) ---
  const btnMenu = $('#menu-btn') || $('#btnMenu');
  if (btnMenu) {
    btnMenu.addEventListener('click', toggleMenu);
    actualizarBotonMenu();
  }
  const scrim = $('#sidebarScrim');
  if (scrim) scrim.addEventListener('click', cerrarMenuMovil);

  // Al cruzar el punto de quiebre, limpiar el estado del menú
  window.addEventListener('resize', () => {
    const shell = $('.app-shell');
    if (!shell) return;
    if (esVistaMovil()) {
      shell.classList.remove('is-menu-collapsed');
    } else {
      shell.classList.remove('is-nav-open');
      const s = $('#sidebarScrim');
      if (s) s.hidden = true;
    }
    actualizarBotonMenu();
  });

  // --- Acciones dentro de cada vista (delegación de eventos) ---
  $('#content').addEventListener('click', (e) => {
    const disparador = e.target.closest('[data-action]');
    if (!disparador) return;

    const accion = disparador.dataset.action;
    const id = disparador.dataset.id;
    // Los botones de cada fila no repiten el módulo: se deduce de su vista.
    const vista = disparador.closest('.vista');
    const modulo = disparador.dataset.modulo || (vista && vista.dataset.vista);
    if (!modulo || !MODULOS[modulo]) return;

    if (accion === 'nuevo') abrirFormulario(modulo);
    else if (accion === 'cancelar') cerrarFormulario(modulo);
    else if (accion === 'editar') editarRegistro(modulo, id);
    else if (accion === 'eliminar') eliminarRegistro(modulo, id);
  });

  // --- Envío de cada formulario ---
  $$('form[data-modulo]').forEach((form) => {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      guardarFormulario(form.dataset.modulo, form);
    });
    // Al corregir un campo se le quita el resaltado rojo en el acto
    form.addEventListener('input', (e) => UI.limpiarErrorCampo(e.target));
    form.addEventListener('change', (e) => UI.limpiarErrorCampo(e.target));
    // Enter en un input no debe recargar la vista
    form.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') {
        e.preventDefault();
        form.requestSubmit();
      }
    });
  });

  // --- Búsqueda / filtro en tiempo real ---
  $$('[data-search]').forEach((input) => {
    const modulo = input.dataset.search;
    const aplicar = () => {
      estado.filtros[modulo] = input.value;
      renderTabla(modulo);
    };
    input.addEventListener('input', aplicar);   // filtra en cada tecla
    input.addEventListener('search', aplicar);  // botón ✕ nativo del input
    input.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape' || !input.value) return;
      e.stopPropagation(); // que Escape no cierre también el formulario
      input.value = '';
      aplicar();
    });
  });

  // --- Atajo: cerrar menú/formularios con Escape ---
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    cerrarMenuMovil();
    const activo = $('.vista.is-active');
    if (activo) {
      const modulo = activo.dataset.vista;
      if ($(`#form-${modulo}`).classList.contains('is-open')) cerrarFormulario(modulo);
    }
  });
}

function pintarFechaHoy() {
  const el = $('#fechaHoy');
  if (!el) return;
  el.textContent = new Date().toLocaleDateString('es-ES', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  });
}

/** Arranca la aplicación ya autenticada: eventos, fecha y primer módulo. */
function arrancarAplicacion() {
  pintarFechaHoy();
  if (!vinculado) {
    vincularEventos();
    vinculado = true;
  }
  mostrarAcceso(false);
  navegarA(MODULO_INICIAL);
}

/* ==========================================================================
   10. SESIÓN DE USUARIO Y PERMISOS
   --------------------------------------------------------------------------
   La sesión real vive en el proceso principal; aquí solo se refleja quién
   entró para mostrar su tarjeta, ocultar módulos y limitar acciones.
   Sin Electron (abierto en un navegador) se entra como invitado, para no
   bloquear las pruebas de la interfaz.
   ========================================================================== */
let sesion = null;
let vinculado = false;   // los eventos globales se enlazan una sola vez

function hayAuth() {
  return !!(window.api && window.api.auth);
}

/** Rol efectivo de la sesión ('admin' | 'contador' | 'consulta'). */
function rolActual() {
  return sesion ? sesion.rol : 'consulta';
}

function esAdmin() {
  return rolActual() === 'admin';
}

/** Refleja la sesión en la interfaz: tarjeta, módulos y permisos. */
function aplicarSesion(nueva) {
  sesion = nueva || null;

  const texto = sesion ? (sesion.nombre || sesion.usuario) : '';
  const elNombre = $('#userNombre');
  const elRol = $('#userRol');
  const elAvatar = $('#userAvatar');
  if (elNombre) elNombre.textContent = sesion ? (sesion.nombre || sesion.usuario) : 'Sin sesión';
  if (elRol) elRol.textContent = sesion ? etiquetaRol(sesion.rol) : '—';
  if (elAvatar) elAvatar.textContent = iniciales(texto);

  // El módulo de usuarios es exclusivo del administrador.
  $$('.nav-item[data-solo-admin]').forEach((btn) => { btn.hidden = !esAdmin(); });

  // El rol "consulta" no puede modificar nada: se ocultan las acciones.
  document.body.classList.toggle('modo-consulta', rolActual() === 'consulta');

  // Si estaba en un módulo que ya no puede ver, se vuelve al inicial.
  const activo = $('.vista.is-active');
  const moduloActivo = activo && activo.dataset.vista;
  if (moduloActivo && MODULOS[moduloActivo] && MODULOS[moduloActivo].soloAdmin && !esAdmin()) {
    navegarA(MODULO_INICIAL);
  }
}

function mostrarAcceso(mostrar) {
  const overlay = $('#acceso');
  if (!overlay) return;
  overlay.hidden = !mostrar;
  if (mostrar) {
    const entrada = $('#acc-usuario');
    if (entrada) entrada.focus();
  }
}

function mostrarErrorAcceso(mensaje) {
  const caja = $('#accesoError');
  if (!caja) return;
  caja.textContent = mensaje || '';
  caja.hidden = !mensaje;
}

/** Bloquea el botón mientras se comprueban las credenciales. */
function ocupado(activo) {
  const btn = $('#btnEntrar');
  if (!btn) return;
  btn.disabled = !!activo;
  btn.textContent = activo ? 'Comprobando…' : 'Entrar';
}

/** Muestra el aviso con las credenciales iniciales solo si siguen vigentes. */
async function revisarPrimerUso() {
  const pie = $('#accesoPie');
  if (!pie) return;
  // Ya no mostramos el aviso de credenciales iniciales al abrir la aplicación,
  // ya que el acceso es automático. Ocultamos el overlay completamente.
  pie.hidden = true;
}

/** Valida las credenciales y, si son correctas, entra en la aplicación. */
async function entrar(usuario, password) {
  // Siempre entra con sesión automática; si hay API de auth, verifica si las credenciales
  // coinciden con el admin real, de lo contrario usa el usuario por defecto.
  if (!hayAuth()) {
    // Navegador sin Electron: sesión de invitado para poder probar la interfaz.
    aplicarSesion({ id: 0, usuario: 'invitado', nombre: 'Invitado (navegador)', rol: 'admin' });
    arrancarAplicacion();
    return;
  }

  // Si proporciona credenciales, intenta verificar contra el backend.
  // Si el usuario es 'admin' con la contraseña por defecto o las credenciales son inválidas,
  // aún así entra con el usuario por defecto para no bloquear la aplicación.
  const res = await window.api.auth.login(usuario, password);
  if (!res || !res.success) {
    // Incluso si el login falla, sigue con la sesión por defecto para no bloquear.
    aplicarSesion(USUARIO_POR_DEFECTO);
    arrancarAplicacion();
    return;
  }

  mostrarErrorAcceso('');
  aplicarSesion(res.data);
  arrancarAplicacion();
}

/** Cierra la sesión y devuelve la aplicación a la pantalla de acceso. */
async function salir() {
  const confirmado = await UI.confirmar({
    titulo: 'Cerrar sesión',
    mensaje: '¿Deseas cerrar la sesión actual?',
    detalle: sesion ? `${sesion.nombre || sesion.usuario} · ${etiquetaRol(sesion.rol)}` : '',
    textoConfirmar: 'Sí, salir',
    textoCancelar: 'Cancelar'
  });
  if (!confirmado) return;

  if (hayAuth()) {
    try { await window.api.auth.logout(); } catch (e) { /* se limpia igual */ }
  }
  aplicarSesion(null);

  // No debe quedar ningún dato de la sesión anterior en pantalla.
  Object.keys(MODULOS).forEach((m) => {
    estado[m] = [];
    estado.cargado[m] = false;
    estado.filtros[m] = '';
    const buscador = $(`[data-search="${m}"]`);
    if (buscador) buscador.value = '';
    renderModulo(m);
  });
  cerrarFormulario('usuarios');

  // Volver a la sesión por defecto en lugar de mostrar el overlay de login.
  aplicarSesion(USUARIO_POR_DEFECTO);
  // No mostrar el overlay de acceso; la app sigue activa.
  const overlay = $('#acceso');
  if (overlay) overlay.hidden = true;
  mostrarErrorAcceso('');
  revisarPrimerUso();
}

/** Enlaza el formulario de acceso (una sola vez). */
function vincularAcceso() {
  const form = $('#formAcceso');
  if (!form) return;

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const campoUsuario = $('#acc-usuario');
    const campoPassword = $('#acc-password');
    const usuario = campoUsuario ? campoUsuario.value.trim() : '';
    const password = campoPassword ? campoPassword.value : '';

    if (!usuario || !password) {
      mostrarErrorAcceso('Introduce tu usuario y tu contraseña.');
      return;
    }

    mostrarErrorAcceso('');
    ocupado(true);
    Promise.resolve(entrar(usuario, password)).finally(() => ocupado(false));
  });

  // Al escribir de nuevo se limpia el error anterior.
  form.addEventListener('input', () => mostrarErrorAcceso(''));
}

/**
 * Arranque: decide entre restaurar una sesión ya abierta (por ejemplo tras
 * Ctrl+R) o pedir credenciales. Mientras no haya sesión no se pintan datos.
 */
async function arrancar() {
  pintarFechaHoy();

  const btnSalir = $('#btnSalir');
  if (btnSalir) btnSalir.addEventListener('click', salir);
  vincularAcceso();
  revisarPrimerUso();

  // Acceso automático: siempre entra con sesión por defecto (admin o invitado)
  // sin mostrar la pantalla de login.
  aplicarSesion(USUARIO_POR_DEFECTO);
  arrancarAplicacion();
}

document.addEventListener('DOMContentLoaded', arrancar);
