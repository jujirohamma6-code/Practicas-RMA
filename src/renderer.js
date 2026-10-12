document.addEventListener('DOMContentLoaded', async () => {
  const testMsg = document.getElementById('test-db-msg');
  if (window.api && testMsg) {
    const respuesta = await window.api.testConexion();
    testMsg.textContent = respuesta;
  }
});
