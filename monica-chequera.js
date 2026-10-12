document.addEventListener('DOMContentLoaded', () => {
    const path = require('path');
    const btnRegresar = document.getElementById('btn-regresar');
    
    if (btnRegresar) {
        btnRegresar.addEventListener('click', () => {
            window.location.href = 'file://' + path.join(__dirname, 'monica-gestion.html');
        });
    }
});