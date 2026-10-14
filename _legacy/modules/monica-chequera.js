document.addEventListener('DOMContentLoaded', async () => {
    // Botón de retorno al menú principal
    const btnMenu = document.getElementById('btn-menu');
    if (btnMenu) {
        btnMenu.addEventListener('click', () => {
            window.api.navegarA('monica-gestion.html');
        });
    }

    // Botones de acción principales por módulo
    const btnAccionPrincipal = document.getElementById('btn-crear-cheque');
    if (btnAccionPrincipal) {
        btnAccionPrincipal.addEventListener('click', async () => {
            console.log("Ejecutando acción principal del módulo chequera...");
            const resultado = await window.api.guardarRegistro('chequera', {
                nro_cheque: `CHK-${Date.now()}`,
                fecha: new Date().toLocaleDateString('es-ES'),
                beneficiario: 'Beneficiario nuevo',
                monto: '0.00',
                estado: 'Emitido'
            });
            console.log(resultado);
            await cargarMovimientosChequera();
        });
    }

    await cargarMovimientosChequera();
});

/**
 * Carga los movimientos de chequera en la tabla
 */
async function cargarMovimientosChequera() {
    const respuesta = await window.api.consultarDatos('chequera', {});
    const movimientos = respuesta.success ? respuesta.data : [];

    const tabla = document.getElementById('tabla-chequera');
    if (!tabla) return;

    tabla.innerHTML = '';

    if (movimientos.length === 0) {
        tabla.innerHTML = '<tr><td colspan="5" style="text-align: center;">No hay registros</td></tr>';
        return;
    }

    movimientos.forEach(mov => {
        const fila = document.createElement('tr');
        fila.innerHTML = `
            <td>${mov.nro_cheque}</td>
            <td>${mov.fecha}</td>
            <td>${mov.beneficiario}</td>
            <td>${mov.monto}</td>
            <td>${mov.estado}</td>
        `;
        tabla.appendChild(fila);
    });
}