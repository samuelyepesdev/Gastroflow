/**
 * Lógica de gráficos para el dashboard de superadministrador.
 * Incluye auto-refresh cada 60 segundos para ventas de hoy.
 */

document.addEventListener('DOMContentLoaded', function () {

    // ─── Helpers ──────────────────────────────────────────────────────────────
    function hexToRgb(hex) {
        const r = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return r ? `${parseInt(r[1], 16)}, ${parseInt(r[2], 16)}, ${parseInt(r[3], 16)}` : '78, 115, 223';
    }

    function formatCOP(value) {
        return Number(value || 0).toLocaleString('es-CO');
    }

    function formatHora(date) {
        return date.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    }

    function flashElement(el) {
        if (!el) return;
        el.style.transition = 'background-color 0.4s ease';
        el.style.backgroundColor = 'rgba(28, 200, 138, 0.15)';
        setTimeout(() => { el.style.backgroundColor = ''; }, 1200);
    }

    // ─── Gráfico de línea simple ───────────────────────────────────────────────
    function createLineChart(ctx, dataArray, label, colorHex) {
        if (!ctx || !dataArray) return;
        const labels = dataArray.map(v => {
            const date = new Date(v.fecha + 'T12:00:00');
            return date.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
        });
        const values = dataArray.map(v => v.total);

        new Chart(ctx, {
            type: 'line',
            data: {
                labels,
                datasets: [{
                    label,
                    data: values,
                    borderColor: colorHex,
                    backgroundColor: `rgba(${hexToRgb(colorHex)}, 0.1)`,
                    pointRadius: 4,
                    pointBackgroundColor: colorHex,
                    pointBorderColor: '#fff',
                    pointHoverRadius: 6,
                    pointHoverBackgroundColor: colorHex,
                    pointHoverBorderColor: '#fff',
                    pointHitRadius: 10,
                    pointBorderWidth: 2,
                    fill: true,
                    tension: 0.3
                }]
            },
            options: {
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: '#fff',
                        bodyColor: '#858796',
                        titleColor: '#6e707e',
                        borderColor: '#dddfeb',
                        borderWidth: 1,
                        displayColors: false,
                        caretPadding: 10,
                        callbacks: {
                            label: ctx => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(ctx.parsed.y)
                        }
                    }
                },
                scales: {
                    x: { grid: { display: false, drawBorder: false } },
                    y: {
                        beginAtZero: true,
                        grid: { color: 'rgb(234,236,244)', drawBorder: false, borderDash: [2] },
                        ticks: {
                            padding: 10,
                            callback: v => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(v)
                        }
                    }
                }
            }
        });
    }

    // ─── Gráfico multi-serie por tenant ────────────────────────────────────────
    let chartTenants = null; // Instancia global para poder actualizarla en el refresh

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

        const palette = ['#4e73df', '#1cc88a', '#36b9cc', '#f6c23e', '#e74a3b', '#fd7e14', '#6f42c1', '#e83e8c', '#20c997', '#17a2b8'];

        const datasets = tenantDataArray.map((t, idx) => {
            const color = palette[idx % palette.length];
            return {
                label: t.nombre,
                data: t.data.map(v => v.total),
                borderColor: color,
                backgroundColor: `rgba(${hexToRgb(color)}, 0.05)`,
                pointRadius: 3,
                pointBackgroundColor: color,
                pointBorderColor: '#fff',
                pointHoverRadius: 5,
                tension: 0.3,
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
                    legend: { display: true, position: 'bottom', labels: { boxWidth: 12, padding: 15 } },
                    tooltip: {
                        backgroundColor: '#fff',
                        bodyColor: '#858796',
                        titleColor: '#6e707e',
                        borderColor: '#dddfeb',
                        borderWidth: 1,
                        displayColors: true,
                        caretPadding: 10,
                        callbacks: {
                            label: function (context) {
                                let lbl = context.dataset.label || '';
                                if (lbl) lbl += ': ';
                                if (context.parsed.y !== null) {
                                    lbl += new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(context.parsed.y);
                                }
                                return lbl;
                            }
                        }
                    }
                },
                scales: {
                    x: { grid: { display: false } },
                    y: {
                        beginAtZero: true,
                        ticks: { callback: v => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(v) }
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
        if (ctxVentas) createLineChart(ctxVentas, chartData.ventasDiarias, 'Ventas Totales ($)', '#1cc88a');

        const ctxVentasAnt = document.getElementById('chartVentasMesAnterior');
        if (ctxVentasAnt) createLineChart(ctxVentasAnt, chartData.ventasDiariasAnt, 'Ventas Totales Ant. ($)', '#858796');

        const ctxVentasEventos = document.getElementById('chartVentasEventos');
        if (ctxVentasEventos) createLineChart(ctxVentasEventos, chartData.ventasEventos, 'Ventas de Eventos ($)', '#f6c23e');
    }

    // ─── AUTO-REFRESH: Actualiza cards de "Ventas de Hoy" cada 60 segundos ────
    function renderCardHTML(v) {
        const factText = `${v.facturas || 0} factura${(v.facturas || 0) !== 1 ? 's' : ''}`;
        const barWidth = v.total > 0 ? '100%' : '0%';
        const barClass = v.total > 0 ? 'bg-success' : 'bg-light';
        return `
            <div class="card h-100 border-0 shadow-sm" style="border-radius:12px;transition:all 0.2s ease-in-out;border-left:4px solid #667eea !important;">
                <div class="card-body p-3">
                    <div class="d-flex align-items-center justify-content-between mb-2">
                        <div class="small fw-bold text-muted text-truncate me-2" style="font-size:0.75rem;letter-spacing:0.5px;" title="${v.nombre}">
                            ${v.nombre.toUpperCase()}
                        </div>
                        <div class="rounded-circle bg-primary bg-opacity-10 text-primary d-flex align-items-center justify-content-center" style="width:24px;height:24px;">
                            <i class="bi bi-lightning-fill" style="font-size:0.7rem;"></i>
                        </div>
                    </div>
                    <div class="h4 mb-1 fw-bold text-dark tenant-ventas-total">$${formatCOP(v.total)}</div>
                    <div class="small text-muted tenant-ventas-facturas">
                        <i class="bi bi-receipt me-1"></i>${factText}
                    </div>
                    <div class="mt-2 progress" style="height:4px;">
                        <div class="progress-bar ${barClass}" role="progressbar" style="width:${barWidth}"></div>
                    </div>
                </div>
            </div>`;
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

            // Actualizar cards por tenant
            data.ventasHoyPorTenant.forEach(v => {
                const col = container.querySelector(`[data-tenant-card="${CSS.escape(v.nombre)}"]`);
                if (col) {
                    const totalEl2 = col.querySelector('.tenant-ventas-total');
                    const facturasEl = col.querySelector('.tenant-ventas-facturas');
                    const newTotal = `$${formatCOP(v.total)}`;

                    if (totalEl2 && totalEl2.textContent !== newTotal) {
                        totalEl2.textContent = newTotal;
                        flashElement(col.querySelector('.card'));
                    }
                    if (facturasEl) {
                        const factText = `${v.facturas || 0} factura${(v.facturas || 0) !== 1 ? 's' : ''}`;
                        facturasEl.innerHTML = `<i class="bi bi-receipt me-1"></i>${factText}`;
                    }
                    const bar = col.querySelector('.progress-bar');
                    if (bar) {
                        bar.style.width = v.total > 0 ? '100%' : '0%';
                        bar.className = `progress-bar ${v.total > 0 ? 'bg-success' : 'bg-light'}`;
                    }
                } else {
                    // Nuevo tenant con ventas que no estaba al cargar la página
                    const noVentas = document.getElementById('noVentasHoy');
                    if (noVentas) noVentas.remove();
                    const newCol = document.createElement('div');
                    newCol.className = 'col-6 col-md-4 col-lg-3';
                    newCol.setAttribute('data-tenant-card', v.nombre);
                    newCol.innerHTML = renderCardHTML(v);
                    container.appendChild(newCol);
                    flashElement(newCol.querySelector('.card'));
                }
            });

            // ── Actualizar el punto de HOY en el gráfico multi-tenant ──────────
            if (chartTenants && chartTenants.data && chartTenants.data.datasets) {
                let chartActualizado = false;

                // Determinar la etiqueta del día de hoy para encontrar el índice correcto
                const hoyLabel = new Date(data.hoyColombia + 'T12:00:00')
                    .toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
                const labels = chartTenants.data.labels;
                const todayIdx = labels.indexOf(hoyLabel);

                data.ventasHoyPorTenant.forEach(v => {
                    const dataset = chartTenants.data.datasets.find(ds => ds.label === v.nombre);
                    if (!dataset) return;

                    if (todayIdx !== -1) {
                        // El punto de hoy ya existe en el gráfico — actualizamos su valor acumulado
                        if (dataset.data[todayIdx] !== v.total) {
                            dataset.data[todayIdx] = v.total;
                            chartActualizado = true;
                        }
                    } else {
                        // Es un día nuevo — añadir el punto al final del gráfico
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
