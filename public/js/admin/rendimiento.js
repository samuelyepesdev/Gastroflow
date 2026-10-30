/**
 * Gráficos del Panel de Rendimiento (superadmin): tendencia en el tiempo,
 * crecimiento mensual del sistema y comparación de ventas por restaurante.
 */
document.addEventListener('DOMContentLoaded', function () {
    const contentEl = document.querySelector('.admin-shell-content') || document.body;
    const contentStyles = getComputedStyle(contentEl);
    const cssVar = (name, fallback) => contentStyles.getPropertyValue(name).trim() || fallback;
    const chartTextColor = cssVar('--sa-text-secondary', '#46566a');
    const chartTitleColor = cssVar('--sa-text-primary', '#0e1b2c');
    const chartGridColor = 'rgba(14, 27, 44, 0.06)';
    const chartBorderColor = cssVar('--sa-border', '#e4dccf');
    const chartTooltipBg = cssVar('--sa-surface-2', '#ffffff');
    const accentColor = cssVar('--sa-accent', '#ff5a36');

    if (window.Chart) {
        Chart.defaults.color = chartTextColor;
        Chart.defaults.borderColor = chartBorderColor;
    }

    // Mismo hash de paleta que dashboard.js -- cada restaurante recibe un color estable.
    const TENANT_COLOR_PALETTE = [
        '#2e7d46', '#0ea5e9', '#f59e0b', '#8b5cf6', '#f43f5e', '#10b981',
        '#ff5a36', '#ec4899', '#14b8a6', '#f97316', '#84cc16', '#06b6d4'
    ];
    function getTenantColor(name) {
        const str = String(name || '');
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
        }
        return TENANT_COLOR_PALETTE[hash % TENANT_COLOR_PALETTE.length];
    }


    // ─── Selector de periodo ────────────────────────────────────────────────
    const periodoSelect = document.getElementById('periodoSelect');
    if (periodoSelect) {
        periodoSelect.addEventListener('change', function () {
            const url = new URL(window.location.href);
            url.searchParams.set('periodo', periodoSelect.value);
            window.location.href = url.toString();
        });
    }

    const dataEl = document.getElementById('rendimientoData');
    if (!dataEl) return;
    const data = JSON.parse(dataEl.textContent);

    // ─── Tendencia en el tiempo (ventas + facturas, ejes duales) ───────────
    const ctxTendencia = document.getElementById('chartTendencia');
    if (ctxTendencia && data.tendencia && data.tendencia.length > 0) {
        const labels = data.tendencia.map(function (d) {
            const date = new Date(d.fecha + 'T12:00:00');
            return date.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
        });
        const canvasCtx = ctxTendencia.getContext('2d');
        const gradient = canvasCtx.createLinearGradient(0, 0, 0, 300);
        gradient.addColorStop(0, 'rgba(255, 90, 54, 0.22)');
        gradient.addColorStop(1, 'rgba(255, 90, 54, 0.02)');

        new Chart(ctxTendencia, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Ventas',
                        data: data.tendencia.map(function (d) { return d.ventas; }),
                        borderColor: accentColor,
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
                        data: data.tendencia.map(function (d) { return d.facturas; }),
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
                    legend: { display: true, position: 'bottom', labels: { boxWidth: 10, padding: 15, font: { weight: '600', size: 12 } } },
                    tooltip: {
                        backgroundColor: chartTooltipBg,
                        bodyColor: chartTextColor,
                        titleColor: chartTitleColor,
                        borderColor: chartBorderColor,
                        borderWidth: 1,
                        callbacks: {
                            label: function (ctx) {
                                if (ctx.dataset.label === 'Ventas') return 'Ventas: ' + GF.dinero(ctx.parsed.y);
                                return 'Facturas: ' + ctx.parsed.y;
                            }
                        }
                    }
                },
                scales: {
                    x: { grid: { display: false }, ticks: { font: { size: 11 } } },
                    y: {
                        beginAtZero: true,
                        position: 'left',
                        grid: { color: chartGridColor },
                        ticks: { font: { size: 11 }, callback: function (v) { return GF.dinero(v); } }
                    },
                    y1: {
                        beginAtZero: true,
                        position: 'right',
                        grid: { display: false },
                        ticks: { font: { size: 11 } }
                    }
                }
            }
        });
    }

    // ─── Crecimiento mensual del sistema (últimos 12 meses) ────────────────
    const ctxMensual = document.getElementById('chartMensual');
    if (ctxMensual && data.crecimientoMensual && data.crecimientoMensual.length > 0) {
        new Chart(ctxMensual, {
            type: 'bar',
            data: {
                labels: data.crecimientoMensual.map(function (d) { return d.nombreMes; }),
                datasets: [
                    {
                        label: 'Ventas',
                        data: data.crecimientoMensual.map(function (d) { return d.ventas; }),
                        backgroundColor: accentColor,
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
                        backgroundColor: chartTooltipBg,
                        bodyColor: chartTextColor,
                        titleColor: chartTitleColor,
                        borderColor: chartBorderColor,
                        borderWidth: 1,
                        callbacks: {
                            label: function (ctx) {
                                const facturas = data.crecimientoMensual[ctx.dataIndex].facturas;
                                return [GF.dinero(ctx.parsed.y), facturas + ' factura' + (facturas !== 1 ? 's' : '')];
                            }
                        }
                    }
                },
                scales: {
                    x: { grid: { display: false }, ticks: { font: { size: 11 } } },
                    y: {
                        beginAtZero: true,
                        grid: { color: chartGridColor },
                        ticks: { font: { size: 11 }, callback: function (v) { return GF.dinero(v); } }
                    }
                }
            }
        });
    }

    // ─── Comparación de ventas por restaurante (barras horizontales) ───────
    const ctxRestaurante = document.getElementById('chartPorRestaurante');
    if (ctxRestaurante && data.porRestaurante && data.porRestaurante.length > 0) {
        const colors = data.porRestaurante.map(function (r) { return getTenantColor(r.nombre); });
        new Chart(ctxRestaurante, {
            type: 'bar',
            data: {
                labels: data.porRestaurante.map(function (r) { return r.nombre; }),
                datasets: [
                    {
                        label: 'Ventas del periodo',
                        data: data.porRestaurante.map(function (r) { return r.ventas; }),
                        backgroundColor: colors,
                        borderRadius: 5,
                        maxBarThickness: 22
                    }
                ]
            },
            options: {
                indexAxis: 'y',
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: chartTooltipBg,
                        bodyColor: chartTextColor,
                        titleColor: chartTitleColor,
                        borderColor: chartBorderColor,
                        borderWidth: 1,
                        callbacks: {
                            label: function (ctx) {
                                const facturas = data.porRestaurante[ctx.dataIndex].facturas;
                                return [GF.dinero(ctx.parsed.x), facturas + ' factura' + (facturas !== 1 ? 's' : '')];
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        beginAtZero: true,
                        grid: { color: chartGridColor },
                        ticks: { font: { size: 11 }, callback: function (v) { return GF.dinero(v); } }
                    },
                    y: { grid: { display: false }, ticks: { font: { size: 12, weight: '600' } } }
                }
            }
        });
    }
});
