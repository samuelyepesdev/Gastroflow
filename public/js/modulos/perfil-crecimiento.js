/**
 * Tab "Crecimiento" del perfil del tenant: ventas y crecimiento del propio
 * negocio a lo largo del tiempo. Analogía tenant-scoped del panel de
 * rendimiento del superadmin (public/js/admin/rendimiento.js).
 */
(function () {
    let loaded = false;
    let chartTendencia = null;
    let chartMensual = null;


    function fmtInt(v) {
        return Number(v || 0).toLocaleString('es-CO');
    }

    function fmtPct(v) {
        return (v === null || v === undefined) ? 'Nuevo' : (v >= 0 ? '+' : '') + v.toFixed(1) + '%';
    }

    function pctBadgeClass(v) {
        if (v === null || v === undefined) return 'bg-primary';
        if (v > 0) return 'bg-success';
        if (v < 0) return 'bg-danger';
        return 'bg-secondary';
    }

    function pctIcon(v) {
        if (v === null || v === undefined) return 'bi-stars';
        if (v > 0) return 'bi-arrow-up-right';
        if (v < 0) return 'bi-arrow-down-right';
        return 'bi-dash';
    }

    function renderKpis(stats) {
        const kpisEl = document.getElementById('crecimientoKpis');
        const k = stats.kpis;
        kpisEl.innerHTML = `
            <div class="col-6 col-lg-3">
                <div class="card border-0 shadow-sm h-100">
                    <div class="card-body">
                        <span class="small text-muted d-block">Ventas del periodo</span>
                        <div class="fs-4 fw-bold text-success mt-1">${GF.dinero(k.ventasPeriodo)}</div>
                        <span class="badge ${pctBadgeClass(k.crecimientoVentasPct)} mt-1">
                            <i class="bi ${pctIcon(k.crecimientoVentasPct)}"></i> ${fmtPct(k.crecimientoVentasPct)}
                        </span>
                    </div>
                </div>
            </div>
            <div class="col-6 col-lg-3">
                <div class="card border-0 shadow-sm h-100">
                    <div class="card-body">
                        <span class="small text-muted d-block">Facturas del periodo</span>
                        <div class="fs-4 fw-bold mt-1">${fmtInt(k.facturasPeriodo)}</div>
                        <span class="badge ${pctBadgeClass(k.crecimientoFacturasPct)} mt-1">
                            <i class="bi ${pctIcon(k.crecimientoFacturasPct)}"></i> ${fmtPct(k.crecimientoFacturasPct)}
                        </span>
                    </div>
                </div>
            </div>
            <div class="col-6 col-lg-3">
                <div class="card border-0 shadow-sm h-100">
                    <div class="card-body">
                        <span class="small text-muted d-block">Ticket promedio</span>
                        <div class="fs-4 fw-bold mt-1">${GF.dinero(k.ticketPromedio)}</div>
                    </div>
                </div>
            </div>
            <div class="col-6 col-lg-3">
                <div class="card border-0 shadow-sm h-100">
                    <div class="card-body">
                        <span class="small text-muted d-block">Periodo comparado</span>
                        <div class="fw-semibold mt-1">${stats.desde} a ${stats.hasta}</div>
                        <span class="small text-muted">vs. periodo anterior equivalente</span>
                    </div>
                </div>
            </div>
        `;
    }

    function renderCharts(stats) {
        const ctxTendencia = document.getElementById('chartCrecimientoTendencia');
        if (chartTendencia) chartTendencia.destroy();
        if (ctxTendencia && stats.tendencia && stats.tendencia.length > 0) {
            const labels = stats.tendencia.map(function (d) {
                const date = new Date(d.fecha + 'T12:00:00');
                return date.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
            });
            const canvasCtx = ctxTendencia.getContext('2d');
            const gradient = canvasCtx.createLinearGradient(0, 0, 0, 300);
            gradient.addColorStop(0, 'rgba(13, 110, 253, 0.22)');
            gradient.addColorStop(1, 'rgba(13, 110, 253, 0.02)');

            chartTendencia = new Chart(ctxTendencia, {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: [
                        {
                            label: 'Ventas',
                            data: stats.tendencia.map(function (d) { return d.ventas; }),
                            borderColor: '#ff5a36',
                            backgroundColor: gradient,
                            pointRadius: 0,
                            pointHoverRadius: 5,
                            tension: 0.35,
                            borderWidth: 2.6,
                            fill: true,
                            yAxisID: 'y'
                        },
                        {
                            label: 'Facturas',
                            data: stats.tendencia.map(function (d) { return d.facturas; }),
                            borderColor: '#f59e0b',
                            backgroundColor: 'transparent',
                            pointRadius: 0,
                            pointHoverRadius: 5,
                            tension: 0.35,
                            borderWidth: 2,
                            borderDash: [5, 4],
                            fill: false,
                            yAxisID: 'y1'
                        }
                    ]
                },
                options: {
                    maintainAspectRatio: false,
                    interaction: { mode: 'index', intersect: false },
                    plugins: {
                        legend: { display: true, position: 'bottom', labels: { boxWidth: 10, padding: 15 } },
                        tooltip: {
                            callbacks: {
                                label: function (ctx) {
                                    if (ctx.dataset.label === 'Ventas') return 'Ventas: ' + GF.dinero(ctx.parsed.y);
                                    return 'Facturas: ' + ctx.parsed.y;
                                }
                            }
                        }
                    },
                    scales: {
                        x: { grid: { display: false } },
                        y: {
                            beginAtZero: true,
                            position: 'left',
                            ticks: { callback: function (v) { return GF.dinero(v); } }
                        },
                        y1: {
                            beginAtZero: true,
                            position: 'right',
                            grid: { display: false }
                        }
                    }
                }
            });
        }

        const ctxMensual = document.getElementById('chartCrecimientoMensual');
        if (chartMensual) chartMensual.destroy();
        if (ctxMensual && stats.crecimientoMensual && stats.crecimientoMensual.length > 0) {
            chartMensual = new Chart(ctxMensual, {
                type: 'bar',
                data: {
                    labels: stats.crecimientoMensual.map(function (d) { return d.nombreMes; }),
                    datasets: [
                        {
                            label: 'Ventas',
                            data: stats.crecimientoMensual.map(function (d) { return d.ventas; }),
                            backgroundColor: '#ff5a36',
                            borderRadius: 6,
                            maxBarThickness: 42
                        }
                    ]
                },
                options: {
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            callbacks: {
                                label: function (ctx) {
                                    const facturas = stats.crecimientoMensual[ctx.dataIndex].facturas;
                                    return [GF.dinero(ctx.parsed.y), facturas + ' factura' + (facturas !== 1 ? 's' : '')];
                                }
                            }
                        }
                    },
                    scales: {
                        x: { grid: { display: false } },
                        y: { beginAtZero: true, ticks: { callback: function (v) { return GF.dinero(v); } } }
                    }
                }
            });
        }
    }

    async function loadCrecimiento(periodo) {
        document.getElementById('crecimientoLoading').style.display = '';
        document.getElementById('crecimientoContent').style.display = 'none';
        document.getElementById('crecimientoError').style.display = 'none';
        try {
            const stats = await GF.api(`/perfil/api/crecimiento?periodo=${periodo || 30}`);
            renderKpis(stats);
            renderCharts(stats);
            document.getElementById('crecimientoContent').style.display = '';
        } catch (e) {
            document.getElementById('crecimientoError').style.display = '';
        } finally {
            document.getElementById('crecimientoLoading').style.display = 'none';
        }
    }

    document.addEventListener('shown.bs.tab', function (e) {
        if (e.target.id === 'crecimiento-tab' && !loaded) {
            loaded = true;
            const select = document.getElementById('crecimientoPeriodoSelect');
            loadCrecimiento(select ? select.value : 30);
        }
    });

    const periodoSelect = document.getElementById('crecimientoPeriodoSelect');
    if (periodoSelect) {
        periodoSelect.addEventListener('change', function () {
            loadCrecimiento(periodoSelect.value);
        });
    }
})();
