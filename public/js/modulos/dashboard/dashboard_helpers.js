// Rendering helpers and SVG generators for GastroFlow Dashboard
$(function () {
  const mod = window.DashboardModule;

  // CSS Color Mixing Helpers
  function hx(h) {
    h = h.replace('#', '');
    if (h.length === 3) h = h.split('').map(c => c + c).join('');
    return [Number.parseInt(h.slice(0, 2), 16), Number.parseInt(h.slice(2, 4), 16), Number.parseInt(h.slice(4, 6), 16)];
  }

  function toHex(a) {
    return '#' + a.map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
  }

  mod.mix = function (a, b, t) {
    const A = hx(a), B = hx(b);
    return toHex([0, 1, 2].map(i => A[i] + (B[i] - A[i]) * t));
  };

  // Sparkline Curve Smooth Generator
  mod.smooth = function (pts) {
    if (!pts || pts.length === 0) return '';
    let d = 'M' + pts[0][0] + ' ' + pts[0][1];
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
      const c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6;
      const c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6;
      d += ' C' + c1x + ' ' + c1y + ' ' + c2x + ' ' + c2y + ' ' + p2[0] + ' ' + p2[1];
    }
    return d;
  };

  // Sparkline Generator (Dynamic SVG)
  let sparkUid = 0;
  mod.spark = function (values, color, w = 108) {
    if (!values || !Array.isArray(values)) {
      values = [0, 0, 0];
    }
    values = values.map(v => {
      const num = Number(v);
      return Number.isNaN(num) ? 0 : num;
    });

    const len = values.length;
    if (len === 0) {
      values = [0, 0, 0];
    } else if (len === 1) {
      values = [values[0], values[0], values[0]];
    }

    const H = 36;
    const max = Math.max(...values), min = Math.min(...values);
    const range = max - min || 1;
    const pts = values.map((v, i) => [
      i / (values.length - 1) * w,
      H - 3 - ((v - min) / range) * (H - 8)
    ]);
    const line = this.smooth(pts);
    const area = line + ' L' + w + ' ' + H + ' L0 ' + H + ' Z';
    const id = 'spark_grad_' + (sparkUid++);

    return `
      <svg viewBox="0 0 ${w} ${H}" style="width:${w}px; height:${H}px; display:block; overflow:visible;">
        <defs>
          <linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="${color}" stop-opacity="0.32" />
            <stop offset="100%" stop-color="${color}" stop-opacity="0.02" />
          </linearGradient>
        </defs>
        <path d="${area}" fill="url(#${id})" />
        <path d="${line}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    `;
  };

  // Donut Chart Generator (Dynamic SVG)
  mod.donut = function (parts) {
    if (!parts || parts.length === 0) return '';
    const total = parts.reduce((s, p) => s + p.value, 0);
    const r = 54, cx = 70, cy = 70, sw = 20, C = 2 * Math.PI * r;
    let off = 0;

    const segs = parts.map((p, i) => {
      const len = total > 0 ? (p.value / total) * C : 0;
      const strokeDash = `${len} ${C - len}`;
      const strokeOffset = -off;
      off += len;
      return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${p.color}" stroke-width="${sw}" stroke-dasharray="${strokeDash}" stroke-dashoffset="${strokeOffset}" transform="rotate(-90 ${cx} ${cy})" />`;
    }).join('');

    const totalShort = this.formatCurrency(total);

    return `
      <svg viewBox="0 0 140 140" style="width:140px; height:140px; display:block;">
        <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#eef1f4" stroke-width="${sw}" />
        ${segs}
        <text x="${cx}" y="${cy - 3}" text-anchor="middle" style="font-size:12px; font-weight:800; fill:#0f172a; font-family:inherit;">${totalShort}</text>
        <text x="${cx}" y="${cy + 13}" text-anchor="middle" style="font-size:8px; font-weight:700; fill:#8a94a6; font-family:inherit;">Total mes</text>
      </svg>
    `;
  };

  // Delta Pill Badge Builder
  mod.deltaChip = function (txt, up) {
    return `
      <span style="display:inline-flex; align-items:center; gap:4px; padding:3px 9px; border-radius:8px; font-size:12.5px; font-weight:700; background:${up ? '#e7f6ec' : '#fdecec'}; color:${up ? '#15803d' : '#dc2626'};">
        <i class="bi ${up ? 'bi-arrow-up-right' : 'bi-arrow-down-right'}" style="font-size:11px;"></i> ${txt}
      </span>
    `;
  };

  // Category Progress bars row updates
  mod.updateCategoriesBars = function (cats) {
    if (!cats || cats.length === 0) {
      $('#categoryChartBars').html('<p class="text-muted small py-2">No hay ventas registradas</p>');
      return;
    }
    const maxVal = Math.max(...cats.map(c => c.total_ventas || 0)) || 1;
    let html = '<div style="display:flex; flex-direction:column; gap:15px;">';
    cats.slice(0, 5).forEach(c => {
      const val = c.total_ventas || 0;
      const pct = (val / maxVal) * 100;
      const barColor = this.mix(this.activeTheme, '#ffffff', 0.18);
      html += `
        <div style="display:flex; flex-direction:column; gap:7px;">
          <div style="display:flex; justify-content:space-between; font-size:13px;">
            <span style="font-weight:600; color:#3a4453;">${c.categoria_nombre}</span>
            <span style="font-weight:700; color:#0f172a; font-variant-numeric:tabular-nums;">${this.formatCurrency(val)}</span>
          </div>
          <div style="height:10px; background:#f0f2f5; border-radius:6px; overflow:hidden;">
            <div class="category-progress-bar" style="height:100%; width:${pct}%; border-radius:6px; background:linear-gradient(90deg, ${barColor}, ${this.activeTheme});"></div>
          </div>
        </div>
      `;
    });
    html += '</div>';
    $('#categoryChartBars').html(html);
  };

  // Top products list builder
  mod.updateTopProductsList = function (prods) {
    if (!prods || prods.length === 0) {
      $('#productListItems').html('<p class="text-muted small py-2">Sin productos vendidos</p>');
      return;
    }
    const maxVal = Math.max(...prods.map(p => p.total_ventas || 0)) || 1;
    let html = '<div style="display:flex; flex-direction:column;">';
    prods.slice(0, 6).forEach((p, idx) => {
      const val = p.total_ventas || 0;
      const qty = p.total_cantidad || 0;
      const pct = (val / maxVal) * 100;
      const rankBg = idx < 3 ? this.mix(this.activeTheme, '#ffffff', 0.85) : '#f1f3f6';
      const rankColor = idx < 3 ? this.activeTheme : '#8a94a6';

      html += `
        <div style="display:flex; align-items:center; gap:12px; padding:10px 0; border-bottom:${idx < 5 ? '1px solid #f1f3f6' : 'none'};">
          <span style="width:23px; height:23px; flex:0 0 23px; border-radius:7px; background:${rankBg}; color:${rankColor}; font-size:12px; font-weight:800; display:flex; align-items:center; justify-content:center;">${idx + 1}</span>
          <div style="flex:1; min-width:0;">
            <div style="display:flex; justify-content:space-between; gap:8px; margin-bottom:6px;">
              <span style="font-size:13.5px; font-weight:600; color:#1e2733; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${p.nombre}</span>
              <span style="font-size:13px; font-weight:700; color:#0f172a; font-variant-numeric:tabular-nums; white-space:nowrap;">${this.formatCurrency(val)}</span>
            </div>
            <div style="height:6px; background:#f0f2f5; border-radius:6px; overflow:hidden;">
              <div style="height:100%; width:${pct}%; background:${this.activeTheme}; border-radius:6px;"></div>
            </div>
          </div>
          <span style="font-size:12px; font-weight:600; color:#8a94a6; white-space:nowrap;">${qty} u.</span>
        </div>
      `;
    });
    html += '</div>';
    $('#productListItems').html(html);
  };

  // Mini-Calendar Generator
  mod.updateMiniCalendarioEventos = function (eventosCalendario, year, month) {
    const container = document.getElementById('miniCalendarioEventos');
    if (!container) return;

    if (!Array.isArray(eventosCalendario)) eventosCalendario = [];
    const now = new Date();
    if (year == null) year = now.getFullYear();
    if (month == null) month = now.getMonth();
    this.calendarViewYear = year;
    this.calendarViewMonth = month;

    const eventosMap = this.fechasConEventoMap(eventosCalendario);
    const hoy = this.dateToKey(now);

    const first = new Date(year, month, 1);
    const last = new Date(year, month + 1, 0);
    const daysInMonth = last.getDate();
    const startDay = first.getDay();
    const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

    $('#eventosMesLabel').text(`${eventosCalendario.length} eventos`);
    $('#calendarEventosCountLabel').text(`${eventosCalendario.length} eventos`);

    let html = '<div class="mini-calendario-nav">';
    html += '<button type="button" class="btn btn-outline-secondary btn-sm" id="calPrevMonth" title="Mes anterior" style="border-radius:8px;"><i class="bi bi-chevron-left"></i></button>';
    html += '<span class="mes-titulo fw-bold" style="font-size:14px;">' + monthNames[month] + ' ' + year + '</span>';
    html += '<button type="button" class="btn btn-outline-secondary btn-sm" id="calNextMonth" title="Mes siguiente" style="border-radius:8px;"><i class="bi bi-chevron-right"></i></button>';
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
      const attrTooltip = titulo ? ' data-bs-toggle="tooltip" data-bs-placement="top" data-bs-title="' + titulo.replaceAll('"', '&quot;') + '" title="' + titulo.replaceAll('"', '&quot;') + '"' : '';

      let style = '';
      if (isToday) {
        style = 'background:var(--accent) !important; color:#fff !important; font-weight:700;';
      } else if (hasEvent) {
        const evBg = this.mix(this.activeTheme, '#ffffff', 0.87);
        const evBorder = this.mix(this.activeTheme, '#ffffff', 0.6);
        style = `background:${evBg} !important; color:var(--accent) !important; font-weight:700; border:1px solid ${evBorder} !important; cursor:pointer;`;
      }

      html += `<td class="${cls.trim()}" ${attrTooltip} style="${style}">${day}</td>`;
      cellCount++;
      if (cellCount % 7 === 0 && day < daysInMonth) html += '</tr><tr>';
    }
    const rest = 7 - (cellCount % 7);
    if (rest < 7) for (let i = 0; i < rest; i++) html += '<td></td>';
    html += '</tr></tbody></table>';
    container.innerHTML = html;

    const tooltipTriggerList = container.querySelectorAll('[data-bs-toggle="tooltip"]');
    tooltipTriggerList.forEach(function (el) {
      new bootstrap.Tooltip(el, { trigger: 'hover click' });
    });

    const self = this;
    document.getElementById('calPrevMonth').addEventListener('click', function () {
      let m = self.calendarViewMonth - 1;
      let y = self.calendarViewYear;
      if (m < 0) { m = 11; y--; }
      self.fetchCalendarMonth(y, m);
    });
    document.getElementById('calNextMonth').addEventListener('click', function () {
      let m = self.calendarViewMonth + 1;
      let y = self.calendarViewYear;
      if (m > 11) { m = 0; y++; }
      self.fetchCalendarMonth(y, m);
    });
  };

  // Calendar month fetcher
  mod.fetchCalendarMonth = function (year, month) {
    const mesParam = this.getMesKey(year, month);
    if (this.calendarEventosCache[mesParam] !== undefined) {
      this.updateMiniCalendarioEventos(this.calendarEventosCache[mesParam], year, month);
      return;
    }
    const self = this;
    fetch('/api/dashboard/eventos-calendario?mes=' + mesParam, { credentials: 'same-origin' })
      .then(function (r) {
        if (!r.ok) throw new Error('Error al cargar eventos');
        return r.json();
      })
      .then(function (data) {
        let list = data.eventosCalendario || data.eventos || [];
        if (!Array.isArray(list)) list = [];
        self.calendarEventosCache[mesParam] = list;
        self.updateMiniCalendarioEventos(list, year, month);
      })
      .catch(function () {
        self.updateMiniCalendarioEventos([], year, month);
      });
  };

  // Invoices table list and Event tab event lists
  mod.updateInvoicesTable = function (events) {
    if (!events || events.length === 0) {
      $('#invoicesListContainer').html('<p class="text-muted small py-2">Sin transacciones recientes</p>');
      return;
    }
    let html = `
      <div class="table-responsive">
        <table class="table table-hover align-middle mb-0" style="font-size: 13.5px;">
          <thead class="table-light">
            <tr>
              <th>Evento / Actividad</th>
              <th>Fecha Inicio</th>
              <th>Fecha Fin</th>
              <th class="text-end">Presupuesto / Ventas</th>
            </tr>
          </thead>
          <tbody>
    `;
    events.slice(0, 8).forEach(r => {
      const budget = r.presupuesto != null ? r.presupuesto : 0;
      html += `
        <tr>
          <td><span class="fw-bold">${r.nombre}</span><br><span class="text-muted small">${r.descripcion || 'Sin descripción'}</span></td>
          <td>${r.fecha_inicio ? r.fecha_inicio.split('T')[0] : 'N/D'}</td>
          <td>${r.fecha_fin ? r.fecha_fin.split('T')[0] : 'N/D'}</td>
          <td class="text-end fw-bold">${this.formatCurrency(budget)}</td>
        </tr>
      `;
    });
    html += `
          </tbody>
        </table>
      </div>
    `;
    $('#invoicesListContainer').html(html);

    // Render Eventos tab events list:
    let evHtml = '<div style="display:flex; flex-direction:column; gap:10px;">';
    events.slice(0, 5).forEach(e => {
      const start = new Date(e.fecha_inicio);
      const day = start.getDate() || 1;
      const budget = e.presupuesto != null ? e.presupuesto : 0;
      const softBg = this.mix(this.activeTheme, '#ffffff', 0.86);

      evHtml += `
        <div style="display:flex; align-items:center; gap:13px; padding:11px 13px; background:#f7f8fa; border-radius:12px;">
          <div style="width:42px; height:42px; flex:0 0 42px; border-radius:10px; background:${softBg}; color:var(--accent); display:flex; flex-direction:column; align-items:center; justify-content:center; line-height:1;">
            <span style="font-size:15px; font-weight:800;">${day}</span>
            <span style="font-size:8.5px; font-weight:700; letter-spacing:.06em; margin-top:2px;">${start.toLocaleDateString('es-ES', {month: 'short'}).toUpperCase()}</span>
          </div>
          <div style="flex:1; min-width:0;">
            <div style="font-size:13.5px; font-weight:600; color:#1e2733; text-overflow:ellipsis; overflow:hidden; white-space:nowrap;">${e.nombre}</div>
            <div style="font-size:12px; color:#8a94a6; margin-top:2px;">Confirmado</div>
          </div>
          <span style="font-size:13.5px; font-weight:700; color:#0f172a; font-variant-numeric:tabular-nums;">${this.formatCurrency(budget)}</span>
        </div>
      `;
    });
    evHtml += '</div>';
    $('#eventsListContainer').html(evHtml);
    $('#ventasEventosMesTotal').text(this.formatCurrency(events.reduce((acc, curr) => acc + (curr.presupuesto || 0), 0)));
  };
});
