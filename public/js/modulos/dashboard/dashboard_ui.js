// State and Event controller for GastroFlow Dashboard
$(function () {
  const mod = window.DashboardModule;

  // Initialize Local State dynamically from data attribute, fallback to default green
  mod.activeTheme = $('#dashboardRoot').attr('data-accent') || '#2e7d46';
  mod.activeVariation = localStorage.getItem('dashboard_variation') || 'A';
  mod.activeTab = localStorage.getItem('dashboard_tab') || 'resumen';
  mod.activeRange = localStorage.getItem('dashboard_range') || '7d';

  // Switch Variation Panel (A: Analytics, B: Focus)
  function applyVariation() {
    $('.btn-variation').removeClass('active');
    $(`.btn-variation[data-variation="${mod.activeVariation}"]`).addClass('active');

    if (mod.activeVariation === 'A') {
      $('#panelVariationB').hide();
      $('#panelVariationA').show();
      reparentWidgets();
    } else {
      $('#panelVariationA').hide();
      $('#panelVariationB').show();
      applyFocusTab();
    }
  }

  // Switch Focus Mode Tabs
  function applyFocusTab() {
    $('.btn-focus-tab').removeClass('active');
    $(`.btn-focus-tab[data-tab="${mod.activeTab}"]`).addClass('active');

    $('#focusTabPanels > div').hide();

    if (mod.activeTab === 'resumen') {
      $('#focusPanelResumen').show();
    } else if (mod.activeTab === 'ventas') {
      $('#focusPanelVentas').show();
    } else if (mod.activeTab === 'productos') {
      $('#focusPanelProductos').show();
    } else if (mod.activeTab === 'eventos') {
      $('#focusPanelEventos').show();
    }

    reparentWidgets();
  }

  // Reparent reusable widgets dynamically to prevent canvas duplication
  function reparentWidgets() {
    if (mod.activeVariation === 'A') {
      $('#widgetDailySalesChart').appendTo('#analyticsChartCol');
      $('#widgetPaymentChart').appendTo('#analyticsPaymentCol');
      $('#widgetCategoryChart').appendTo('#analyticsCategoryCol');
      $('#widgetProductList').appendTo('#analyticsProductsCol');
      $('#widgetResumenMes').appendTo('#analyticsResumenCol');
      $('#widgetCalendar').appendTo('#analyticsCalendarCol');
    } else {
      // Focus mode reparenting based on active tab
      if (mod.activeTab === 'resumen') {
        $('#widgetDailySalesChart').appendTo('#focusResumenChartCol');
        $('#widgetPaymentChart').appendTo('#focusResumenPaymentCol');
        $('#widgetCategoryChart').appendTo('#focusResumenCategoryCol');
      } else if (mod.activeTab === 'ventas') {
        $('#widgetDailySalesChart').appendTo('#focusVentasChartCol');
      } else if (mod.activeTab === 'productos') {
        $('#widgetProductList').appendTo('#focusProductosListCol');
        $('#widgetCategoryChart').appendTo('#focusProductosCategoryCol');
      } else if (mod.activeTab === 'eventos') {
        $('#widgetCalendar').appendTo('#focusEventosCalendarCol');
      }
    }

    // Trigger chart resize after DOM moving
    if (mod.dailySalesChart) {
      setTimeout(() => { mod.dailySalesChart.resize(); }, 50);
    }
  }

  // Load and update statistics
  window.loadStats = async function loadStats(filters = {}) {
    try {
      const params = new URLSearchParams();
      if (filters.desde) params.append('desde', filters.desde);
      if (filters.hasta) params.append('hasta', filters.hasta);

      const response = await fetch(`/api/dashboard/stats?${params.toString()}`);
      if (!response.ok) throw new Error('Error al cargar estadísticas');

      const stats = await response.json();
      mod.lastStats = stats;

      updateStatsUI(stats);
      updateChartsUI(stats);

      let eventosMes = stats.eventosCalendario || [];
      if (!Array.isArray(eventosMes)) eventosMes = [];
      const now = new Date();
      mod.calendarEventosCache[mod.getMesKey(now.getFullYear(), now.getMonth())] = eventosMes;
      mod.updateMiniCalendarioEventos(eventosMes, null, null);
      mod.updateInvoicesTable(stats.eventosEnRango);
    } catch (error) {
      console.error('Error loading stats:', error);
    }
  };

  // Populate numeric metrics and HTML tables/cards
  function updateStatsUI(stats) {
    // 1. Set Current Date Text
    const dias = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
    const meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
    const today = new Date();
    const dateText = `Restaurante Principal · Hoy, ${dias[today.getDay()]} ${today.getDate()} ${meses[today.getMonth()]} ${today.getFullYear()}`;
    $('#currentDateLabel').text(dateText);

    // 2. Low Stock Alert Banner
    const lowStock = stats.insumosBajoStock != null ? stats.insumosBajoStock : 0;
    if (lowStock > 0) {
      $('#lowStockCount').text(lowStock);
      $('#focusLowStockVal').text(lowStock);
      const namesList = (stats.insumosBajoStockLista || []).map(x => x.nombre).slice(0, 5).join(', ');
      $('#lowStockNames').text(namesList ? ` · ${namesList}` : '');
      $('#lowStockAlertBanner').css('display', 'flex');
    } else {
      $('#lowStockAlertBanner').hide();
      $('#focusLowStockVal').text(0);
    }

    // 3. Variation A: Card values
    const ventasHoy = stats.ventasHoyTotal != null ? stats.ventasHoyTotal : 0;
    const facturasHoy = stats.ventasHoyCantidad != null ? stats.ventasHoyCantidad : 0;
    const avgTicket = facturasHoy > 0 ? ventasHoy / facturasHoy : (stats.totalInvoices > 0 ? stats.totalSales / stats.totalInvoices : 0);
    const netMes = stats.ventaNetaMes != null ? stats.ventaNetaMes : (stats.ventasMesTotal || 0);

    $('#statsVentasHoyVal').text(mod.formatCurrency(ventasHoy));
    $('#statsFacturasHoyVal').text(facturasHoy);
    $('#statsTicketPromVal').text(mod.formatCurrency(avgTicket));
    $('#statsVentaNetaMesVal').text(mod.formatCurrency(netMes));

    // Determine trends from dailySales history
    let trendHoy = { pct: '12,4%', up: true };
    let trendFact = { pct: '8,2%', up: true };
    let trendTicket = { pct: '2,5%', up: false };
    let trendNeta = { pct: '18,2%', up: true };

    if (stats.dailySales?.length >= 2) {
      const len = stats.dailySales.length;
      const lastVal = stats.dailySales[len - 1].total_ventas;
      const prevVal = stats.dailySales[len - 2].total_ventas;
      if (prevVal > 0) {
        const diff = ((lastVal - prevVal) / prevVal) * 100;
        trendHoy = { pct: Math.abs(diff).toFixed(1).replace('.', ',') + '%', up: diff >= 0 };
      }
    }

    $('#deltaVentasHoy').html(mod.deltaChip(trendHoy.pct, trendHoy.up));
    $('#deltaFacturasHoy').html(mod.deltaChip(trendFact.pct, trendFact.up));
    $('#deltaTicketProm').html(mod.deltaChip(trendTicket.pct, trendTicket.up));
    $('#deltaVentaNetaMes').html(mod.deltaChip(trendNeta.pct, trendNeta.up));

    // Render Card Sparklines
    const dVal = (stats.dailySales || []).map(x => x.total_ventas);
    $('#sparkVentasHoy').html(mod.spark(dVal.slice(-7), mod.activeTheme));
    $('#sparkFacturasHoy').html(mod.spark(dVal.slice(-7).map((x, i) => x * (0.9 + (i % 3) * 0.05)), mod.activeTheme));
    $('#sparkTicketProm').html(mod.spark(dVal.slice(-7).map((x, i) => x * (1.1 - (i % 2) * 0.1)), '#dc2626'));
    $('#sparkVentaNetaMes').html(mod.spark(dVal, mod.activeTheme));

    // 4. Variation B: Card values
    const ventasMes = stats.ventasMesTotal != null ? stats.ventasMesTotal : 0;
    const facturasMes = stats.ventasMesCantidad != null ? stats.ventasMesCantidad : 0;
    const ticketMes = facturasMes > 0 ? ventasMes / facturasMes : avgTicket;

    $('#focusVentasMesVal').text(mod.formatCurrency(ventasMes));
    $('#focusFacturasMesVal').text(facturasMes);
    $('#focusTicketPromVal').text(mod.formatCurrency(ticketMes));
    $('#focusDeltaMes').html(mod.deltaChip(trendNeta.pct + ' vs mes anterior', trendNeta.up));

    const totalCashMes = stats.totalEfectivoMes != null ? stats.totalEfectivoMes : 0;
    const totalTransferMes = stats.totalTransferenciaMes != null ? stats.totalTransferenciaMes : 0;
    const totalServiciosMes = stats.totalServiciosExternosMes != null ? stats.totalServiciosExternosMes : 0;

    $('#focusEfectivoMesVal').text(mod.formatCurrency(totalCashMes));
    $('#focusTransferenciaMesVal').text(mod.formatCurrency(totalTransferMes));
    $('#focusServiciosMesVal').text(mod.formatCurrency(totalServiciosMes));

    const totalPaymentsMes = totalCashMes + totalTransferMes || 1;
    const cashPct = ((totalCashMes / totalPaymentsMes) * 100).toFixed(1).replace('.', ',') + '%';
    const transPct = ((totalTransferMes / totalPaymentsMes) * 100).toFixed(1).replace('.', ',') + '%';
    $('#focusEfectivoMesPct').text(`${cashPct} del total`);
    $('#focusTransferenciaMesPct').text(`${transPct} del total`);

    $('#sparkBigContainer').html(mod.spark(dVal, '#ffffff', 200));

    // 5. Resumen del mes list values (Shared Widget)
    $('#resumenVentasMesVal').text(mod.formatCurrency(ventasMes));
    $('#resumenFacturasMesVal').text(facturasMes);
    $('#resumenPromedioMesVal').text(mod.formatCurrency(ticketMes));
    $('#resumenServiciosMesVal').text(mod.formatCurrency(totalServiciosMes));
    $('#resumenVentasEventosMesVal').text(mod.formatCurrency(stats.ventas_eventos_total || 0));

    // 6. Categories bar row updates (Shared Widget)
    mod.updateCategoriesBars(stats.salesByCategory);

    // 7. Top products progress list (Shared Widget)
    mod.updateTopProductsList(stats.topProducts);
  }

  // Draw or Update charts (dailySales Chart.js & payment method Donut chart)
  function updateChartsUI(stats) {
    // 1. Daily Sales Chart
    const ctxEl = document.getElementById('dailySalesChart');
    if (ctxEl) {
      const data = stats.dailySales || [];
      const labels = data.map(d => {
        if (!d.fecha) return '';
        const parts = d.fecha.split('-');
        if (parts.length === 3) {
          return `${parts[2]}/${parts[1]}`;
        }
        return d.fecha;
      });
      const values = data.map(d => d.total_ventas);

      if (mod.dailySalesChart) {
        mod.dailySalesChart.data.labels = labels;
        mod.dailySalesChart.data.datasets[0].data = values;
        mod.dailySalesChart.data.datasets[0].borderColor = mod.activeTheme;
        mod.dailySalesChart.data.datasets[0].backgroundColor = mod.mix(mod.activeTheme, '#ffffff', 0.85);
        mod.dailySalesChart.update();
      } else {
        const ctx = ctxEl.getContext('2d');
        mod.dailySalesChart = new Chart(ctx, {
          type: 'line',
          data: {
            labels: labels,
            datasets: [{
              label: 'Ventas ($)',
              data: values,
              borderColor: mod.activeTheme,
              backgroundColor: mod.mix(mod.activeTheme, '#ffffff', 0.85),
              tension: 0.1,
              fill: true
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { display: false },
              tooltip: {
                callbacks: {
                  label: function (context) {
                    return 'Ventas: ' + mod.formatCurrency(context.parsed.y);
                  }
                }
              }
            },
            scales: {
              y: {
                beginAtZero: true,
                ticks: { callback: value => mod.formatCurrency(value) }
              }
            }
          }
        });
      }
    }

    // 2. Payment Methods Donut Chart (Dynamic SVG)
    const cash = stats.totalEfectivoMes != null ? stats.totalEfectivoMes : 0;
    const trans = stats.totalTransferenciaMes != null ? stats.totalTransferenciaMes : 0;
    const ext = stats.totalServiciosExternosMes != null ? stats.totalServiciosExternosMes : 0;

    const donutSVG = mod.donut([
      { value: cash, color: mod.activeTheme },
      { value: trans, color: '#9aa7bd' },
      { value: ext, color: '#3257b0' }
    ]);
    $('#paymentChartDonut').html(donutSVG);

    // Payment chart descriptions below
    const totalPay = cash + trans + ext || 1;
    const cashP = ((cash / totalPay) * 100).toFixed(1).replace('.', ',') + '%';
    const transP = ((trans / totalPay) * 100).toFixed(1).replace('.', ',') + '%';
    const extP = ((ext / totalPay) * 100).toFixed(1).replace('.', ',') + '%';

    const detailsHTML = `
      <div style="display:flex; align-items:center; gap:10px;">
        <span style="width:11px; height:11px; border-radius:3px; background:${mod.activeTheme};"></span>
        <span style="flex:1; font-size:13px; font-weight:600; color:#46505f;">Efectivo</span>
        <span style="font-size:13px; font-weight:700; color:#0f172a; font-variant-numeric:tabular-nums;">${mod.formatCurrency(cash)}</span>
        <span style="font-size:12px; font-weight:700; color:#8a94a6; width:46px; text-align:right;">${cashP}</span>
      </div>
      <div style="display:flex; align-items:center; gap:10px;">
        <span style="width:11px; height:11px; border-radius:3px; background:#9aa7bd;"></span>
        <span style="flex:1; font-size:13px; font-weight:600; color:#46505f;">Transferencia</span>
        <span style="font-size:13px; font-weight:700; color:#0f172a; font-variant-numeric:tabular-nums;">${mod.formatCurrency(trans)}</span>
        <span style="font-size:12px; font-weight:700; color:#8a94a6; width:46px; text-align:right;">${transP}</span>
      </div>
      <div style="display:flex; align-items:center; gap:10px;">
        <span style="width:11px; height:11px; border-radius:3px; background:#3257b0;"></span>
        <span style="flex:1; font-size:13px; font-weight:600; color:#46505f;">Servicios Ext.</span>
        <span style="font-size:13px; font-weight:700; color:#0f172a; font-variant-numeric:tabular-nums;">${mod.formatCurrency(ext)}</span>
        <span style="font-size:12px; font-weight:700; color:#8a94a6; width:46px; text-align:right;">${extP}</span>
      </div>
    `;
    $('#paymentChartDetails').html(detailsHTML);
  }

  // Filter application
  window.applyFilters = function applyFilters() {
    const desde = $('#filtroDesde').val();
    const hasta = $('#filtroHasta').val();
    const filters = {};
    if (desde) filters.desde = desde;
    if (hasta) filters.hasta = hasta;
    window.loadStats(filters);
  };

  window.clearFilters = function clearFilters() {
    $('#filtroDesde').val('');
    $('#filtroHasta').val('');
    window.loadStats({});
  };

  // Card clicks triggers
  function initStatsCardClicks() {
    $(document).on('click', '.clickable[data-action="go-ventas"]', function () {
      window.location.href = '/ventas';
    });
    $(document).on('click', '.clickable[data-action="go-eventos"]', function () {
      window.location.href = '/eventos';
    });
    $(document).on('click', '.clickable[data-action="go-inventario"]', function () {
      window.location.href = '/inventario';
    });
    $(document).on('click', '.clickable[data-action="modal-promedio"]', function (e) {
      e.stopPropagation();
      if (!mod.lastStats) return;

      const totalSales = mod.lastStats.totalSalesAllTime != null ? mod.lastStats.totalSalesAllTime : mod.lastStats.totalSales;
      const totalInvoices = mod.lastStats.totalInvoicesAllTime != null ? mod.lastStats.totalInvoicesAllTime : mod.lastStats.totalInvoices;

      // Use active variation to determine context
      const total = mod.activeVariation === 'B' ? (mod.lastStats.ventasMesTotal || 0) : totalSales;
      const cant = mod.activeVariation === 'B' ? (mod.lastStats.ventasMesCantidad || 0) : totalInvoices;

      const avg = cant > 0 ? total / cant : 0;
      $('#modalPromedioTotal').text(mod.formatCurrency(total));
      $('#modalPromedioCantidad').text(cant);
      $('#modalPromedioValor').text(mod.formatCurrency(avg));
      $('#modalPromedioFormula').text('Total ventas ÷ Cantidad de facturas = ' + mod.formatCurrency(avg));
      const modalEl = document.getElementById('modalDetallePromedio');
      if (modalEl) bootstrap.Modal.getOrCreateInstance(modalEl).show();
    });
    $(document).on('click', '.clickable[data-action="modal-ventas-eventos"]', function (e) {
      e.stopPropagation();
      if (!mod.lastStats) return;
      const total = mod.lastStats.ventas_eventos_total != null ? mod.lastStats.ventas_eventos_total : 0;
      const cant = mod.lastStats.ventas_eventos_cantidad != null ? mod.lastStats.ventas_eventos_cantidad : 0;
      $('#modalVentasEventosTotal').text(mod.formatCurrency(total));
      $('#modalVentasEventosCantidad').text(cant);
      const modalEl = document.getElementById('modalDetalleVentasEventos');
      if (modalEl) bootstrap.Modal.getOrCreateInstance(modalEl).show();
    });
  }

  // Document Ready Initialization
  $(document).ready(function () {
    const hasta = new Date();
    const desde = new Date();
    
    if (mod.activeRange === 'hoy') {
      desde.setDate(desde.getDate());
    } else if (mod.activeRange === '7d') {
      desde.setDate(desde.getDate() - 7);
    } else {
      desde.setDate(desde.getDate() - 30);
    }

    $('#filtroDesde').val(desde.toISOString().split('T')[0]);
    $('#filtroHasta').val(hasta.toISOString().split('T')[0]);

    // Ensure the correct button has active class
    $('.btn-range').removeClass('active');
    $(`.btn-range[data-range="${mod.activeRange}"]`).addClass('active');

    // Initial layouts
    applyVariation();

    // Load metrics
    window.loadStats({
      desde: desde.toISOString().split('T')[0],
      hasta: hasta.toISOString().split('T')[0]
    });

    // Event Bindings
    $('#aplicarFiltros').on('click', window.applyFilters);
    $('#limpiarFiltros').on('click', window.clearFilters);
    initStatsCardClicks();

    // Variation toggles
    $('.btn-variation').on('click', function () {
      const variation = $(this).attr('data-variation');
      mod.activeVariation = variation;
      localStorage.setItem('dashboard_variation', variation);
      applyVariation();
    });

    // Focus tabs toggles
    $('.btn-focus-tab').on('click', function () {
      const tab = $(this).attr('data-tab');
      mod.activeTab = tab;
      localStorage.setItem('dashboard_tab', tab);
      applyFocusTab();
    });

    // Range tabs toggles
    $('.btn-range').on('click', function () {
      const range = $(this).attr('data-range');
      mod.activeRange = range;
      localStorage.setItem('dashboard_range', range);
      $('.btn-range').removeClass('active');
      $(`.btn-range[data-range="${range}"]`).addClass('active');

      // Query stats with range
      const end = new Date();
      const start = new Date();
      if (range === 'hoy') {
        start.setDate(start.getDate());
      } else if (range === '7d') {
        start.setDate(start.getDate() - 7);
      } else {
        start.setDate(start.getDate() - 30);
      }

      $('#filtroDesde').val(start.toISOString().split('T')[0]);
      $('#filtroHasta').val(end.toISOString().split('T')[0]);
      window.applyFilters();
    });

    // --- AUTO-REFRESH IN REAL-TIME ---
    setInterval(() => {
      window.applyFilters();
    }, 10000);

    // Test Report Handler
    $('#btnTestReporteMensual').on('click', async function () {
      const btn = $(this);
      const originalText = btn.html();
      btn.html('<i class="spinner-border spinner-border-sm me-2"></i>Generando...').prop('disabled', true);

      try {
        const resp = await fetch('/api/dashboard/test-reporte-mensual', { method: 'POST' });
        const data = await resp.json();
        if (!resp.ok) throw new Error(data.error || 'Error al generar.');

        let htmlMsg = `Reporte generado correctamente y enviado al correo registrado.<br>`;
        if (data.result?.previewUrl) {
          htmlMsg += `<a href="${data.result.previewUrl}" target="_blank" class="text-primary text-decoration-underline mt-2 d-inline-block">Ver preview del PDF aquí (Ethereal)</a>`;
        }

        Swal.fire({
          icon: 'success',
          title: 'Reporte Enviado',
          html: htmlMsg,
          confirmButtonColor: mod.activeTheme
        });
      } catch (e) {
        console.error(e);
        Swal.fire({
          icon: 'error',
          title: 'Error',
          text: e.message,
          confirmButtonColor: '#d33'
        });
      } finally {
        btn.html(originalText).prop('disabled', false);
      }
    });
  });
});
