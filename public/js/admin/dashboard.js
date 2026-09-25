/**
 * Lógica de gráficos para el dashboard de superadministrador.
 * Incluye auto-refresh cada 60 segundos para ventas de hoy y ordenación del Leaderboard.
 */

document.addEventListener('DOMContentLoaded', function () {

    // ─── Colores de Chart.js leídos de las variables --sa-* del área de contenido ──
    const contentEl = document.querySelector('.admin-shell-content') || document.body;
    const contentStyles = getComputedStyle(contentEl);
    const cssVar = (name, fallback) => (contentStyles.getPropertyValue(name).trim() || fallback);
    const chartTextColor = cssVar('--sa-text-secondary', '#475569');
    const chartTitleColor = cssVar('--sa-text-primary', '#0f172a');
    const chartGridColor = 'rgba(15, 23, 42, 0.06)';
    const chartBorderColor = cssVar('--sa-border', '#e2e8f0');
    const chartTooltipBg = cssVar('--sa-surface-2', '#ffffff');

    if (window.Chart) {
        Chart.defaults.color = chartTextColor;
        Chart.defaults.borderColor = chartBorderColor;
    }

    // ─── Helpers & Colors ──────────────────────────────────────────────────────
    // Mismo hash de paleta que views/admin/dashboard/_charts.ejs -- deben coincidir
    // para que el color de cada restaurante no cambie entre el render inicial y el
    // auto-refresh del leaderboard.
    const TENANT_COLOR_PALETTE = [
        '#2e7d46', '#0ea5e9', '#f59e0b', '#8b5cf6', '#f43f5e', '#10b981',
        '#6366f1', '#ec4899', '#14b8a6', '#f97316', '#84cc16', '#06b6d4'
    ];

    function getTenantColor(name) {
        const str = String(name || '');
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
        }
        return TENANT_COLOR_PALETTE[hash % TENANT_COLOR_PALETTE.length];
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
                        backgroundColor: chartTooltipBg,
                        bodyColor: chartTextColor,
                        titleColor: chartTitleColor,
                        borderColor: chartBorderColor,
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
                            color: chartTextColor,
                            font: { family: 'Plus Jakarta Sans', size: 11 }
                        }
                    },
                    y: {
                        beginAtZero: true,
                        grid: { color: chartGridColor },
                        ticks: {
                            color: chartTextColor,
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
                            color: chartTextColor,
                            boxWidth: 10,
                            padding: 15,
                            font: { family: 'Plus Jakarta Sans', weight: '600', size: 12 }
                        }
                    },
                    tooltip: {
                        backgroundColor: chartTooltipBg,
                        bodyColor: chartTextColor,
                        titleColor: chartTitleColor,
                        borderColor: chartBorderColor,
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
                        ticks: { color: chartTextColor, font: { family: 'Plus Jakarta Sans', size: 11 } }
                    },
                    y: {
                        beginAtZero: true,
                        grid: { color: chartGridColor },
                        ticks: {
                            color: chartTextColor,
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

    // Se refresca cuando algún tenant registra una venta (SSE /live-stream), en
    // vez de consultar cada 60 s. Ráfagas de ventas se agrupan en una consulta.
    // Respaldo cada 5 min (por si se pierde un evento) y nada con la pestaña oculta.
    let liveTimer = null;
    const scheduleLiveRefresh = delay => {
        clearTimeout(liveTimer);
        liveTimer = setTimeout(refreshLiveStats, delay);
    };

    if (window.EventSource) {
        const source = new EventSource('/admin/dashboard/live-stream');
        source.addEventListener('message', e => {
            try {
                const data = JSON.parse(e.data);
                // 'connected' también: tras reconectar pudimos perdernos ventas.
                if (data.event === 'ventaRegistrada' || data.event === 'connected') {
                    scheduleLiveRefresh(2000);
                }
            } catch (err) {
                console.warn('[Live] Error SSE:', err);
            }
        });
        window.addEventListener('beforeunload', () => source.close());
    }

    setInterval(() => {
        if (document.visibilityState === 'visible') refreshLiveStats();
    }, 5 * 60 * 1000);
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') scheduleLiveRefresh(300);
    });
});
