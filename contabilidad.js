document.addEventListener('DOMContentLoaded', async () => {
    // Botón de retorno al menú principal
    const btnMenu = document.getElementById('btn-menu');
    if (btnMenu) {
        btnMenu.addEventListener('click', () => {
            window.api.navegarA('monica-gestion.html');
        });
    }

    // Botones de acción principales por módulo
    const btnAccionPrincipal = document.getElementById('btn-crear-asiento');
    if (btnAccionPrincipal) {
        btnAccionPrincipal.addEventListener('click', async () => {
            console.log("Ejecutando acción principal del módulo contabilidad...");
            const resultado = await window.api.guardarRegistro('contabilidad', {
                nro_asiento: `AS-${Date.now()}`,
                fecha: new Date().toLocaleDateString('es-ES'),
                libro: 'DIA',
                dcmto: 'ASIE',
                cuenta: '1101',
                descripcion: 'Nuevo asiento contable'
            });
            console.log(resultado);
            await cargarAsientos();
        });
    }

    await cargarAsientos();
});

/**
 * Carga los asientos contables en la tabla
 */
async function cargarAsientos() {
    const respuesta = await window.api.consultarDatos('contabilidad', {});
    const asientos = respuesta.success ? respuesta.data : [];

    const tbody = document.querySelector('table tbody');
    if (!tbody) return;

    tbody.innerHTML = '';

    if (asientos.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align: center;">No hay registros</td></tr>';
        return;
    }

    asientos.forEach(asiento => {
        const fila = document.createElement('tr');
        fila.innerHTML = `
            <td>${asiento.nro_asiento}</td>
            <td>${asiento.fecha}</td>
            <td>${asiento.libro}</td>
            <td>${asiento.dcmto}</td>
            <td>${asiento.cuenta}</td>
            <td>${asiento.descripcion}</td>
        `;
        tbody.appendChild(fila);
    });
}