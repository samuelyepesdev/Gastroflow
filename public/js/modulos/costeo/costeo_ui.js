// UI interaction, events, Excel uploads, and data loaders for the Costeo module

$(function () {
  if (window.COSTEO_SHOW_TENANT_SELECTOR) return;
  const mod = window.CosteoModule;

  // --- Insumos ---
  // La gestión de insumos (crear/editar/eliminar, tabla, filtros) vive en /inventario.
  // Acá solo queda la carga masiva por Excel, que no tiene equivalente en Inventario.
  document.getElementById('btnCargarExcelInsumos')?.addEventListener('click', () => {
    document.getElementById('inputCargarExcelInsumos')?.click();
  });
  document.getElementById('inputCargarExcelInsumos')?.addEventListener('change', function () {
    const file = this.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('archivo', file);
    let url = mod.base + '/api/insumos/cargar';
    if (mod.isSuperadmin && window.COSTEO_TENANT_ID) {
      url += '?tenant_id=' + window.COSTEO_TENANT_ID;
    }
    fetch(url, {
      method: 'POST',
      body: formData,
      credentials: 'same-origin'
    })
      .then(res => res.ok ? res.json() : res.json().then(j => { throw new Error(j.error || res.statusText); }))
      .then((result) => {
        const { creados = 0, actualizados = 0, errores = [] } = result;
        let msg = '';
        if (creados > 0 || actualizados > 0) {
          msg = (creados ? creados + ' creados' : '') + (actualizados ? (msg ? ', ' : '') + actualizados + ' actualizados' : '') + '.';
        }
        if (errores.length > 0) {
          msg += (msg ? ' ' : '') + errores.length + ' fila(s) con error.';
        }
        mod.showToast(msg || 'Carga completada', msg ? 'success' : 'info');
      })
      .catch(err => mod.showToast(err.message || 'Error al cargar archivo', 'danger'));
    this.value = '';
  });

  function quitarBackdropModal() {
    document.querySelectorAll('.modal-backdrop').forEach(el => el.remove());
    document.body.classList.remove('modal-open');
    document.body.style.overflow = '';
    document.body.style.paddingRight = '';
  }

  // --- Recetas ---
  window.getRecetasFilters = function() {
    return {
      q: document.getElementById('filtroRecetaQ')?.value?.trim() || ''
    };
  };

  window.loadRecetas = function(filters) {
    const f = filters || window.getRecetasFilters();
    const qs = new URLSearchParams();
    if (f.q) qs.set('q', f.q);
    const path = '/api/recetas' + (qs.toString() ? '?' + qs.toString() : '');
    return mod.api(path).then(list => {
      const tbody = document.querySelector('#tablaRecetas tbody');
      if (tbody) {
        tbody.innerHTML = '';
        (list || []).forEach(rec => {
          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td>${mod.escapeHtml(rec.producto_nombre || '-')}</td>
            <td>${mod.escapeHtml(rec.nombre_receta)}</td>
            <td>${rec.porciones}</td>
            <td>${mod.formatMoney(rec.precio_venta_actual)}</td>
            <td class="text-end">
              <button class="btn btn-sm btn-outline-info me-1 btnVerCosteo" data-id="${rec.id}">Ver costeo</button>
              ${mod.canEditReceta ? `<button class="btn btn-sm btn-outline-primary me-1 btnEditReceta" data-id="${rec.id}">Editar</button>` : ''}
              ${mod.canEdit ? `<button class="btn btn-sm btn-outline-danger btnElimReceta" data-id="${rec.id}">Eliminar</button>` : ''}
            </td>`;
          tbody.appendChild(tr);
        });
      }
      return list;
    });
  };
  document.getElementById('btnFiltrarRecetas')?.addEventListener('click', () => window.loadRecetas());

  function showCosteo(recetaId) {
    const panel = document.getElementById('costeoRecetaPanel');
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    mod.api('/api/costeo/receta/' + recetaId).then(data => {
      set('costeoDirecto', mod.formatMoney(data.costo_materia_prima_porcion ?? data.costo_directo_porcion));
      set('costeoMermaPct', data.merma_pct != null ? data.merma_pct : '0');
      set('costeoIndirecto', mod.formatMoney(data.merma_monto ?? data.costo_indirecto));
      set('costeoTotal', mod.formatMoney(data.costo_total_porcion ?? data.cvu_porcion));
      set('costeoMargenObjetivo', (data.margen_objetivo_pct != null ? data.margen_objetivo_pct : 65) + '%');
      set('costeoPrecioSug', mod.formatMoney(data.precio_sugerido));
      set('costeoPrecioActual', mod.formatMoney(data.precio_venta_actual));
      set('costeoUtilidadBruta', mod.formatMoney(data.utilidad_bruta_porcion));
      set('costeoMargen', data.margen_actual_pct != null ? data.margen_actual_pct + '%' : '-');
      set('costeoMarkup', data.markup_real_pct != null ? data.markup_real_pct + '%' : '-');
      set('costeoTotalFijos', mod.formatMoney(data.total_costos_fijos));
      set('costeoMargenContrib', mod.formatMoney(data.margen_contribucion_porcion));
      set('costeoPuntoEquilibrio', data.punto_equilibrio_porciones != null ? mod.formatMoney(data.punto_equilibrio_porciones) : '-');
      panel?.classList.remove('d-none');
    }).catch(() => panel?.classList.add('d-none'));
  }

  document.getElementById('tablaRecetas')?.addEventListener('click', (e) => {
    const id = e.target.closest('[data-id]')?.dataset.id;
    if (!id) return;
    if (e.target.classList.contains('btnVerCosteo')) {
      showCosteo(id);
    } else if (e.target.classList.contains('btnEditReceta')) {
      if (window.COSTEO_PLANTILLA_REPOSTERIA && document.getElementById('modalCalculadoraReposteria') && typeof window.COSTEO_openCalculadoraReposteria === 'function') {
        window.COSTEO_openCalculadoraReposteria(Number.parseInt(id, 10));
      } else {
        openRecetaEditarModal(Number.parseInt(id, 10));
      }
    } else if (e.target.classList.contains('btnElimReceta')) {
      if (!confirm('¿Eliminar esta receta?')) return;
      mod.api('/api/recetas/' + id, { method: 'DELETE' }).then(() => {
        window.loadRecetas(window.getRecetasFilters());
        document.getElementById('costeoRecetaPanel').classList.add('d-none');
        mod.showToast('Receta eliminada', 'success');
      }).catch(err => mod.showToast(err.message, 'danger'));
    }
  });

  document.getElementById('recetas-tab')?.addEventListener('shown.bs.tab', () => window.loadRecetas());

  if (window.COSTEO_PLANTILLA_REPOSTERIA && document.getElementById('modalCalculadoraReposteria')) {
    window.COSTEO_openCalculadoraReposteria = window.COSTEO_openCalculadoraReposteria || function () {
      const modal = document.getElementById('modalCalculadoraReposteria');
      if (modal && typeof bootstrap !== 'undefined' && bootstrap.Modal) {
        bootstrap.Modal.getOrCreateInstance(modal).show();
      }
    };
  }

  document.getElementById('btnNuevaReceta')?.addEventListener('click', function (e) {
    const modalCalc = document.getElementById('modalCalculadoraReposteria');
    if (window.COSTEO_PLANTILLA_REPOSTERIA && modalCalc && typeof window.COSTEO_openCalculadoraReposteria === 'function') {
      e.preventDefault();
      e.stopPropagation();
      window.COSTEO_openCalculadoraReposteria(null);
      return;
    }
    document.getElementById('recetaProductoId').value = '';
    document.getElementById('recetaNombreNueva').value = '';
    document.getElementById('recetaPorcionesNueva').value = '1';
  });

  document.getElementById('btnCrearReceta')?.addEventListener('click', () => {
    const producto_id = Number.parseInt(document.getElementById('recetaProductoId').value, 10);
    const nombre_receta = document.getElementById('recetaNombreNueva').value.trim();
    const porciones = Number.parseFloat(document.getElementById('recetaPorcionesNueva').value) || 1;
    if (!producto_id || !nombre_receta) {
      mod.showToast('Producto y nombre de receta son requeridos', 'warning');
      return;
    }
    mod.api('/api/recetas', { method: 'POST', body: JSON.stringify({ producto_id, nombre_receta, porciones }) })
      .then((result) => {
        bootstrap.Modal.getInstance(document.getElementById('recetaNuevaModal')).hide();
        window.loadRecetas(window.getRecetasFilters());
        mod.showToast('Receta creada. Agregá los insumos a continuación.', 'success');
        if (result?.id) {
          setTimeout(() => openRecetaEditarModal(result.id), 300);
        }
      }).catch(err => mod.showToast(err.message, 'danger'));
  });

  function loadInsumosForSelect() {
    return mod.api('/api/insumos').then(list => {
      mod.insumosList = list || [];
      window.COSTEO_insumosList = mod.insumosList;
      const sel = document.getElementById('ingredienteInsumo');
      if (sel) {
        sel.innerHTML = '<option value="">Agregar insumo</option>';
        mod.insumosList.forEach(i => {
          const opt = document.createElement('option');
          opt.value = i.id;
          opt.textContent = `${i.codigo} - ${i.nombre} (${i.unidad_compra})`;
          sel.appendChild(opt);
        });
      }
      if (window.COSTEO_refreshReposteriaSelect) window.COSTEO_refreshReposteriaSelect();
      return mod.insumosList;
    });
  }

  window.COSTEO_agregarIngrediente = function (ing) {
    mod.recetaIngredientes.push(ing);
    renderIngredientes();
  };

  function openRecetaEditarModal(recetaId) {
    document.getElementById('recetaId').value = recetaId;
    mod.recetaIngredientes = [];
    if (typeof restoreOpcionesUnidadReceta === 'function') restoreOpcionesUnidadReceta();
    loadInsumosForSelect().then(() => mod.api('/api/recetas/' + recetaId)).then(rec => {
      document.getElementById('recetaEditarTitle').textContent = 'Editar: ' + (rec.nombre_receta || '');
      document.getElementById('recetaNombre').value = rec.nombre_receta || '';
      document.getElementById('recetaPorciones').value = rec.porciones || 1;
      mod.recetaIngredientes = (rec.ingredientes || []).map(ing => ({
        insumo_id: ing.insumo_id,
        cantidad: ing.cantidad,
        unidad: ing.unidad || 'g',
        insumo_nombre: ing.insumo_nombre,
        insumo_codigo: ing.insumo_codigo
      }));
      renderIngredientes();
      new bootstrap.Modal(document.getElementById('recetaEditarModal')).show();
    }).catch(err => mod.showToast(err.message, 'danger'));
  }

  function renderIngredientes() {
    const tbody = document.getElementById('ingredientesBody');
    if (tbody) {
      tbody.innerHTML = '';
      mod.recetaIngredientes.forEach((ing, idx) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${mod.escapeHtml(ing.insumo_codigo || '')} - ${mod.escapeHtml(ing.insumo_nombre || '')}</td>
          <td>${ing.cantidad}</td>
          <td>${ing.unidad}</td>
          <td>${mod.canEdit ? `<button type="button" class="btn btn-sm btn-outline-danger btnQuitarIng" data-idx="${idx}">Quitar</button>` : ''}</td>`;
        tbody.appendChild(tr);
      });
      if (mod.canEdit) {
        tbody.querySelectorAll('.btnQuitarIng').forEach(btn => {
          btn.addEventListener('click', () => {
            mod.recetaIngredientes.splice(Number.parseInt(btn.dataset.idx, 10), 1);
            renderIngredientes();
          });
        });
      }
    }
  }

  function getUnidadBaseReceta(unidadCompra) {
    if (!unidadCompra) return 'UND';
    const u = String(unidadCompra).trim().toLowerCase();
    if (u === 'kg' || u === 'g' || u === 'gr' || u === 'lb') return 'g';
    if (u === 'l' || u === 'ml') return 'ml';
    return 'UND';
  }

  function setUnidadRecetaPorInsumo(ins) {
    const unidadEl = document.getElementById('ingredienteUnidad');
    if (!unidadEl) return;
    const base = getUnidadBaseReceta(ins?.unidad_compra);
    const opciones = { g: [{ value: 'g', label: 'g' }], ml: [{ value: 'ml', label: 'ml' }], UND: [{ value: 'UND', label: 'UND' }] };
    const opts = opciones[base] || opciones.UND;
    unidadEl.innerHTML = '';
    opts.forEach(function (o) {
      const opt = document.createElement('option');
      opt.value = o.value;
      opt.textContent = o.label;
      unidadEl.appendChild(opt);
    });
    unidadEl.value = base;
  }

  function restoreOpcionesUnidadReceta() {
    const unidadEl = document.getElementById('ingredienteUnidad');
    if (!unidadEl) return;
    unidadEl.innerHTML = '<option value="g">g</option><option value="ml">ml</option><option value="UND">UND</option>';
    unidadEl.value = 'g';
  }

  document.getElementById('ingredienteInsumo')?.addEventListener('change', function () {
    const insumoId = Number.parseInt(this.value, 10);
    const ins = mod.insumosList.find(i => i.id === insumoId);
    if (!ins) {
      restoreOpcionesUnidadReceta();
      return;
    }
    setUnidadRecetaPorInsumo(ins);
  });

  document.getElementById('btnAgregarIngrediente')?.addEventListener('click', () => {
    const insumoId = Number.parseInt(document.getElementById('ingredienteInsumo').value, 10);
    const cantidad = Number.parseFloat(document.getElementById('ingredienteCantidad').value) || 0;
    const unidadEl = document.getElementById('ingredienteUnidad');
    const unidad = unidadEl ? unidadEl.value : 'g';
    if (!insumoId || cantidad <= 0) return;
    const ins = mod.insumosList.find(i => i.id === insumoId);
    const unidadGuardar = ins ? getUnidadBaseReceta(ins.unidad_compra) : unidad;
    mod.recetaIngredientes.push({
      insumo_id: insumoId,
      cantidad: cantidad,
      unidad: unidadGuardar,
      insumo_nombre: ins ? ins.nombre : '',
      insumo_codigo: ins ? ins.codigo : ''
    });
    renderIngredientes();
    document.getElementById('ingredienteCantidad').value = '';
  });

  document.getElementById('btnGuardarReceta')?.addEventListener('click', () => {
    const recetaId = document.getElementById('recetaId').value;
    const nombre_receta = document.getElementById('recetaNombre').value.trim();
    const porciones = Number.parseFloat(document.getElementById('recetaPorciones').value) || 1;
    const ingredientes = mod.recetaIngredientes.map(ing => ({ insumo_id: ing.insumo_id, cantidad: ing.cantidad, unidad: ing.unidad }));
    mod.api('/api/recetas/' + recetaId, {
      method: 'PUT',
      body: JSON.stringify({ nombre_receta, porciones, ingredientes })
    }).then(() => {
      bootstrap.Modal.getInstance(document.getElementById('recetaEditarModal')).hide();
      window.loadRecetas();
      mod.showToast('Receta actualizada', 'success');
    }).catch(err => mod.showToast(err.message, 'danger'));
  });

  // --- Alertas ---
  function loadAlertas() {
    const loadingEl = document.getElementById('alertasLoading');
    const contentEl = document.getElementById('alertasContent');
    if (!loadingEl || !contentEl) return;
    loadingEl.classList.remove('d-none');
    contentEl.classList.add('d-none');
    mod.api('/api/costeo/alertas').then(data => {
      const fmt = (n) => n != null && !Number.isNaN(n) ? new Intl.NumberFormat('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) : '-';
      const margenBajo = data.margenBajo || [];
      const precioBajo = data.precioBajoCosto || [];
      const sinReceta = data.sinReceta || [];
      const tbodyMB = document.getElementById('alertasMargenBajo');
      const tbodyPB = document.getElementById('alertasPrecioBajo');
      const tbodySR = document.getElementById('alertasSinReceta');
      const vacioMB = document.getElementById('alertasMargenBajoVacio');
      const vacioPB = document.getElementById('alertasPrecioBajoVacio');
      const vacioSR = document.getElementById('alertasSinRecetaVacio');
      if (tbodyMB) {
        tbodyMB.innerHTML = margenBajo.map(it => `
          <tr>
            <td>${mod.escapeHtml(it.producto_nombre)}</td>
            <td>${mod.escapeHtml(it.producto_codigo)}</td>
            <td class="text-end">$${fmt(it.precio_venta_actual)}</td>
            <td class="text-end">$${fmt(it.costo_total_porcion)}</td>
            <td class="text-end text-warning">${it.margen_actual_pct != null ? it.margen_actual_pct + '%' : '-'}</td>
          </tr>`).join('');
        if (vacioMB) vacioMB.classList.toggle('d-none', margenBajo.length > 0);
      }
      if (tbodyPB) {
        tbodyPB.innerHTML = precioBajo.map(it => `
          <tr>
            <td>${mod.escapeHtml(it.producto_nombre)}</td>
            <td>${mod.escapeHtml(it.producto_codigo)}</td>
            <td class="text-end">$${fmt(it.precio_venta_actual)}</td>
            <td class="text-end text-danger">$${fmt(it.costo_total_porcion)}</td>
          </tr>`).join('');
        if (vacioPB) vacioPB.classList.toggle('d-none', precioBajo.length > 0);
      }
      if (tbodySR) {
        tbodySR.innerHTML = sinReceta.map(it => `
          <tr>
            <td>${mod.escapeHtml(it.nombre)}</td>
            <td>${mod.escapeHtml(it.codigo)}</td>
            <td><a href="/productos" class="btn btn-sm btn-outline-primary">Ir a Productos</a></td>
          </tr>`).join('');
        if (vacioSR) vacioSR.classList.toggle('d-none', sinReceta.length > 0);
      }
      loadingEl.classList.add('d-none');
      contentEl.classList.remove('d-none');
    }).catch(() => {
      loadingEl.classList.add('d-none');
      contentEl.classList.remove('d-none');
      mod.showToast('Error al cargar alertas', 'danger');
    });
  }
  document.getElementById('alertas-tab')?.addEventListener('shown.bs.tab', () => loadAlertas());

  // --- Configuración costeo ---
  function toggleConfigRows(metodo) {
    const m = metodo || document.getElementById('configMetodo')?.value || 'porcentaje';
    document.getElementById('rowPorcentaje')?.classList.toggle('d-none', m !== 'porcentaje');
    document.getElementById('rowCostoFijo')?.classList.toggle('d-none', m !== 'costo_fijo');
  }

  function togglePrecioRows(metodoPrecio) {
    const m = metodoPrecio || document.getElementById('configMetodoPrecio')?.value || 'margen';
    document.getElementById('rowFactor')?.classList.toggle('d-none', m !== 'factor');
  }

  function loadConfig() {
    return mod.api('/api/costeo/config').then(config => {
      const metodo = document.getElementById('configMetodo');
      if (metodo) metodo.value = config.metodo_indirectos || 'porcentaje';
      const metodoPrecio = document.getElementById('configMetodoPrecio');
      if (metodoPrecio) metodoPrecio.value = config.metodo_precio || 'margen';
      const pct = document.getElementById('configPorcentaje');
      if (pct) pct.value = config.porcentaje_indirectos ?? 10;
      const platosMes = document.getElementById('configPlatosMes');
      if (platosMes) platosMes.value = config.platos_estimados_mes ?? 500;
      const factor = document.getElementById('configFactor');
      if (factor) factor.value = config.factor_carga ?? 2.5;
      const margen = document.getElementById('configMargen');
      if (margen) margen.value = config.margen_objetivo_default ?? 65;
      const margenMinimo = document.getElementById('configMargenMinimoAlerta');
      if (margenMinimo) margenMinimo.value = config.margen_minimo_alerta ?? 30;
      const gananciaDeseada = document.getElementById('configGananciaDeseada');
      if (gananciaDeseada) gananciaDeseada.value = config.ganancia_neta_deseada_mensual ?? 0;
      toggleConfigRows(config.metodo_indirectos);
      togglePrecioRows(config.metodo_precio);
      if (config.metodo_indirectos === 'costo_fijo') loadCostosFijos();
      loadResumenFinanciero();
      return config;
    });
  }

  function loadResumenFinanciero() {
    const loading = document.getElementById('resumenFinancieroLoading');
    const content = document.getElementById('resumenFinancieroContent');
    const vacio = document.getElementById('resumenFinancieroVacio');
    if (!loading || !content) return;
    loading.classList.remove('d-none');
    content.classList.add('d-none');
    if (vacio) vacio.classList.add('d-none');
    mod.api('/api/costeo/resumen-financiero').then(data => {
      loading.classList.add('d-none');
      if (!data.productos || data.productos.length === 0) {
        if (vacio) vacio.classList.remove('d-none');
        return;
      }
      content.classList.remove('d-none');
      const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
      set('resumenTotalFijos', mod.formatMoney(data.total_costos_fijos));
      set('resumenMCPct', (data.margen_contribucion_pct_negocio != null ? data.margen_contribucion_pct_negocio : 0) + '%');
      set('resumenVentasEquilibrio', data.ventas_equilibrio != null ? mod.formatMoney(data.ventas_equilibrio) : '-');
      set('resumenVentasMeta', data.ventas_para_meta != null ? mod.formatMoney(data.ventas_para_meta) : '-');
      const nota = document.getElementById('resumenNotaMix');
      if (nota && data.nota_mix) nota.textContent = data.nota_mix;
      const tbody = document.getElementById('resumenProductosBody');
      if (tbody) {
        tbody.innerHTML = '';
        (data.productos || []).forEach(p => {
          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td>${mod.escapeHtml(p.producto_nombre || '')}</td>
            <td class="text-end">${mod.formatMoney(p.precio_venta)}</td>
            <td class="text-end">${mod.formatMoney(p.cvu_porcion)}</td>
            <td class="text-end">${mod.formatMoney(p.margen_contribucion_porcion)}</td>
            <td class="text-end">${(p.margen_contribucion_pct != null ? p.margen_contribucion_pct : 0)}%</td>`;
          tbody.appendChild(tr);
        });
      }
    }).catch(() => {
      loading.classList.add('d-none');
      if (vacio) vacio.classList.remove('d-none');
    });
  }

  function loadCostosFijos() {
    return mod.api('/api/costeo/costos-fijos').then(data => {
      const tbody = document.getElementById('costosFijosBody');
      const totalEl = document.getElementById('costosFijosTotal');
      if (!tbody) return;
      tbody.innerHTML = '';
      const items = data.items || [];
      const total = data.total != null ? data.total : items.filter(i => i.activo).reduce((s, i) => s + (Number.parseFloat(i.monto_mensual) || 0), 0);
      if (totalEl) totalEl.textContent = mod.formatMoney(total);
      items.forEach(cf => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${mod.escapeHtml(cf.nombre)}</td>
          <td class="text-end">${mod.formatMoney(cf.monto_mensual)}</td>
          <td>${cf.activo ? '<span class="badge bg-success">Sí</span>' : '<span class="badge bg-secondary">No</span>'}</td>
          <td class="text-end">
            ${mod.canEdit ? `<button type="button" class="btn btn-sm btn-outline-primary me-1 btnEditCostoFijo" data-id="${cf.id}">Editar</button>
            <button type="button" class="btn btn-sm btn-outline-danger btnDelCostoFijo" data-id="${cf.id}">Eliminar</button>` : ''}
          </td>`;
        tbody.appendChild(tr);
      });
      return data;
    });
  }

  document.getElementById('btnNuevoCostoFijo')?.addEventListener('click', () => {
    document.getElementById('costoFijoId').value = '';
    document.getElementById('costoFijoNombre').value = '';
    document.getElementById('costoFijoMonto').value = '0';
    document.getElementById('costoFijoActivo').checked = true;
    document.getElementById('modalCostoFijoTitle').textContent = 'Nuevo costo fijo';
    new bootstrap.Modal(document.getElementById('modalCostoFijo')).show();
  });

  document.getElementById('costosFijosBody')?.addEventListener('click', (e) => {
    const id = e.target.closest('[data-id]')?.dataset.id;
    if (!id) return;
    if (e.target.classList.contains('btnEditCostoFijo')) {
      mod.api('/api/costeo/costos-fijos').then(data => {
        const cf = (data.items || []).find(i => String(i.id) === String(id));
        if (!cf) return;
        document.getElementById('costoFijoId').value = cf.id;
        document.getElementById('costoFijoNombre').value = cf.nombre || '';
        document.getElementById('costoFijoMonto').value = cf.monto_mensual != null ? cf.monto_mensual : '0';
        document.getElementById('costoFijoActivo').checked = cf.activo;
        document.getElementById('modalCostoFijoTitle').textContent = 'Editar costo fijo';
        new bootstrap.Modal(document.getElementById('modalCostoFijo')).show();
      });
    } else if (e.target.classList.contains('btnDelCostoFijo')) {
      if (!confirm('¿Eliminar este costo fijo?')) return;
      mod.api('/api/costeo/costos-fijos/' + id, { method: 'DELETE' })
        .then(() => { loadCostosFijos(); mod.showToast('Costo fijo eliminado', 'success'); })
        .catch(err => mod.showToast(err.message || err.error, 'danger'));
    }
  });

  document.getElementById('btnGuardarCostoFijo')?.addEventListener('click', () => {
    const id = document.getElementById('costoFijoId').value;
    const payload = {
      nombre: document.getElementById('costoFijoNombre').value.trim(),
      monto_mensual: Number.parseFloat(document.getElementById('costoFijoMonto').value) || 0,
      activo: document.getElementById('costoFijoActivo').checked
    };
    if (!payload.nombre) { mod.showToast('El nombre es obligatorio', 'warning'); return; }
    const promise = id
      ? mod.api('/api/costeo/costos-fijos/' + id, { method: 'PUT', body: JSON.stringify(payload) })
      : mod.api('/api/costeo/costos-fijos', { method: 'POST', body: JSON.stringify(payload) });
    promise.then(() => {
      bootstrap.Modal.getInstance(document.getElementById('modalCostoFijo'))?.hide();
      loadCostosFijos();
      mod.showToast('Costo fijo guardado', 'success');
    }).catch(err => mod.showToast(err.message || err.error, 'danger'));
  });

  document.getElementById('configMetodo')?.addEventListener('change', (e) => {
    const metodo = e.target.value;
    toggleConfigRows(metodo);
    if (metodo === 'costo_fijo') loadCostosFijos();
  });
  document.getElementById('configMetodoPrecio')?.addEventListener('change', (e) => {
    togglePrecioRows(e.target.value);
  });
  document.getElementById('config-tab')?.addEventListener('shown.bs.tab', () => {
    if (document.getElementById('configMetodo')?.value === 'costo_fijo') loadCostosFijos();
    loadResumenFinanciero();
  });

  document.getElementById('formConfigCosteo')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const payload = {
      metodo_indirectos: document.getElementById('configMetodo')?.value || 'porcentaje',
      metodo_precio: document.getElementById('configMetodoPrecio')?.value || 'margen',
      porcentaje_indirectos: Number.parseFloat(document.getElementById('configPorcentaje')?.value) || 10,
      platos_estimados_mes: Number.parseInt(document.getElementById('configPlatosMes')?.value, 10) || 500,
      factor_carga: Number.parseFloat(document.getElementById('configFactor')?.value) || 2.5,
      margen_objetivo_default: Number.parseFloat(document.getElementById('configMargen')?.value) || 65,
      margen_minimo_alerta: Number.parseFloat(document.getElementById('configMargenMinimoAlerta')?.value) || 30,
      ganancia_neta_deseada_mensual: Number.parseFloat(document.getElementById('configGananciaDeseada')?.value) || 0
    };
    mod.api('/api/costeo/config', { method: 'PUT', body: JSON.stringify(payload) })
      .then(() => mod.showToast('Configuración guardada', 'success'))
      .catch(err => mod.showToast(err.message, 'danger'));
  });

  window.COSTEO_api = mod.api;
  window.COSTEO_showToast = mod.showToast;
  window.COSTEO_formatMoney = mod.formatMoney;
  window.COSTEO_loadRecetas = function () { return window.loadRecetas(window.getRecetasFilters()); };
  window.COSTEO_quitarBackdropModal = quitarBackdropModal;

  // Init
  window.loadRecetas();
  loadConfig();
});
