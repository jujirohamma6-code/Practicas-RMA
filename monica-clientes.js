document.addEventListener('DOMContentLoaded', async () => {
    // Botón de retorno al menú principal
    const btnMenu = document.getElementById('btn-menu');
    if (btnMenu) {
        btnMenu.addEventListener('click', () => {
            window.api.navegarA('monica-gestion.html');
        });
    }

    // Botones de acción principales por módulo
    const btnAccionPrincipal = document.getElementById('btn-crear-contacto');
    if (btnAccionPrincipal) {
        btnAccionPrincipal.addEventListener('click', async () => {
            console.log("Ejecutando acción principal del módulo clientes...");
            const resultado = await window.api.guardarRegistro('clientes', {
                codigo: `CLI-${Date.now()}`,
                nombre_razon: 'Nuevo contacto',
                tipo: 'Cliente',
                telefono: '',
                estado: 'Activo'
            });
            console.log(resultado);
            await cargarClientes();
        });
    }

    await cargarClientes();
});

/**
 * Carga los clientes y proveedores en la tabla
 */
async function cargarClientes() {
    const respuesta = await window.api.consultarDatos('clientes', {});
    const contactos = respuesta.success ? respuesta.data : [];

    const tabla = document.getElementById('tabla-clientes');
    if (!tabla) return;

    tabla.innerHTML = '';

    if (contactos.length === 0) {
        tabla.innerHTML = '<tr><td colspan="5" style="text-align: center;">No hay registros</td></tr>';
        return;
    }

    contactos.forEach(contacto => {
        const fila = document.createElement('tr');
        fila.innerHTML = `
            <td>${contacto.codigo}</td>
            <td>${contacto.nombre_razon}</td>
            <td>${contacto.tipo}</td>
            <td>${contacto.telefono}</td>
            <td>${contacto.estado}</td>
        `;
        tabla.appendChild(fila);
    });
}