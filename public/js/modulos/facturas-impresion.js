(function () {
    const s = document.getElementById('fechaFactura');
    if (s && s.dataset.fechaIso) {
        const d = new Date(s.dataset.fechaIso);
        if (!Number.isNaN(d.getTime())) s.textContent = d.toLocaleString('es-CO', { timeZone: 'America/Bogota', dateStyle: 'short', timeStyle: 'medium' });
    }
})();
