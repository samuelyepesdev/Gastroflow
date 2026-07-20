// Core states, chart instances, and helper functions for the Dashboard module

window.DashboardModule = {
  dailySalesChart: null,
  ventasEnEventosChart: null,
  salesByCategoryChart: null,
  topProductsChart: null,
  lastStats: null,
  calendarViewYear: new Date().getFullYear(),
  calendarViewMonth: new Date().getMonth(),
  calendarEventosCache: {},

  formatCurrency(amount) {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  },

  parseFechaLocal(str) {
    if (str == null) return null;
    if (typeof str === 'object' && str instanceof Date) {
      return new Date(str.getFullYear(), str.getMonth(), str.getDate());
    }
    const s = String(str).trim();
    if (s.length >= 10 && s.charAt(4) === '-' && s.charAt(7) === '-') {
      const y = Number.parseInt(s.slice(0, 4), 10);
      const m = Number.parseInt(s.slice(5, 7), 10) - 1;
      const d = Number.parseInt(s.slice(8, 10), 10);
      if (!Number.isNaN(y) && !Number.isNaN(m) && !Number.isNaN(d)) return new Date(y, m, d);
    }
    const d2 = new Date(str);
    return Number.isNaN(d2.getTime()) ? null : new Date(d2.getFullYear(), d2.getMonth(), d2.getDate());
  },

  dateToKey(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
  },

  fechasConEventoMap(eventos) {
    const map = new Map();
    (eventos || []).forEach(ev => {
      const ini = this.parseFechaLocal(ev.fecha_inicio);
      const fin = this.parseFechaLocal(ev.fecha_fin);
      if (!ini || !fin) return;
      const nombre = (ev.nombre || 'Evento').trim();
      for (let d = new Date(ini.getFullYear(), ini.getMonth(), ini.getDate()); d <= fin; d.setDate(d.getDate() + 1)) {
        const key = this.dateToKey(d);
        if (!map.has(key)) map.set(key, []);
        if (map.get(key).indexOf(nombre) === -1) map.get(key).push(nombre);
      }
    });
    return map;
  },

  getMesKey(year, month) {
    return year + '-' + String(month + 1).padStart(2, '0');
  }
};
