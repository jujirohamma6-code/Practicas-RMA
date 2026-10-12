const { ipcRenderer } = require('electron');

document.addEventListener('DOMContentLoaded', () => {
    const modulos = [
        { id: 'btn-contabilidad', url: 'contabilidad.html' }, // <-- Debe ser contabilidad.html
        { id: 'btn-chequera',     url: 'monica-chequera.html' },
        { id: 'btn-clientes',     url: 'monica-clientes.html' }
    ];

    modulos.forEach(({ id, url }) => {
        const boton = document.getElementById(id);
        if (boton) {
            boton.addEventListener('click', () => {
                ipcRenderer.send('navegar-a', url);
            });
        }
    });
});