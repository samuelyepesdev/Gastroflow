/**
 * Lógica de gráficos para el dashboard de superadministrador.
 * Incluye auto-refresh cada 60 segundos para ventas de hoy y ordenación del Leaderboard.
 */

document.addEventListener('DOMContentLoaded', function () {

    // ─── Helpers & Colors ──────────────────────────────────────────────────────
    const colorsMap = {
        'Principal': '#2e7d46',
        'Restaurante Principal': '#2e7d46',
        'Ichiban': '#10b981',
        'Rollito Cinnamon': '#f59e0b',
        'Carreteritos': '#0ea5e9',
        'Callejero': '#f43f5e',
        'Gelatto & Arte': '#8b5cf6'
    };

    function getTenantColor(name) {
        return colorsMap[name] || '#94a3b8';
    }

    function hexToRgb(hex) {
        const r = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return r ? `${parseInt(r[1], 16)}, ${parseInt(r[2], 16)}, ${parseInt(r[3], 16)}` : '148, 163, 184';
    }

    function formatCOP(value) {
        return Number(value || 0).toLocaleString('es-CO', { maximumFractionDigits: 0 });
    }

    function formatHora(date) {
        return date.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    }

    function flashElement(el) {
        if (!el) return;
        el.style.transition = 'background-color 0.4s ease';
        el.style.backgroundColor = 'rgba(46, 125, 70, 0.12)';
        setTimeout(() => { el.style.backgroundColor = ''; }, 1200);
    }

    // ─── Gráfico comparativo mensual global ──────────────────────────────────
    function createComparisonChart(ctx, dataActual, dataAnterior) {
        if (!ctx) return;

        const labels = dataActual.map(v => {
            const date = new Date(v.fecha + 'T12:00:00');
            return date.toLocaleDateString('es-ES', { day: '2-digit' });
        });

        const actualValues = dataActual.map(v => v.total);
        const anteriorValues = dataAnterior.map(v => v.total);

        // Generar gradiente para el mes actual
        const canvasCtx = ctx.getContext('2d');
        const gradient = canvasCtx.createLinearGradient(0, 0, 0, 260);
        gradient.addColorStop(0, 'rgba(46, 125, 70, 0.22)');
        gradient.addColorStop(1, 'rgba(46, 125, 70, 0.02)');

        new Chart(ctx, {
            type: 'line',
            data: {
                labels,
                datasets: [
                    {
                        label: 'Mes Actual',
                        data: actualValues,
                        borderColor: '#2e7d46',
                        backgroundColor: gradient,
                        pointRadius: 0,
                        pointHoverRadius: 5,
                        pointHoverBackgroundColor: '#2e7d46',
                        pointHoverBorderColor: '#fff',
                        fill: true,
                        tension: 0.35,
                        borderWidth: 3
                    },
                    {
                        label: 'Mes Anterior',
                        data: anteriorValues,
                        borderColor: '#b7c0cf',
                        backgroundColor: 'transparent',
                        pointRadius: 0,
                        pointHoverRadius: 5,
                        pointHoverBackgroundColor: '#b7c0cf',
                        pointHoverBorderColor: '#fff',
                        fill: false,
                        tension: 0.35,
                        borderWidth: 2,
                        borderDash: [5, 5]
                    }
                ]
            },
            options: {
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: '#fff',
                        bodyColor: '#475569',
                        titleColor: '#0f172a',
                        borderColor: '#e9ebef',
                        borderWidth: 1,
                        displayColors: true,
                        caretPadding: 10,
                        titleFont: { family: 'Plus Jakarta Sans', weight: '700' },
                        bodyFont: { family: 'Plus Jakarta Sans' },
                        callbacks: {
                            label: context => {
                                let label = context.dataset.label || '';
                                if (label) label += ': ';
                                label += new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(context.parsed.y);
                                return label;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        grid: { display: false },
                        ticks: {
                            font: { family: 'Plus Jakarta Sans', size: 11 }
                        }
                    },
                    y: {
                        beginAtZero: true,
                        grid: { color: '#f1f3f6' },
                        ticks: {
                            font: { family: 'Plus Jakarta Sans', size: 11 },
                            callback: v => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(v)
                        }
                    }
                }
            }
        });
    }

    // ─── Gráfico multi-serie por tenant ────────────────────────────────────────
    let chartTenants = null;

    function createMultiLineChart(ctx, tenantDataArray) {
        if (!ctx) return;

        let labels = [];
        if (tenantDataArray && tenantDataArray.length > 0) {
            labels = tenantDataArray[0].data.map(v => {
                const date = new Date(v.fecha + 'T12:00:00');
                return date.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
            });
        } else {
            const diaHoy = new Date().getDate();
            for (let i = 1; i <= diaHoy; i++) labels.push(`${String(i).padStart(2, '0')} mar`);
        }

        const datasets = tenantDataArray.map((t) => {
            const color = getTenantColor(t.nombre);
            return {
                label: t.nombre,
                data: t.data.map(v => v.total),
                borderColor: color,
                backgroundColor: 'transparent',
                pointRadius: 0,
                pointHoverRadius: 5,
                pointHoverBackgroundColor: color,
                pointHoverBorderColor: '#fff',
                tension: 0.35,
                borderWidth: 2.6,
                fill: false
            };
        });

        chartTenants = new Chart(ctx, {
            type: 'line',
            data: { labels, datasets },
            options: {
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: {
                        display: true,
                        position: 'bottom',
                        labels: {
                            boxWidth: 10,
                            padding: 15,
                            font: { family: 'Plus Jakarta Sans', weight: '600', size: 12 }
                        }
                    },
                    tooltip: {
                        backgroundColor: '#fff',
                        bodyColor: '#475569',
                        titleColor: '#0f172a',
                        borderColor: '#e9ebef',
                        borderWidth: 1,
                        displayColors: true,
                        caretPadding: 10,
                        titleFont: { family: 'Plus Jakarta Sans', weight: '700' },
                        bodyFont: { family: 'Plus Jakarta Sans' },
                        callbacks: {
                            label: function (context) {
                                let lbl = context.dataset.label || '';
                                if (lbl) lbl += ': ';
                                if (context.parsed.y !== null) {
                                    lbl += new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(context.parsed.y);
                                }
                                return lbl;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        grid: { display: false },
                        ticks: { font: { family: 'Plus Jakarta Sans', size: 11 } }
                    },
                    y: {
                        beginAtZero: true,
                        grid: { color: '#f1f3f6' },
                        ticks: {
                            font: { family: 'Plus Jakarta Sans', size: 11 },
                            callback: v => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(v)
                        }
                    }
                }
            }
        });
        return chartTenants;
    }

    // ─── Inicializar gráficas ──────────────────────────────────────────────────
    const chartDataEl = document.getElementById('chartData');
    const chartData = chartDataEl ? JSON.parse(chartDataEl.textContent) : null;
    if (chartData) {
        const ctxTenants = document.getElementById('chartVentasTenants');
        if (ctxTenants) createMultiLineChart(ctxTenants, chartData.ventasPorTenant);

        const ctxVentas = document.getElementById('chartVentasMes');
        if (ctxVentas) createComparisonChart(ctxVentas, chartData.ventasDiarias, chartData.ventasDiariasAnt);
    }

    // ─── AUTO-REFRESH: Actualiza Leaderboard cada 60 segundos ──────────────────
    function renderRowHTML(v, idx, maxSales) {
        const color = getTenantColor(v.nombre);
        const pct = maxSales > 0 ? (v.total / maxSales) * 100 : 0;
        const rankClass = idx === 0 ? 'top-rank' : '';
        const factText = `${v.facturas || 0} factura${(v.facturas || 0) !== 1 ? 's' : ''}`;
        return `
            <span class="leaderboard-rank ${rankClass}">${idx + 1}</span>
            <span class="leaderboard-dot" style="background: ${color}"></span>
            <div class="leaderboard-info">
                <div class="leaderboard-tenant-name text-truncate" title="${v.nombre}">${v.nombre}</div>
                <div class="leaderboard-tenant-subtext">${factText}</div>
            </div>
            <div class="flex-grow-1 d-none d-md-block">
                <div class="leaderboard-progress-bg">
                    <div class="leaderboard-progress-fill" style="width: ${Math.max(pct, 1.5)}%; background: linear-gradient(90deg, rgba(${hexToRgb(color)}, 0.25), ${color});"></div>
                </div>
            </div>
            <span class="leaderboard-sales-val">$${formatCOP(v.total)}</span>
        `;
    }

    async function refreshLiveStats() {
        try {
            const resp = await fetch('/admin/dashboard/live-stats', { cache: 'no-store' });
            if (!resp.ok) return;
            const data = await resp.json();
            if (!data.ok) return;

            const container = document.getElementById('ventasHoyContainer');
            if (!container) return;

            // Actualizar total global
            const totalEl = document.getElementById('ventasHoyTotalGlobal');
            if (totalEl) {
                const newValue = formatCOP(data.ventasHoyTotalGlobal);
                if (totalEl.textContent !== newValue) {
                    totalEl.textContent = newValue;
                    flashElement(totalEl.parentElement);
                }
            }

            // Calcular ventas máximas para porcentajes
            const maxSales = Math.max(...data.ventasHoyPorTenant.map(t => t.total)) || 1;

            // Eliminar contenedor de "no hay ventas" si llega data
            if (data.ventasHoyPorTenant.length > 0) {
                const noVentas = document.getElementById('noVentasHoy');
                if (noVentas) noVentas.remove();
            }

            // Actualizar y ordenar filas del Leaderboard
            data.ventasHoyPorTenant.forEach((v, idx) => {
                let row = container.querySelector(`[data-tenant-row="${CSS.escape(v.nombre)}"]`);
                const rankClass = idx === 0 ? 'top-rank' : '';
                const newTotalStr = `$${formatCOP(v.total)}`;

                if (row) {
                    // Actualizar fila existente
                    const rankEl = row.querySelector('.leaderboard-rank');
                    const nameEl = row.querySelector('.leaderboard-tenant-name');
                    const subtextEl = row.querySelector('.leaderboard-tenant-subtext');
                    const salesEl = row.querySelector('.leaderboard-sales-val');
                    const progressEl = row.querySelector('.leaderboard-progress-fill');

                    if (rankEl) {
                        rankEl.textContent = idx + 1;
                        if (idx === 0) rankEl.classList.add('top-rank');
                        else rankEl.classList.remove('top-rank');
                    }
                    if (subtextEl) {
                        subtextEl.textContent = `${v.facturas || 0} factura${(v.facturas || 0) !== 1 ? 's' : ''}`;
                    }
                    if (salesEl && salesEl.textContent !== newTotalStr) {
                        salesEl.textContent = newTotalStr;
                        flashElement(row);
                    }
                    if (progressEl) {
                        const pct = (v.total / maxSales) * 100;
                        progressEl.style.width = `${Math.max(pct, 1.5)}%`;
                    }
                    // Mover al orden correcto según el sorting de la consulta
                    container.appendChild(row);
                } else {
                    // Crear nueva fila en Leaderboard
                    row = document.createElement('div');
                    row.className = 'leaderboard-row';
                    row.setAttribute('data-tenant-row', v.nombre);
                    row.innerHTML = renderRowHTML(v, idx, maxSales);
                    container.appendChild(row);
                    flashElement(row);
                }
            });

            // ── Actualizar el punto de HOY en el gráfico multi-tenant ──────────
            if (chartTenants && chartTenants.data && chartTenants.data.datasets) {
                let chartActualizado = false;

                const hoyLabel = new Date(data.hoyColombia + 'T12:00:00')
                    .toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
                const labels = chartTenants.data.labels;
                const todayIdx = labels.indexOf(hoyLabel);

                data.ventasHoyPorTenant.forEach(v => {
                    const dataset = chartTenants.data.datasets.find(ds => ds.label === v.nombre);
                    if (!dataset) return;

                    if (todayIdx !== -1) {
                        if (dataset.data[todayIdx] !== v.total) {
                            dataset.data[todayIdx] = v.total;
                            chartActualizado = true;
                        }
                    } else {
                        if (!chartTenants.data.labels.includes(hoyLabel)) {
                            chartTenants.data.labels.push(hoyLabel);
                        }
                        dataset.data.push(v.total);
                        chartActualizado = true;
                    }
                });

                if (chartActualizado) chartTenants.update('none');
            }

            // Mostrar hora de última actualización
            const timeEl = document.getElementById('lastUpdatedTime');
            if (timeEl) timeEl.textContent = `Actualizado ${formatHora(new Date())}`;

        } catch (e) {
            console.warn('[Auto-refresh] Error:', e.message);
        }
    }

    // Primer refresh a los 5 segundos, luego cada 60 segundos
    setTimeout(refreshLiveStats, 5000);
    setInterval(refreshLiveStats, 60 * 1000);
});
