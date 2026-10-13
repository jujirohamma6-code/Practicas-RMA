document.addEventListener('DOMContentLoaded', async () => {
  const testMsg = document.getElementById('test-db-msg');
  if (window.api && testMsg) {
    const respuesta = await window.api.testConexion();
    testMsg.textContent = respuesta;
  }
});


function abrirModulo(modulo) {
  if (modulo === 'estimados') {
    window.location.href = 'estimados.html';
  } else if (modulo === 'facturacion') {
    window.location.href = 'facturacion.html';
  } else if (modulo === 'cxp') {
    window.location.href = 'cxp.html';
  }
}
