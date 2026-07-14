(function () {
    var SD = JSON.parse(document.getElementById('SD').textContent);
    var ALL_ADDONS = SD.addons;
    var ALL_PLANS = SD.plans;
    var PC = { basico: '#64748b', pro: '#0d6efd', premium: '#6366f1' };

    var addonMap = {};
    var metaMap = {};
    SD.tenants.forEach(function (t) {
        addonMap[t.id] = new Set(t.addonIds || []);
        metaMap[t.id] = { planId: t.plan_id, tamano: t.tamano || 'pequeno', plan_slug: t.plan_slug, nombre: t.nombre, slug: t.slug };
    });

    var mTid = null, mTamano = 'pequeno';

    function openModal(tid) {
        mTid = tid;
        var meta = metaMap[tid];
        mTamano = meta.tamano || 'pequeno';
        document.getElementById('mTitle').textContent = meta.nombre;
        document.getElementById('mSlug').textContent = meta.slug;
        var plan = ALL_PLANS.find(function (p) { return p.id === meta.planId; });
        document.getElementById('mPlanDot').style.background = PC[meta.plan_slug] || '#64748b';
        document.getElementById('mPlanNombre').textContent = plan ? plan.nombre : 'Sin plan';
        selTamano(mTamano, true);
        renderList();
        recalc();
        new bootstrap.Modal(document.getElementById('modalAddons')).show();
    }

    function selTamano(t, silent) {
        mTamano = t;
        document.querySelectorAll('.tamano-btn').forEach(function (b) {
            b.className = 'btn btn-sm flex-fill tamano-btn ' + (b.dataset.tamano === t ? 'btn-primary' : 'btn-outline-secondary');
        });
        if (!silent) recalc();
    }

    function renderList() {
        var c = document.getElementById('mList');
        c.innerHTML = '';
        var act = addonMap[mTid] || new Set();
        ALL_ADDONS.forEach(function (a) {
            var sel = act.has(a.id);
            var d = document.createElement('div');
            d.className = 'addon-item' + (sel ? ' sel' : '');
            d.id = 'ai-' + a.id;
            d.onclick = function () { toggleAddon(a.id); };
            var chkI = document.createElement('i');
            chkI.className = 'bi bi-check2';
            chkI.style.fontSize = '.8rem';
            if (!sel) chkI.style.display = 'none';
            var chkDiv = document.createElement('div');
            chkDiv.className = 'addon-chk';
            chkDiv.appendChild(chkI);
            var infoDiv = document.createElement('div');
            var nameD = document.createElement('div');
            nameD.className = 'addon-name';
            nameD.textContent = a.nombre;
            var descD = document.createElement('div');
            descD.className = 'addon-desc';
            descD.textContent = a.descripcion;
            infoDiv.appendChild(nameD);
            infoDiv.appendChild(descD);
            var priceDiv = document.createElement('div');
            priceDiv.className = 'addon-price';
            priceDiv.textContent = fmtCOP(a.precio);
            d.appendChild(chkDiv);
            d.appendChild(infoDiv);
            d.appendChild(priceDiv);
            c.appendChild(d);
        });
    }

    function toggleAddon(addonId) {
        var s = addonMap[mTid] || new Set();
        if (s.has(addonId)) s.delete(addonId); else s.add(addonId);
        addonMap[mTid] = s;
        var el = document.getElementById('ai-' + addonId);
        var chk = el && el.querySelector('.addon-chk i');
        var sel = s.has(addonId);
        if (el) el.className = 'addon-item' + (sel ? ' sel' : '');
        if (chk) chk.style.display = sel ? '' : 'none';
        recalc();
    }

    function recalc() {
        var meta = metaMap[mTid];
        var plan = ALL_PLANS.find(function (p) { return p.id === meta.planId; });
        var keyP = 'precio_' + mTamano;
        var pPlan = plan ? (plan[keyP] || 0) : 0;
        var act = ALL_ADDONS.filter(function (a) { return (addonMap[mTid] || new Set()).has(a.id); });
        var pAd = act.reduce(function (s, a) { return s + a.precio; }, 0);
        document.getElementById('mTotal').textContent = fmtCOP(pPlan + pAd);
        document.getElementById('mBreak').textContent = 'Plan: ' + fmtCOP(pPlan) + '  +  Add-ons: ' + fmtCOP(pAd);
    }

    document.getElementById('btnGuardar').addEventListener('click', async function () {
        var tid = mTid;
        var tamano = mTamano;
        var newSet = new Set(addonMap[tid]);
        try {
            await localFetch('/admin/planes/api/tenant/' + tid + '/tamano', 'PUT', { tamano: tamano });
            var cur = await localFetch('/admin/planes/api/tenant/' + tid + '/addons', 'GET');
            var curIds = new Set(cur.map(function (a) { return a.id; }));
            var toAdd = Array.from(newSet).filter(function (id) { return !curIds.has(id); });
            var toDel = Array.from(curIds).filter(function (id) { return !newSet.has(id); });
            for (var i = 0; i < toAdd.length; i++) {
                await localFetch('/admin/planes/api/tenant/' + tid + '/addons', 'POST', { addon_id: toAdd[i] });
            }
            for (var j = 0; j < toDel.length; j++) {
                await localFetch('/admin/planes/api/tenant/' + tid + '/addons/' + toDel[j], 'DELETE');
            }
            metaMap[tid].tamano = tamano;
            updateRow(tid, tamano, newSet);
            bootstrap.Modal.getInstance(document.getElementById('modalAddons')).hide();
            Swal.fire({ icon: 'success', title: 'Guardado', timer: 1300, showConfirmButton: false });
        } catch (e) {
            Swal.fire({ icon: 'error', title: 'Error al guardar', text: e.message });
        }
    });

    function updateRow(tid, tamano, set) {
        var meta = metaMap[tid];
        var plan = ALL_PLANS.find(function (p) { return p.id === meta.planId; });
        var keyP = 'precio_' + tamano;
        var pPlan = plan ? (plan[keyP] || 0) : 0;
        var act = ALL_ADDONS.filter(function (a) { return set.has(a.id); });
        var pAd = act.reduce(function (s, a) { return s + a.precio; }, 0);
        var chipsEl = document.getElementById('tb-chips-' + tid);
        if (chipsEl) {
            if (act.length > 0) {
                chipsEl.innerHTML = '';
                act.forEach(function (a) {
                    var sp = document.createElement('span');
                    sp.className = 'chip';
                    sp.textContent = a.nombre;
                    chipsEl.appendChild(sp);
                });
            } else {
                chipsEl.innerHTML = '<span class="text-muted" style="font-size:.75rem;">Ninguno</span>';
            }
        }
        setText('tb-total-' + tid, fmtCOP(pPlan + pAd));
        setText('tb-pp-' + tid, fmtCOP(pPlan));
        setText('tb-pa-' + tid, fmtCOP(pAd));
        var labels = { pequeno: 'Pequeno', mediano: 'Mediano', grande: 'Grande' };
        setText('tb-tam-' + tid, labels[tamano] || tamano);
    }

    async function savePlanCompleto(planId) {
        var sq = function (s) { return parseFloat(document.getElementById('pp-' + planId + '-' + s).value || 0); };
        var nombre = document.getElementById('pn-' + planId).value;
        var descShort = document.getElementById('pd-' + planId).value;
        var descLong = document.getElementById('pdd-' + planId).value;

        try {
            await localFetch('/admin/planes/api/planes/' + planId + '/precios', 'PUT', {
                precio_pequeno: sq('pequeno'), precio_mediano: sq('mediano'), precio_grande: sq('grande')
            });

            await localFetch('/admin/planes/api/planes/' + planId, 'PUT', {
                nombre: nombre,
                descripcion: descShort,
                descripcion_detallada: descLong
            });

            var p = ALL_PLANS.find(function (pl) { return pl.id === planId; });
            if (p) {
                p.precio_pequeno = sq('pequeno');
                p.precio_mediano = sq('mediano');
                p.precio_grande = sq('grande');
                p.nombre = nombre;
                p.descripcion = descShort;
                p.descripcion_detallada = descLong;
            }

            Swal.fire({ icon: 'success', title: 'Plan actualizado correctamente', timer: 1500, showConfirmButton: false });
        } catch (e) {
            Swal.fire({ icon: 'error', title: 'Error al actualizar plan', text: e.message });
        }
    }

    async function saveAddon(addonId) {
        var precio = parseFloat(document.getElementById('ap-' + addonId).value || 0);
        try {
            await localFetch('/admin/planes/api/addons/' + addonId, 'PUT', { precio: precio });
            var a = ALL_ADDONS.find(function (x) { return x.id === addonId; });
            if (a) a.precio = precio;
            Swal.fire({ icon: 'success', title: 'Precio actualizado', timer: 1200, showConfirmButton: false });
        } catch (e) {
            Swal.fire({ icon: 'error', title: 'Error', text: e.message });
        }
    }

    async function localFetch(url, method, body) {
        var opts = { method: method, credentials: 'same-origin', headers: { 'Content-Type': 'application/json' } };
        if (body && method !== 'GET') opts.body = JSON.stringify(body);
        var resp = await fetch(url, opts);
        if (!resp.ok) {
            var e = await resp.json().catch(function () { return {}; });
            throw new Error(e.error || 'HTTP ' + resp.status);
        }
        if (method === 'DELETE') return null;
        return resp.json().catch(function () { return null; });
    }

    function fmtCOP(n) { return '$' + Number(n || 0).toLocaleString('es-CO'); }
    function setText(id, txt) { var el = document.getElementById(id); if (el) el.textContent = txt; }

    // Expose functions needed by onclick handlers in HTML
    window.openModal = openModal;
    window.selTamano = selTamano;
    window.savePlanCompleto = savePlanCompleto;
    window.saveAddon = saveAddon;

    var exportBtn = document.getElementById('exportPortafolioBtn');
    var exportLabel = document.getElementById('exportPortafolioLabel');
    if (exportBtn) {
        exportBtn.addEventListener('click', function () {
            pollJobAndDownload('/admin/planes/exportar-pdf', {
                onStart: function () {
                    exportBtn.disabled = true;
                    exportLabel.textContent = 'Generando PDF...';
                },
                onDone: function () {
                    exportBtn.disabled = false;
                    exportLabel.textContent = 'Exportar Portafolio (PDF)';
                }
            });
        });
    }
})();
