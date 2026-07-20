(function () {
    const el = document.getElementById('analitica-data');
    if (!el) return;
    const d = JSON.parse(el.textContent);
    const fmtCOP = function (v) { return Number(v || 0).toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }); };

    const mesesData = d.meses;
    if (mesesData.length && document.getElementById('chartMensual')) {
        new Chart(document.getElementById('chartMensual'), {
            type: 'bar',
            data: {
                labels: mesesData.map(function (m) { return m.nombreMes + ' ' + m.year; }),
                datasets: [
                    {
                        label: 'Ventas',
                        data: mesesData.map(function (m) { return Number.parseFloat(m.total_ventas) || 0; }),
                        backgroundColor: 'rgba(99,102,241,0.75)',
                        borderColor: 'rgba(99,102,241,1)',
                        borderWidth: 1,
                        borderRadius: 6,
                        yAxisID: 'y'
                    },
                    {
                        label: 'Facturas',
                        data: mesesData.map(function (m) { return Number.parseInt(m.cantidad_facturas, 10) || 0; }),
                        type: 'line',
                        borderColor: 'rgba(16,185,129,1)',
                        backgroundColor: 'rgba(16,185,129,0.1)',
                        borderWidth: 2,
                        pointRadius: 4,
                        fill: false,
                        tension: 0.3,
                        yAxisID: 'y2'
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'top' },
                    tooltip: {
                        callbacks: {
                            label: function (ctx) {
                                return ctx.datasetIndex === 0
                                    ? ' ' + fmtCOP(ctx.parsed.y)
                                    : ' ' + ctx.parsed.y + ' facturas';
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        type: 'linear',
                        position: 'left',
                        ticks: { callback: function (v) { return fmtCOP(v); } },
                        grid: { color: 'rgba(0,0,0,0.05)' }
                    },
                    y2: {
                        type: 'linear',
                        position: 'right',
                        grid: { drawOnChartArea: false }
                    }
                }
            }
        });
    }

    const predData = d.predMesesUsados;
    const predValor = d.predValor;
    const predMin = d.predMin;
    const predMax = d.predMax;

    if (predData.length && document.getElementById('chartPrediccion')) {
        const labels = predData.map(function (m) { return m.nombreMes + ' ' + m.year; });
        labels.push('Estimado');
        const valores = predData.map(function (m) { return Number.parseFloat(m.total_ventas) || 0; });
        valores.push(predValor);
        const colores = predData.map(function () { return 'rgba(99,102,241,0.65)'; });
        colores.push('rgba(245,158,11,0.8)');

        new Chart(document.getElementById('chartPrediccion'), {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Ventas / Estimado',
                    data: valores,
                    backgroundColor: colores,
                    borderRadius: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: function (ctx) {
                                const isLast = ctx.dataIndex === valores.length - 1;
                                if (isLast) {
                                    return [
                                        ' Estimado: ' + fmtCOP(predValor),
                                        ' Rango: ' + fmtCOP(predMin) + ' – ' + fmtCOP(predMax)
                                    ];
                                }
                                return [' ' + fmtCOP(ctx.parsed.y)];
                            }
                        }
                    }
                },
                scales: {
                    y: { ticks: { callback: function (v) { return fmtCOP(v); } }, grid: { color: 'rgba(0,0,0,0.05)' } }
                }
            }
        });
    }
})();
