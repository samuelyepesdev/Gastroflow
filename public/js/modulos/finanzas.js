(function () {
    const el = document.getElementById('finanzas-data');
    if (!el) return;
    const pageData = JSON.parse(el.textContent);

    const ctxTendencia = document.getElementById('chartTendencia').getContext('2d');
    const historico = pageData.historico;

    new Chart(ctxTendencia, {
        type: 'line',
        data: {
            labels: historico.map(function (h) {
                // "2026-10-14T00:00:00.000Z" -> "14/10"
                var m = String(h.fecha).match(/(\d{4})-(\d{2})-(\d{2})/);
                return m ? m[3] + '/' + m[2] : h.fecha;
            }),
            datasets: [
                {
                    label: 'Ingresos',
                    data: historico.map(function (h) { return h.ingresos; }),
                    borderColor: '#059669',
                    backgroundColor: 'rgba(5, 150, 105, 0.1)',
                    fill: true,
                    tension: 0.3,
                    borderWidth: 2
                },
                {
                    label: 'Egresos',
                    data: historico.map(function (h) { return h.egresos; }),
                    borderColor: '#dc2626',
                    backgroundColor: 'rgba(220, 38, 38, 0.1)',
                    fill: true,
                    tension: 0.3,
                    borderWidth: 2
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { position: 'top', align: 'end' } },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: { color: '#f3ede4' },
                    ticks: {
                        callback: function (v) {
                            return Math.abs(v) >= 1000 ? '$' + (v / 1000) + 'k' : '$' + v;
                        }
                    }
                },
                x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 8 } }
            }
        }
    });

    // Este gráfico solo existe si hay gastos. Antes se buscaba igual y, sin
    // gastos, el script se caía aquí: guardarGasto nunca quedaba definido y el
    // botón "Registrar Operación" no hacía nada (no se podía registrar el primero).
    const canvasCat = document.getElementById('chartCategorias');
    const dataCat = pageData.gastosPorCategoria || [];

    if (canvasCat) new Chart(canvasCat.getContext('2d'), {
        type: 'bar',
        data: {
            labels: dataCat.map(function (row) { return row.categoria_gasto; }),
            datasets: [{
                data: dataCat.map(function (row) { return row.total; }),
                backgroundColor: '#16283e',
                borderRadius: 4
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                x: { grid: { display: false } },
                y: { grid: { display: false } }
            }
        }
    });

    async function guardarGasto() {
        const payload = {
            monto: MoneyInput.parse(document.getElementById('gastoMonto').value),
            motivo: document.getElementById('gastoMotivo').value,
            categoria: document.getElementById('gastoCategoria').value,
            tipo: document.getElementById('gastoTipo').value,
            metodo_pago: document.getElementById('gastoMetodo').value,
            fecha: document.getElementById('gastoFecha').value
        };

        if (!payload.monto) return Swal.fire('Aviso', 'Ingrese un monto válido', 'warning');
        if (!payload.fecha) return Swal.fire('Aviso', 'Indique la fecha de la transacción', 'warning');

        try {
            await GF.api('/finanzas/api/movimientos', { method: 'POST', body: payload }, 'No se pudo completar la operación');
            Swal.fire({
                title: 'Registro Exitoso',
                text: 'La operación quedó asentada en el libro diario con la fecha indicada.',
                icon: 'success',
                confirmButtonColor: '#0e1b2c'
            }).then(function () { location.reload(); });
        } catch (e) {
            GF.error(e.message);
        }
    }

    window.guardarGasto = guardarGasto;
})();
