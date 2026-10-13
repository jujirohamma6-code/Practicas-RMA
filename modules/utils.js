/**
 * Utilidades comunes para los módulos de Mónica Gestión
 */

/**
 * Navega a otra página usando la API expuesta por preload
 * @param {string} pagina - Nombre del archivo HTML a cargar
 */
function navegarA(pagina) {
    if (window.api && typeof window.api.navegarA === 'function') {
        window.api.navegarA(pagina);
    }
}

/**
 * Muestra un mensaje de alerta
 * @param {string} mensaje - Mensaje a mostrar
 */
function mostrarAlerta(mensaje) {
    alert(mensaje);
}

/**
 * Valida que un elemento exista en el DOM
 * @param {string} id - ID del elemento
 * @returns {HTMLElement|null}
 */
function obtenerElemento(id) {
    return document.getElementById(id);
}

/**
 * Agrega un evento de click a un elemento si existe
 * @param {string} id - ID del elemento
 * @param {Function} callback - Función a ejecutar al hacer click
 */
function agregarEventoClick(id, callback) {
    const elemento = obtenerElemento(id);
    if (elemento) {
        elemento.addEventListener('click', callback);
    }
}

/**
 * Formatea una fecha al formato DD/MM/YYYY
 * @param {Date} fecha - Fecha a formatear
 * @returns {string}
 */
function formatearFecha(fecha) {
    const dia = String(fecha.getDate()).padStart(2, '0');
    const mes = String(fecha.getMonth() + 1).padStart(2, '0');
    const anio = fecha.getFullYear();
    return `${dia}/${mes}/${anio}`;
}
