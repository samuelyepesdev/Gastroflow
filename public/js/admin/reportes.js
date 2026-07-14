(function () {
    var form = document.getElementById('exportForm');
    var btn = document.getElementById('exportSubmitBtn');
    var label = document.getElementById('exportSubmitLabel');
    if (!form) return;

    form.addEventListener('submit', function (evt) {
        evt.preventDefault();
        var mes = document.getElementById('mes').value;
        var anio = document.getElementById('anio').value;
        var url = '/admin/reportes/exportar-pdf?mes=' + encodeURIComponent(mes) + '&anio=' + encodeURIComponent(anio);

        pollJobAndDownload(url, {
            onStart: function () {
                btn.disabled = true;
                label.textContent = 'Generando reporte...';
            },
            onDone: function () {
                btn.disabled = false;
                label.textContent = 'Generar y Descargar PDF';
            }
        });
    });
})();
