/* ==========================================================================
   MÓNICA GESTIÓN · KIT DE UI (Bloque 3)
   --------------------------------------------------------------------------
   Componentes reutilizables e independientes (sin frameworks). Se cargan
   ANTES de app.js y quedan disponibles globalmente:

     01. Notificaciones flotantes (toasts) — esquina inferior derecha.
     02. Modal de confirmación — reemplaza a window.confirm() y devuelve
         una promesa (true = confirmar, false = cancelar).
     03. Validación visual de formularios — resalta en rojo los campos con
         error y muestra el motivo debajo de cada uno.

   API pública:
     toast(mensaje, tipo)                     // atajo global
     UI.toast(mensaje, tipo, duracion)
     UI.confirmar({ titulo, mensaje, detalle, textoConfirmar, textoCancelar })
     UI.validarFormulario(form, reglas)       // -> { ok, total, primerCampo }
     UI.limpiarErrorCampo(elemento)
     UI.limpiarErrores(form)
   ========================================================================== */
'use strict';

const UI = {
  /* ========================================================================
     01. NOTIFICACIONES (TOASTS)
     ======================================================================== */
  ICONOS: {
    success: '<path d="M20 6L9 17l-5-5"/>',
    warning: '<path d="M12 9v4"/><path d="M12 17h.01"/><circle cx="12" cy="12" r="9"/>',
    danger: '<path d="M18 6L6 18M6 6l12 12"/>',
    info: '<path d="M12 16v-5"/><path d="M12 8h.01"/><circle cx="12" cy="12" r="9"/>'
  },

  /**
   * Muestra una notificación flotante.
   * @param {string} mensaje  Texto a comunicar.
   * @param {'success'|'warning'|'danger'|'info'} tipo  Estilo semántico.
   * @param {number} duracion Milisegundos en pantalla (0 = no se cierra sola).
   * @returns {HTMLElement|null} El nodo creado, o null si no hay contenedor.
   */
  toast(mensaje, tipo = 'info', duracion = 3400) {
    const stack = document.getElementById('toastStack');
    if (!stack) return null;

    const el = document.createElement('div');
    el.className = `toast toast--${tipo}`;
    el.setAttribute('role', tipo === 'danger' ? 'alert' : 'status');

    // Icono según el tipo. El mensaje se inserta como texto plano (seguro ante HTML).
    const icono = document.createElement('span');
    icono.className = 'toast__icon';
    icono.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${this.ICONOS[tipo] || this.ICONOS.info}</svg>`;

    const texto = document.createElement('span');
    texto.className = 'toast__msg';
    texto.textContent = mensaje;

    const cerrar = document.createElement('button');
    cerrar.type = 'button';
    cerrar.className = 'toast__close';
    cerrar.setAttribute('aria-label', 'Cerrar aviso');
    cerrar.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
    cerrar.addEventListener('click', () => this.descartar(el));

    el.append(icono, texto, cerrar);
    stack.appendChild(el);

    if (duracion > 0) el._temporizador = setTimeout(() => this.descartar(el), duracion);
    return el;
  },

  /** Cierra una notificación con su animación de salida. */
  descartar(el) {
    if (!el || el.classList.contains('is-out')) return;
    clearTimeout(el._temporizador);
    el.classList.add('is-out');
    setTimeout(() => el.remove(), 300);
  },

  /* ========================================================================
     02. MODAL DE CONFIRMACIÓN
     ======================================================================== */
  /**
   * Abre el modal de confirmación.
   * @returns {Promise<boolean>} true si el usuario confirma, false si cancela.
   */
  confirmar({ titulo = 'Confirmar acción', mensaje = '', detalle = '', textoConfirmar = 'Confirmar', textoCancelar = 'Cancelar' } = {}) {
    const dlg = document.getElementById('modalConfirm');

    // Respaldo: si el modal no está en el DOM, se usa el confirm() nativo.
    if (!dlg || typeof dlg.showModal !== 'function') {
      return Promise.resolve(window.confirm(mensaje || titulo));
    }

    const buscar = (sel) => dlg.querySelector(sel);
    buscar('[data-modal-title]').textContent = titulo;
    buscar('[data-modal-text]').textContent = mensaje;

    const detalleEl = buscar('[data-modal-detail]');
    detalleEl.textContent = detalle || '';
    detalleEl.hidden = !detalle;

    const btnOk = buscar('[data-modal-confirmar]');
    const btnNo = buscar('[data-modal-cancelar]');
    btnOk.textContent = textoConfirmar;
    btnNo.textContent = textoCancelar;

    if (dlg.open) dlg.close('reemplazado');

    return new Promise((resolve) => {
      let resuelto = false;

      const terminar = (valor) => {
        if (resuelto) return;
        resuelto = true;
        btnOk.removeEventListener('click', alConfirmar);
        btnNo.removeEventListener('click', alCancelar);
        dlg.removeEventListener('close', alCerrar);
        if (dlg.open) dlg.close(valor ? 'confirmado' : 'cancelado');
        resolve(valor);
      };
      const alConfirmar = () => terminar(true);
      const alCancelar = () => terminar(false);
      const alCerrar = () => terminar(false); // Escape o cierre externo

      btnOk.addEventListener('click', alConfirmar);
      btnNo.addEventListener('click', alCancelar);
      dlg.addEventListener('close', alCerrar);

      dlg.showModal();
      btnNo.focus(); // El foco arranca en la opción segura
    });
  },

  /* ========================================================================
     03. VALIDACIÓN VISUAL DE FORMULARIOS
     ------------------------------------------------------------------------
     Reglas soportadas (se declaran por módulo en app.js):
       { campo, requerido, minLongitud, noNegativo, patron, mensaje }
     Además, todo elemento con el atributo `required` del HTML se valida
     como obligatorio aunque no tenga una regla declarada.
     ======================================================================== */

  /**
   * Valida un formulario, pinta los errores y devuelve el resultado.
   * @returns {{ok:boolean, total:number, primerCampo:HTMLElement|null}}
   */
  validarFormulario(form, reglas = []) {
    this.limpiarErrores(form);
    const errores = new Map(); // elemento -> mensaje

    // 1) Reglas declaradas por el módulo (mensajes específicos)
    for (const regla of reglas) {
      const campo = form.elements[regla.campo];
      if (!campo) continue;

      const valor = String(campo.value ?? '').trim();
      const esObligatorio = regla.requerido || regla.noNegativo || regla.minLongitud;

      if (valor === '') {
        if (esObligatorio) errores.set(campo, regla.mensaje || 'Este campo es obligatorio.');
        continue;
      }

      if (regla.minLongitud && valor.length < regla.minLongitud) {
        errores.set(campo, regla.mensaje || `Debe tener al menos ${regla.minLongitud} caracteres.`);
        continue;
      }

      if (regla.noNegativo) {
        const n = Number(valor);
        if (!isFinite(n) || n < 0) {
          errores.set(campo, regla.mensaje || 'El valor debe ser un número igual o mayor que 0.');
          continue;
        }
      }

      if (regla.patron && !regla.patron.test(valor)) {
        errores.set(campo, regla.mensaje || 'El formato ingresado no es válido.');
      }
    }

    // 2) Cualquier otro campo con required vacío
    form.querySelectorAll('[required]').forEach((campo) => {
      if (errores.has(campo)) return;
      if (String(campo.value ?? '').trim() === '') errores.set(campo, 'Este campo es obligatorio.');
    });

    // 3) Pintar los errores detectados
    errores.forEach((mensaje, campo) => this.marcarCampo(campo, mensaje));

    const primerCampo = errores.keys().next().value || null;
    if (primerCampo && typeof primerCampo.focus === 'function') primerCampo.focus();

    return { ok: errores.size === 0, total: errores.size, primerCampo };
  },

  /** Pinta un campo como inválido y escribe el motivo debajo. */
  marcarCampo(elemento, mensaje) {
    const field = elemento.closest('.field') || elemento.parentElement;
    if (!field) return;

    field.classList.add('is-invalid');

    let aviso = field.querySelector('.field__error');
    if (!aviso) {
      aviso = document.createElement('p');
      aviso.className = 'field__error';
      field.appendChild(aviso);
    }

    aviso.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 8v4M12 16h.01"/></svg>';
    aviso.appendChild(document.createTextNode(mensaje));

    elemento.setAttribute('aria-invalid', 'true');
  },

  /** Quita el estado de error de un campo (al corregirlo). */
  limpiarErrorCampo(elemento) {
    const field = elemento && elemento.closest ? elemento.closest('.field') : null;
    if (!field) return;

    field.classList.remove('is-invalid');
    const aviso = field.querySelector('.field__error');
    if (aviso) aviso.remove();
    elemento.removeAttribute('aria-invalid');
  },

  /** Quita todos los errores de un formulario. */
  limpiarErrores(form) {
    form.querySelectorAll('.field.is-invalid').forEach((field) => field.classList.remove('is-invalid'));
    form.querySelectorAll('.field__error').forEach((aviso) => aviso.remove());
    form.querySelectorAll('[aria-invalid]').forEach((el) => el.removeAttribute('aria-invalid'));
  }
};

/**
 * Atajo global: las vistas llaman directamente a toast(...).
 * @param {string} mensaje
 * @param {'success'|'warning'|'danger'|'info'} tipo
 */
function toast(mensaje, tipo = 'info') {
  return UI.toast(mensaje, tipo);
}