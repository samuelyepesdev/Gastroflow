(function () {
    var s = document.getElementById('fechaFactura');
    if (s && s.getAttribute('data-fecha-iso')) {
        var d = new Date(s.getAttribute('data-fecha-iso'));
        if (!isNaN(d.getTime())) s.textContent = d.toLocaleString('es-CO', { timeZone: 'America/Bogota', dateStyle: 'short', timeStyle: 'medium' });
    }
})();
