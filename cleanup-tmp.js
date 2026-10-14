const U = require('./database/usuarios.js');
(async () => {
  const lista = await U.listar();
  for (const u of lista) if (u.usuario === 'prueba1') await U.eliminar(u.id, null);
  console.log('Usuarios tras limpiar:', (await U.listar()).map(u => u.usuario).join(', '));
  process.exit(0);
})();