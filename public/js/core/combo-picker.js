// ComboPicker: selector "arma tu combo" reutilizable (Mesas, POS, Menú QR).
// Crea su propio modal (no depende del HTML de la página). La validación real la repite el servidor
// (ComboArmableService.validarSeleccion); aquí solo se guía al cliente y se muestra el precio.
//
//   const res = await ComboPicker.elegir(combo);   // combo = un elemento de /api/combos-venta
//   res === null                                    -> canceló
//   res = { selecciones: [{ opcion_id }], precio }  -> listo para enviar al backend
//
//   ComboPicker.catalogo()    -> Promise<combos[]> (cacheado)
//   ComboPicker.setCatalogo(lista) -> usa un catálogo ya cargado (menú QR) en vez de pedirlo
//   ComboPicker.buscar(texto) -> combos cuyo nombre coincide (sobre el catálogo ya cargado)

window.ComboPicker = (function () {
    let cache = null;
    const url = () => window.COMBO_PICKER_URL || '/api/combos-venta';

    async function catalogo(forzar) {
        if (!cache || forzar) {
            cache = await GF.api.getOr(url(), []);
        }
        return cache;
    }

    // Páginas públicas (menú QR) reciben el catálogo ya embebido en el HTML, sin pedirlo por API.
    function setCatalogo(combos) {
        cache = Array.isArray(combos) ? combos : [];
    }

    function buscar(texto) {
        const q = String(texto || '')
            .trim()
            .toLowerCase();
        if (!q || !cache) return [];
        return cache.filter(c => c.nombre.toLowerCase().includes(q));
    }

    const dinero = n => GF.dinero(n);

    function textoRegla(g) {
        if (g.forzado) return 'Incluido';
        if (g.minimo === 0) return g.maximo === 1 ? 'Opcional · elige 1' : `Opcional · hasta ${g.maximo}`;
        if (g.minimo === g.maximo) return g.maximo === 1 ? 'Elige 1' : `Elige ${g.maximo}`;
        return `Elige de ${g.minimo} a ${g.maximo}`;
    }

    function renderOpcion(g, o) {
        const tipo = g.maximo === 1 ? 'radio' : 'checkbox';
        const cant = o.cantidad !== 1 ? `${o.cantidad}× ` : '';
        return `
            <label class="d-flex justify-content-between align-items-center border rounded-3 px-3 py-2 mb-2 combo-picker-opcion" style="min-height:44px;cursor:pointer">
                <span>
                    <input type="${tipo}" class="form-check-input me-2" name="cp-g-${g.id}" value="${o.id}"
                        data-grupo="${g.id}" data-recargo="${o.recargo}"${o.es_default ? ' checked' : ''}>
                    ${cant}${GF.escapeHtml(o.nombre)}
                </span>
                <span class="text-muted small">${o.recargo > 0 ? '+' + dinero(o.recargo) : ''}</span>
            </label>`;
    }

    function renderGrupo(g) {
        const cuerpo = g.forzado
            ? `<div class="text-muted">${g.opciones.map(o => (o.cantidad !== 1 ? `${o.cantidad}× ` : '') + GF.escapeHtml(o.nombre)).join(', ')}</div>`
            : g.opciones.map(o => renderOpcion(g, o)).join('');
        return `
            <div class="mb-3" data-grupo-id="${g.id}">
                <div class="d-flex justify-content-between align-items-center mb-1">
                    <strong>${GF.escapeHtml(g.nombre)}</strong>
                    <span class="badge ${g.minimo > 0 && !g.forzado ? 'bg-warning text-dark' : 'bg-light text-dark'}">${textoRegla(g)}</span>
                </div>
                ${cuerpo}
                <div class="text-danger small d-none combo-picker-error" role="alert"></div>
            </div>`;
    }

    function elegir(combo) {
        return new Promise(resolve => {
            const el = document.createElement('div');
            el.className = 'modal fade';
            el.tabIndex = -1;
            el.setAttribute('aria-hidden', 'true');
            el.innerHTML = `
                <div class="modal-dialog modal-dialog-scrollable modal-dialog-centered">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title"><i class="bi bi-box-seam me-2"></i>${GF.escapeHtml(combo.nombre)}</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button>
                        </div>
                        <div class="modal-body">
                            ${combo.descripcion ? `<p class="text-muted small">${GF.escapeHtml(combo.descripcion)}</p>` : ''}
                            ${combo.grupos.map(renderGrupo).join('')}
                        </div>
                        <div class="modal-footer justify-content-between">
                            <strong class="combo-picker-total"></strong>
                            <div class="d-flex gap-2">
                                <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancelar</button>
                                <button type="button" class="btn btn-primary combo-picker-ok">Agregar</button>
                            </div>
                        </div>
                    </div>
                </div>`;
            document.body.appendChild(el);

            let resultado = null;
            const inputs = () => [...el.querySelectorAll('input[data-grupo]')];
            const marcadas = g => inputs().filter(i => Number(i.dataset.grupo) === g.id && i.checked);

            // Los grupos "forzados" no se eligen: el servidor los completa solo.
            const recargos = () => inputs().filter(i => i.checked).reduce((s, i) => s + Number(i.dataset.recargo), 0);
            const actualizarTotal = () => {
                el.querySelector('.combo-picker-total').textContent = dinero(combo.precio_base + recargos());
            };

            // Al pasar el máximo de un grupo con casillas, se desmarca la más antigua para no bloquear al cliente.
            el.addEventListener('change', event => {
                const input = event.target.closest('input[data-grupo]');
                if (input) {
                    const g = combo.grupos.find(x => x.id === Number(input.dataset.grupo));
                    const activas = marcadas(g);
                    if (g.maximo > 1 && activas.length > g.maximo) {
                        const otra = activas.find(i => i !== input);
                        if (otra) otra.checked = false;
                    }
                    el.querySelector(`[data-grupo-id="${g.id}"] .combo-picker-error`).classList.add('d-none');
                }
                actualizarTotal();
            });

            el.querySelector('.combo-picker-ok').addEventListener('click', () => {
                let primerError = null;
                for (const g of combo.grupos) {
                    if (g.forzado) continue;
                    const n = marcadas(g).length;
                    if (n < g.minimo) {
                        const caja = el.querySelector(`[data-grupo-id="${g.id}"] .combo-picker-error`);
                        caja.textContent = g.minimo === 1 ? 'Elige una opción.' : `Elige al menos ${g.minimo}.`;
                        caja.classList.remove('d-none');
                        primerError = primerError || caja;
                    }
                }
                if (primerError) {
                    primerError.scrollIntoView({ block: 'center', behavior: 'smooth' });
                    return;
                }
                resultado = {
                    selecciones: inputs()
                        .filter(i => i.checked)
                        .map(i => ({ opcion_id: Number(i.value) })),
                    precio: combo.precio_base + recargos()
                };
                bootstrap.Modal.getInstance(el)?.hide();
            });

            el.addEventListener('hidden.bs.modal', () => {
                bootstrap.Modal.getInstance(el)?.dispose();
                el.remove();
                resolve(resultado);
            });

            actualizarTotal();
            bootstrap.Modal.getOrCreateInstance(el).show();
        });
    }

    return { catalogo, setCatalogo, buscar, elegir };
})();
