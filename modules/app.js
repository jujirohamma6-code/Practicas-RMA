/* ==========================================================================
   MÓNICA GESTIÓN · LÓGICA DE INTERFAZ (Bloque 1)
   --------------------------------------------------------------------------
   Arquitectura del archivo:
     01. Configuración de módulos
     02. Utilidades de formato y DOM
     03. Capa de datos (API Electron + respaldo local)
     04. Estado de la aplicación
     05. Navegación entre módulos
     06. Render de estadísticas, tablas y acciones
     07. Formularios (abrir / validar / guardar / cancelar)
     08. Notificaciones (toasts)
     09. Inicialización y eventos globales
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
      { key: 'descripcion', label: 'Descripción / Nombre' }
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
      { key: 'beneficiario', label: 'Beneficiario / Concepto' },
      { key: 'monto', label: 'Monto', align: 'num', render: (r) => formatearMonto(r.monto) },
      { key: 'estado', label: 'Estado', render: (r) => badgeEstadoChequera(r.estado) }
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
    stats: (rows) => {
      const clientes = rows.filter((r) => /cliente/i.test(r.tipo || '')).length;
      const proveedores = rows.filter((r) => /proveedor/i.test(r.tipo || '')).length;
      return [
        { label: 'Contactos', value: rows.length },
        { label: 'Clientes', value: clientes },
        { label: 'Proveedores', value: proveedores }
      ];
    }
  }
};

const MODULO_INICIAL = 'contabilidad';

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
        { id: 1, nro_cheque: 'CHK-001', fecha: '2026-10-12', beneficiario: 'Pago de Servicios Básicos', monto: '250.00', estado: 'Cobrado' },
        { id: 2, nro_cheque: 'CHK-002', fecha: '2026-10-13', beneficiario: 'Distribuidora Central', monto: '1840.50', estado: 'Pendiente' }
      ],
      clientes: [
        { id: 1, codigo: 'CLI-001', nombre_razon: 'Comercial San José S.A.', tipo: 'Cliente', telefono: '+505 8888-8888', estado: 'Activo' },
        { id: 2, codigo: 'PROV-001', nombre_razon: 'Distribuidora Central', tipo: 'Proveedor', telefono: '+505 2222-2222', estado: 'Activo' }
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
  }
};

const DataService = {
  usaBackend() {
    return !!(window.api && typeof window.api.consultarDatos === 'function');
  },

  /** Devuelve el listado completo de un módulo. */
  async listar(modulo) {
    const cfg = MODULOS[modulo];
    if (this.usaBackend()) {
      try {
        const res = await window.api.consultarDatos(cfg.backend, {});
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

  /** Persiste un registro nuevo. */
  async crear(modulo, datos) {
    const cfg = MODULOS[modulo];
    if (this.usaBackend()) {
      try {
        const res = await window.api.guardarRegistro(cfg.backend, 'crear', datos);
        return res || { success: false, error: 'Sin respuesta del backend' };
      } catch (e) {
        return { success: false, error: e.message };
      }
    }
    return MockDB.crear(modulo, datos);
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
  cargado: { contabilidad: false, chequera: false, clientes: false },
  filtros: { contabilidad: '', chequera: '', clientes: '' }
};

/* ==========================================================================
   05. NAVEGACIÓN ENTRE MÓDULOS
   ========================================================================== */
function navegarA(modulo) {
  if (!MODULOS[modulo]) return;
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
async function cargarModulo(modulo) {
  if (estado.cargado[modulo]) {
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
  const q = estado.filtros[modulo].trim().toLowerCase();
  const filas = estado[modulo];
  if (!q) return filas;
  return filas.filter((r) => Object.values(r).some((v) => String(v ?? '').toLowerCase().includes(q)));
}

function renderTabla(modulo) {
  const cfg = MODULOS[modulo];
  const tbody = $(`[data-tbody="${modulo}"]`);
  if (!tbody) return;

  const filas = filasVisibles(modulo);
  const contador = $(`[data-count="${modulo}"]`);
  if (contador) {
    contador.textContent = filas.length === 1 ? '1 registro' : `${filas.length} registros`;
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

  if (registro) {
    Object.entries(registro).forEach(([clave, valor]) => {
      const campo = form.elements[clave];
      if (campo) campo.value = valor ?? '';
    });
    form.querySelector('[data-form-title]').textContent = cfg.editarTitulo;
  } else {
    // Valores por defecto para registros nuevos
    if (form.elements.fecha) form.elements.fecha.value = hoyISO();
    if (form.elements.libro) form.elements.libro.value = 'DIA';
    if (form.elements.estado) form.elements.estado.value = form.elements.estado.options[0].value;
    if (form.elements.tipo) form.elements.tipo.value = 'Cliente';
    form.querySelector('[data-form-title]').textContent = cfg.nuevoTitulo;
  }

  panel.classList.add('is-open');
  const primero = form.querySelector('input:not([type="hidden"]), select, textarea');
  if (primero) primero.focus();
}

function cerrarFormulario(modulo) {
  const panel = $(`#form-${modulo}`);
  const form = $(`form[data-modulo="${modulo}"]`);
  if (panel) panel.classList.remove('is-open');
  if (form) {
    form.reset();
    form.elements.id.value = '';
  }
}

async function guardarFormulario(modulo, form) {
  // Validación nativa de campos obligatorios
  if (!form.checkValidity()) {
    form.reportValidity();
    toast('Completa los campos obligatorios antes de guardar.', 'warning');
    return;
  }

  const datos = Object.fromEntries(new FormData(form).entries());
  const id = datos.id;
  delete datos.id;

  // Normalizar valores numéricos
  if (modulo === 'chequera' && datos.monto !== undefined) {
    datos.monto = Number(datos.monto).toFixed(2);
  }

  if (id) {
    // Edición: se actualiza en memoria (el backend actual solo expone crear/consultar)
    const idx = estado[modulo].findIndex((r) => String(r.id) === String(id));
    if (idx > -1) estado[modulo][idx] = { ...estado[modulo][idx], ...datos };
    toast('Registro actualizado correctamente.', 'success');
  } else {
    const res = await DataService.crear(modulo, datos);
    if (res && res.success) {
      estado[modulo].unshift({ id: res.id ?? Date.now(), ...datos });
      toast('Registro guardado correctamente.', 'success');
    } else {
      toast('No se pudo guardar: ' + (res && res.error ? res.error : 'error desconocido'), 'danger');
      return;
    }
  }

  cerrarFormulario(modulo);
  renderModulo(modulo);
}

function editarRegistro(modulo, id) {
  const registro = estado[modulo].find((r) => String(r.id) === String(id));
  if (registro) abrirFormulario(modulo, registro);
}

function eliminarRegistro(modulo, id) {
  const registro = estado[modulo].find((r) => String(r.id) === String(id));
  const etiqueta = registro
    ? (registro.nro_asiento || registro.nro_cheque || registro.codigo || registro.nombre_razon || '')
    : '';

  const ok = window.confirm(`¿Eliminar ${MODULOS[modulo].singular} "${etiqueta}"?\nEsta acción no se puede deshacer.`);
  if (!ok) return;

  estado[modulo] = estado[modulo].filter((r) => String(r.id) !== String(id));
  renderModulo(modulo);
  toast('Registro eliminado.', 'success');
}

/* ==========================================================================
   08. NOTIFICACIONES (TOASTS)
   ========================================================================== */
const ICONOS_TOAST = {
  success: '<path d="M20 6L9 17l-5-5"/>',
  warning: '<path d="M12 9v4"/><path d="M12 17h.01"/><circle cx="12" cy="12" r="9"/>',
  danger: '<path d="M18 6L6 18M6 6l12 12"/>',
  info: '<path d="M12 16v-5"/><path d="M12 8h.01"/><circle cx="12" cy="12" r="9"/>'
};

function toast(mensaje, tipo = 'info') {
  const stack = $('#toastStack');
  if (!stack) return;

  const el = document.createElement('div');
  el.className = `toast toast--${tipo}`;
  el.innerHTML = `
    <span class="toast__icon">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        ${ICONOS_TOAST[tipo] || ICONOS_TOAST.info}
      </svg>
    </span>
    <span class="toast__msg">${esc(mensaje)}</span>`;

  stack.appendChild(el);

  setTimeout(() => {
    el.classList.add('is-out');
    setTimeout(() => el.remove(), 300);
  }, 3200);
}

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
    const modulo = disparador.dataset.modulo;
    const id = disparador.dataset.id;

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
    // Enter en un input no debe recargar la vista
    form.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') {
        e.preventDefault();
        form.requestSubmit();
      }
    });
  });

  // --- Búsqueda por módulo ---
  $$('[data-search]').forEach((input) => {
    input.addEventListener('input', () => {
      estado.filtros[input.dataset.search] = input.value;
      renderTabla(input.dataset.search);
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

function iniciar() {
  pintarFechaHoy();
  vincularEventos();
  navegarA(MODULO_INICIAL);
}

document.addEventListener('DOMContentLoaded', iniciar);
