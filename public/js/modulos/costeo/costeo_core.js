// Shared states, utility methods and API wrapper for the Costeo module

(function () {
    var el = document.getElementById('costeo-data');
    if (el) {
        var d = JSON.parse(el.textContent);
        window.USER_PERMISOS = d.userPermisos;
        window.USER_ROL = d.userRol;
        window.COSTEO_TENANT_ID = d.tenantId;
        window.COSTEO_SHOW_TENANT_SELECTOR = d.showTenantSelector;
        window.COSTEO_PLANTILLA_REPOSTERIA = d.plantillaReposteria;
    }
})();

window.CosteoModule = {
  base: '/costeo',
  permisos: (function () {
    let p = window.USER_PERMISOS;
    if (typeof p === 'string') try { p = JSON.parse(p); } catch (_) { p = []; }
    return Array.isArray(p) ? p : [];
  })(),
  userRol: (typeof window.USER_ROL === 'string' ? window.USER_ROL : '') || '',
  isSuperadmin: String(window.USER_ROL || '').toLowerCase() === 'superadmin',
  canEdit: false,
  canViewCosteo: false,
  canEditReceta: false,
  insumosList: [],
  recetaIngredientes: [],

  api(path, options = {}) {
    let url = this.base + path;
    if (this.isSuperadmin && window.COSTEO_TENANT_ID) {
      url += (path.indexOf('?') >= 0 ? '&' : '?') + 'tenant_id=' + window.COSTEO_TENANT_ID;
    }
    return fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        ...(options.headers || {})
      },
      credentials: 'same-origin'
    }).then(res => res.text().then(text => {
      let data = null;
      try {
        if (text && text.trim()) data = JSON.parse(text);
      } catch (_) {
        if (!res.ok) return Promise.reject(new Error(res.statusText || 'Error del servidor'));
        return Promise.reject(new Error('Respuesta inválida del servidor'));
      }
      if (!res.ok) return Promise.reject(new Error((data && data.error) || res.statusText || 'Error'));
      return data;
    }));
  },

  escapeHtml(s) {
    if (s == null) return '';
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  },

  formatMoney(n) {
    if (n == null || isNaN(n)) return '-';
    return new Intl.NumberFormat('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
  },

  showToast(msg, type) {
    const el = document.createElement('div');
    el.className = `alert alert-${type} alert-dismissible fade show position-fixed`;
    el.style.cssText = 'top: 1rem; right: 1rem; z-index: 9999; min-width: 200px;';
    el.innerHTML = msg + '<button type="button" class="btn-close" data-bs-dismiss="alert"></button>';
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 4000);
  }
};

window.CosteoModule.canEdit = window.CosteoModule.permisos.includes('costeo.editar') || window.CosteoModule.isSuperadmin;
window.CosteoModule.canViewCosteo = window.CosteoModule.permisos.includes('costeo.ver') || window.CosteoModule.isSuperadmin;
window.CosteoModule.canEditReceta = window.CosteoModule.canViewCosteo || window.CosteoModule.canEdit || true;
