// Rendering and DOM event listeners for Dashboard module

$(function () {
  const mod = window.DashboardModule;

  window.loadStats = async function loadStats(filters = {}) {
    try {
      const params = new URLSearchParams();
      if (filters.desde) params.append('desde', filters.desde);
      if (filters.hasta) params.append('hasta', filters.hasta);

      const response = await fetch(`/api/dashboard/stats?${params.toString()}`);
      if (!response.ok) throw new Error('Error al cargar estadísticas');

      const stats = await response.json();
      updateStatsCards(stats);
      updateCharts(stats);
      var eventosMes = stats.eventosCalendario || [];
      if (!Array.isArray(eventosMes)) eventosMes = [];
      var now = new Date();
      mod.calendarEventosCache[mod.getMesKey(now.getFullYear(), now.getMonth())] = eventosMes;
      updateMiniCalendarioEventos(eventosMes, null, null);
      updateTopProductsByCategoryTable(stats.topProductsByCategory);
    } catch (error) {
      console.error('Error:', error);
      updateStatsCards({
        ventasHoyTotal: 0,
        ventasHoyCantidad: 0,
        ventasMesTotal: 0,
        ventasMesCantidad: 0,
        totalSales: 0,
        totalInvoices: 0,
        avgInvoice: 0,
        insumosBajoStock: mod.lastStats?.insumosBajoStock ?? 0,
        dailySales: [],
        ventasEnEventos: mod.lastStats?.ventasEnEventos ?? 0,
        ventasNoEventos: mod.lastStats?.ventasNoEventos ?? 0,
        salesByCategory: mod.lastStats?.salesByCategory ?? [],
        topProductsByCategory: mod.lastStats?.topProductsByCategory ?? [],
        eventosCalendario: mod.lastStats?.eventosCalendario ?? []
      });
    }
  };

  function updateStatsCards(stats) {
    mod.lastStats = stats;
    $('#ventasHoyTotal').text(mod.formatCurrency(stats.ventasHoyTotal != null ? stats.ventasHoyTotal : 0));
    $('#ventasHoyCantidad').text(stats.ventasHoyCantidad != null ? stats.ventasHoyCantidad : 0);
    $('#ventasMesTotal').text(mod.formatCurrency(stats.ventasMesTotal != null ? stats.ventasMesTotal : 0));
    $('#ventasMesCantidad').text(stats.ventasMesCantidad != null ? stats.ventasMesCantidad : 0);
    $('#totalSales').text(mod.formatCurrency(stats.totalSalesAllTime != null ? stats.totalSalesAllTime : stats.totalSales));
    $('#totalInvoices').text(stats.totalInvoicesAllTime != null ? stats.totalInvoicesAllTime : stats.totalInvoices);

    const totalSalesVal = stats.totalSalesAllTime != null ? stats.totalSalesAllTime : stats.totalSales;
    const totalInvoicesVal = stats.totalInvoicesAllTime != null ? stats.totalInvoicesAllTime : stats.totalInvoices;

    const avgInvoice = totalInvoicesVal > 0 ? totalSalesVal / totalInvoicesVal : 0;
    $('#avgInvoice').text(mod.formatCurrency(avgInvoice));

    if (stats.topProducts && $('#uniqueProducts').length) $('#uniqueProducts').text(stats.topProducts.length);
    const eventosDelMes = (stats.eventosCalendario || []).length;
    $('#eventosCount').text(eventosDelMes);
    $('#ventasEventosTotal').text(mod.formatCurrency(stats.ventas_eventos_total != null ? stats.ventas_eventos_total : 0));
    const insumosBajo = stats.insumosBajoStock != null ? stats.insumosBajoStock : 0;
    $('#insumosBajoStock').text(insumosBajo);

    $('#totalCash').text(mod.formatCurrency(stats.totalEfectivoAllTime != null ? stats.totalEfectivoAllTime : 0));
    $('#totalTransfer').text(mod.formatCurrency(stats.totalTransferenciaAllTime != null ? stats.totalTransferenciaAllTime : 0));
    $('#totalExternal').text(mod.formatCurrency(stats.totalServiciosExternosAllTime != null ? stats.totalServiciosExternosAllTime : 0));
    $('#totalNet').text(mod.formatCurrency(stats.ventaNetaAllTime != null ? stats.ventaNetaAllTime : 0));

    // Nuevas tarjetas mensuales
    $('#totalCashMes').text(mod.formatCurrency(stats.totalEfectivoMes != null ? stats.totalEfectivoMes : 0));
    $('#totalTransferMes').text(mod.formatCurrency(stats.totalTransferenciaMes != null ? stats.totalTransferenciaMes : 0));
  }

  function updateCharts(stats) {
    updateDailySalesChart(stats.dailySales);
    updateVentasEnEventosChart(stats.ventasPorEvento || []);
    updateSalesByCategoryChart(stats.salesByCategory);
    updateTopProductsChart(stats.topProducts);
  }

  function updateDailySalesChart(data) {
    const ctxEl = document.getElementById('dailySalesChart');
    if (!ctxEl) return;
    const ctx = ctxEl.getContext('2d');
    if (mod.dailySalesChart) mod.dailySalesChart.destroy();

    mod.dailySalesChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: data.map(d => {
          const date = new Date(d.fecha);
          return date.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' });
        }),
        datasets: [{
          label: 'Ventas ($)',
          data: data.map(d => d.total_ventas),
          borderColor: 'rgb(75, 192, 192)',
          backgroundColor: 'rgba(75, 192, 192, 0.2)',
          tension: 0.1,
          fill: true
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: true },
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

  function updateVentasEnEventosChart(data) {
    const ctx = document.getElementById('ventasEnEventosChart');
    if (!ctx) return;
    if (mod.ventasEnEventosChart) mod.ventasEnEventosChart.destroy();

    const labels = (data && data.length > 0)
      ? data.map(d => (d.evento_nombre || '').length > 18 ? (d.evento_nombre || '').substring(0, 18) + '…' : (d.evento_nombre || ''))
      : ['Sin ventas en eventos'];
    const values = (data && data.length > 0) ? data.map(d => d.total_ventas) : [0];

    mod.ventasEnEventosChart = new Chart(ctx.getContext('2d'), {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: 'Ventas ($)',
          data: values,
          backgroundColor: 'rgba(253, 126, 20, 0.8)',
          borderColor: 'rgba(229, 89, 12, 1)',
          borderWidth: 1
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: function (context) {
                return 'Ventas: ' + mod.formatCurrency(context.parsed.x);
              }
            }
          }
        },
        scales: {
          x: {
            beginAtZero: true,
            ticks: { callback: value => mod.formatCurrency(value) }
          }
        }
      }
    });
  }

  function fetchCalendarMonth(year, month) {
    const mesParam = mod.getMesKey(year, month);
    if (mod.calendarEventosCache[mesParam] !== undefined) {
      updateMiniCalendarioEventos(mod.calendarEventosCache[mesParam], year, month);
      return;
    }
    fetch('/api/dashboard/eventos-calendario?mes=' + mesParam, { credentials: 'same-origin' })
      .then(function (r) { return r.ok ? r.json() : Promise.reject(new Error('Error al cargar eventos')); })
      .then(function (data) {
        var list = data.eventosCalendario || data.eventos || [];
        if (!Array.isArray(list)) list = [];
        mod.calendarEventosCache[mesParam] = list;
        updateMiniCalendarioEventos(list, year, month);
      })
      .catch(function () {
        updateMiniCalendarioEventos([], year, month);
      });
  }

  function updateMiniCalendarioEventos(eventosCalendario, year, month) {
    const container = document.getElementById('miniCalendarioEventos');
    if (!container) return;

    if (!Array.isArray(eventosCalendario)) eventosCalendario = [];
    const now = new Date();
    if (year == null) year = now.getFullYear();
    if (month == null) month = now.getMonth();
    mod.calendarViewYear = year;
    mod.calendarViewMonth = month;

    const eventosMap = mod.fechasConEventoMap(eventosCalendario);
    const hoy = mod.dateToKey(now);

    const first = new Date(year, month, 1);
    const last = new Date(year, month + 1, 0);
    const daysInMonth = last.getDate();
    const startDay = first.getDay();
    const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

    let html = '<div class="mini-calendario-nav">';
    html += '<button type="button" class="btn btn-outline-secondary btn-sm" id="calPrevMonth" title="Mes anterior"><i class="bi bi-chevron-left"></i></button>';
    html += '<span class="mes-titulo">' + monthNames[month] + ' ' + year + '</span>';
    html += '<button type="button" class="btn btn-outline-secondary btn-sm" id="calNextMonth" title="Mes siguiente"><i class="bi bi-chevron-right"></i></button>';
    html += '</div>';
    html += '<table class="mini-calendario table table-bordered mb-0"><thead><tr>';
    html += '<th>Do</th><th>Lu</th><th>Ma</th><th>Mi</th><th>Ju</th><th>Vi</th><th>Sá</th></tr></thead><tbody><tr>';

    for (let i = 0; i < startDay; i++) html += '<td></td>';
    let cellCount = startDay;
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = year + '-' + String(month + 1).padStart(2, '0') + '-' + String(day).padStart(2, '0');
      const nombres = eventosMap.get(dateStr) || [];
      const hasEvent = nombres.length > 0;
      const isToday = dateStr === hoy;
      let cls = '';
      if (hasEvent) cls += ' dia-evento';
      if (isToday) cls += ' dia-hoy';
      const titulo = hasEvent ? ('Evento' + (nombres.length > 1 ? 's' : '') + ': ' + nombres.join(', ')) : '';
      const attrTooltip = titulo ? ' data-bs-toggle="tooltip" data-bs-placement="top" data-bs-title="' + titulo.replace(/"/g, '&quot;') + '" title="' + titulo.replace(/"/g, '&quot;') + '"' : '';
      html += '<td class="' + cls.trim() + '"' + attrTooltip + '>' + day + '</td>';
      cellCount++;
      if (cellCount % 7 === 0 && day < daysInMonth) html += '</tr><tr>';
    }
    var rest = 7 - (cellCount % 7);
    if (rest < 7) for (let i = 0; i < rest; i++) html += '<td></td>';
    html += '</tr></tbody></table>';
    container.innerHTML = html;

    var tooltipTriggerList = container.querySelectorAll('[data-bs-toggle="tooltip"]');
    tooltipTriggerList.forEach(function (el) {
      new bootstrap.Tooltip(el, { trigger: 'hover click' });
    });

    document.getElementById('calPrevMonth').addEventListener('click', function () {
      var m = mod.calendarViewMonth - 1;
      var y = mod.calendarViewYear;
      if (m < 0) { m = 11; y--; }
      fetchCalendarMonth(y, m);
    });
    document.getElementById('calNextMonth').addEventListener('click', function () {
      var m = mod.calendarViewMonth + 1;
      var y = mod.calendarViewYear;
      if (m > 11) { m = 0; y++; }
      fetchCalendarMonth(y, m);
    });
  }

  function updateSalesByCategoryChart(data) {
    const ctxEl = document.getElementById('salesByCategoryChart');
    if (!ctxEl) return;
    const ctx = ctxEl.getContext('2d');
    if (mod.salesByCategoryChart) mod.salesByCategoryChart.destroy();

    mod.salesByCategoryChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: data.map(d => d.categoria_nombre),
        datasets: [{
          label: 'Ventas ($)',
          data: data.map(d => d.total_ventas),
          backgroundColor: 'rgba(75, 192, 192, 0.8)',
          borderColor: 'rgba(75, 192, 192, 1)',
          borderWidth: 1
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

  function updateTopProductsChart(data) {
    const ctxEl = document.getElementById('topProductsChart');
    if (!ctxEl) return;
    const ctx = ctxEl.getContext('2d');
    if (mod.topProductsChart) mod.topProductsChart.destroy();

    const top10 = data.slice(0, 10);

    mod.topProductsChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: top10.map(p => p.nombre.length > 20 ? p.nombre.substring(0, 20) + '...' : p.nombre),
        datasets: [{
          label: 'Ventas ($)',
          data: top10.map(p => p.total_ventas),
          backgroundColor: 'rgba(153, 102, 255, 0.8)',
          borderColor: 'rgba(153, 102, 255, 1)',
          borderWidth: 1
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: function (context) {
                return 'Ventas: ' + mod.formatCurrency(context.parsed.x);
              }
            }
          }
        },
        scales: {
          x: {
            beginAtZero: true,
            ticks: { callback: value => mod.formatCurrency(value) }
          }
        }
      }
    });
  }

  function updateTopProductsByCategoryTable(data) {
    if (!data || data.length === 0) {
      $('#topProductsByCategoryTable').html('<p class="text-muted">No hay datos disponibles</p>');
      return;
    }

    let html = '';
    data.forEach(categoria => {
      if (categoria.productos && categoria.productos.length > 0) {
        html += `
          <div class="mb-4">
            <h5 class="mb-3">
              <i class="bi bi-tag-fill me-2"></i>
              ${categoria.categoria_nombre}
            </h5>
            <div class="table-responsive">
              <table class="table table-hover">
                <thead class="table-light">
                  <tr>
                    <th>Producto</th>
                    <th>Código</th>
                    <th class="text-end">Cantidad Vendida</th>
                    <th class="text-end">Total Ventas</th>
                  </tr>
                </thead>
                <tbody>
        `;
        categoria.productos.forEach(producto => {
          html += `
            <tr>
              <td>${producto.producto_nombre}</td>
              <td><span class="badge bg-secondary">${producto.codigo}</span></td>
              <td class="text-end">${producto.total_cantidad.toFixed(2)}</td>
              <td class="text-end"><strong>${mod.formatCurrency(producto.total_ventas)}</strong></td>
            </tr>
          `;
        });
        html += `
                </tbody>
              </table>
            </div>
          </div>
        `;
      }
    });

    $('#topProductsByCategoryTable').html(html || '<p class="text-muted">No hay datos disponibles</p>');
  }

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

  function initStatsCardClicks() {
    $(document).on('click', '.stat-card.clickable[data-action="go-ventas"]', function () {
      window.location.href = '/ventas';
    });
    $(document).on('click', '.stat-card.clickable[data-action="go-eventos"]', function () {
      window.location.href = '/eventos';
    });
    $(document).on('click', '.stat-card.clickable[data-action="go-inventario"]', function () {
      window.location.href = '/inventario';
    });
    $(document).on('click', '.stat-card.clickable[data-action="modal-promedio"]', function () {
      if (!mod.lastStats) return;
      var total = mod.lastStats.totalSales != null ? mod.lastStats.totalSales : 0;
      var cant = mod.lastStats.totalInvoices != null ? mod.lastStats.totalInvoices : 0;
      var avg = cant > 0 ? total / cant : 0;
      $('#modalPromedioTotal').text(mod.formatCurrency(total));
      $('#modalPromedioCantidad').text(cant);
      $('#modalPromedioValor').text(mod.formatCurrency(avg));
      $('#modalPromedioFormula').text('Total ventas ÷ Cantidad de facturas = ' + mod.formatCurrency(avg));
      var modalEl = document.getElementById('modalDetallePromedio');
      if (modalEl) bootstrap.Modal.getOrCreateInstance(modalEl).show();
    });
    $(document).on('click', '.stat-card.clickable[data-action="modal-ventas-eventos"]', function () {
      if (!mod.lastStats) return;
      var total = mod.lastStats.ventas_eventos_total != null ? mod.lastStats.ventas_eventos_total : 0;
      var cant = mod.lastStats.ventas_eventos_cantidad != null ? mod.lastStats.ventas_eventos_cantidad : 0;
      $('#modalVentasEventosTotal').text(mod.formatCurrency(total));
      $('#modalVentasEventosCantidad').text(cant);
      var modalEl = document.getElementById('modalDetalleVentasEventos');
      if (modalEl) bootstrap.Modal.getOrCreateInstance(modalEl).show();
    });
  }

  $(document).ready(function () {
    const hasta = new Date();
    const desde = new Date();
    desde.setDate(desde.getDate() - 30);

    $('#filtroDesde').val(desde.toISOString().split('T')[0]);
    $('#filtroHasta').val(hasta.toISOString().split('T')[0]);

    window.loadStats({
      desde: desde.toISOString().split('T')[0],
      hasta: hasta.toISOString().split('T')[0]
    });

    $('#aplicarFiltros').on('click', window.applyFilters);
    $('#limpiarFiltros').on('click', window.clearFilters);
    initStatsCardClicks();

    $('#btnTestReporteMensual').on('click', async function () {
      const btn = $(this);
      const originalText = btn.html();
      btn.html('<i class="spinner-border spinner-border-sm me-2"></i>Generando...').prop('disabled', true);

      try {
        const resp = await fetch('/api/dashboard/test-reporte-mensual', { method: 'POST' });
        const data = await resp.json();
        if (!resp.ok) throw new Error(data.error || 'Error al generar.');

        let htmlMsg = `Reporte generado correctamente y enviado al correo registrado.<br>`;
        if (data.result && data.result.previewUrl) {
          htmlMsg += `<a href="${data.result.previewUrl}" target="_blank" class="text-primary text-decoration-underline mt-2 d-inline-block">Ver preview del PDF aquí (Ethereal)</a>`;
        }

        Swal.fire({
          icon: 'success',
          title: 'Reporte Enviado',
          html: htmlMsg,
          confirmButtonColor: '#198754'
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
