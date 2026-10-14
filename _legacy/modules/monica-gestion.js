/**
 * Menú principal · Navegación entre módulos.
 *
 * Las rutas se delegan al helper navegarA() (definido en utils.js):
 *   - En Electron, el proceso principal resuelve el archivo dentro de src/,
 *     así que no hay rutas relativas frágiles repartidas por el código.
 *   - En un navegador normal, navegarA() hace la navegación relativa.
 *
 * Los nombres coinciden con los archivos de la carpeta src/.
 */
const RUTAS_MODULOS = {
    'btn-contabilidad': 'contabilidad.html',        // Módulo Contabilidad
    'btn-chequera': 'monica-chequera.html',         // Módulo Cuentas Corrientes / Chequera
    'btn-clientes': 'monica-clientes.html'          // Módulo Clientes y Proveedores
};

function irAModulo(pagina) {
    if (typeof navegarA === 'function') {
        navegarA(pagina);
    } else {
        window.location.href = pagina;
    }
}

Object.entries(RUTAS_MODULOS).forEach(([id, pagina]) => {
    const boton = document.getElementById(id);
    if (boton) {
        boton.addEventListener('click', () => irAModulo(pagina));
    }
});
