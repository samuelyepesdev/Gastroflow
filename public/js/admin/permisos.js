(function () {
    var selectTenant = document.getElementById('selectTenant');
    var selectUsuario = document.getElementById('selectUsuario');
    var panelPermisos = document.getElementById('panelPermisos');
    var sinUsuario = document.getElementById('sinUsuario');
    var btnGuardar = document.getElementById('btnGuardarUsuario');

    function showPanel(show) {
        panelPermisos.style.display = show ? 'flex' : 'none';
        sinUsuario.style.display = show ? 'none' : 'block';
    }

    function getSelectedUserId() {
        var v = selectUsuario.value;
        return v ? parseInt(v, 10) : null;
    }

    function updateSectionCheckState(card) {
        var sectionCb = card.querySelector('.section-check');
        if (!sectionCb) return;
        var checks = card.querySelectorAll('.permiso-check');
        var list = Array.from(checks);
        if (list.length === 0) return;
        var all = list.every(function (c) { return c.checked; });
        var none = list.every(function (c) { return !c.checked; });
        sectionCb.checked = all;
        sectionCb.indeterminate = !all && !none;
    }

    function initSectionCheckboxes() {
        document.querySelectorAll('.section-card').forEach(function (card) {
            var sectionCb = card.querySelector('.section-check');
            if (!sectionCb) return;
            sectionCb.addEventListener('change', function () {
                var check = this.checked;
                card.querySelectorAll('.permiso-check').forEach(function (c) { c.checked = check; });
                sectionCb.indeterminate = false;
            });
            card.querySelectorAll('.permiso-check').forEach(function (c) {
                c.addEventListener('change', function () { updateSectionCheckState(card); });
            });
            updateSectionCheckState(card);
        });
    }

    if (selectTenant) {
        selectTenant.addEventListener('change', function () {
            var tenantId = this.value;
            window.location.href = '/admin/permisos?tenantId=' + encodeURIComponent(tenantId);
        });
    }

    var sectionCheckboxesInited = false;

    if (selectUsuario) {
        selectUsuario.addEventListener('change', function () {
            var userId = getSelectedUserId();
            if (!userId) {
                showPanel(false);
                return;
            }
            showPanel(true);
            if (!sectionCheckboxesInited) {
                initSectionCheckboxes();
                sectionCheckboxesInited = true;
            }
            fetch('/admin/permisos/usuario/' + userId, { credentials: 'same-origin' })
                .then(function (r) { return r.json(); })
                .then(function (data) {
                    var ids = (data.permiso_ids || []).map(function (id) { return parseInt(id, 10); });
                    document.querySelectorAll('.permiso-check').forEach(function (cb) {
                        cb.checked = ids.indexOf(parseInt(cb.value, 10)) >= 0;
                    });
                    document.querySelectorAll('.section-card').forEach(function (card) { updateSectionCheckState(card); });
                })
                .catch(function () {
                    document.querySelectorAll('.permiso-check').forEach(function (cb) { cb.checked = false; });
                    document.querySelectorAll('.section-card').forEach(function (card) { updateSectionCheckState(card); });
                });
        });
    }

    if (btnGuardar) {
        btnGuardar.addEventListener('click', function () {
            var userId = getSelectedUserId();
            if (!userId) {
                Swal.fire({ icon: 'warning', title: 'Selecciona un usuario' });
                return;
            }
            var permisoIds = Array.from(document.querySelectorAll('.permiso-check:checked')).map(function (c) { return parseInt(c.value, 10); });
            fetch('/admin/permisos/usuario/' + userId, {
                method: 'PUT',
                credentials: 'same-origin',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ permiso_ids: permisoIds })
            })
                .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, data: d }; }); })
                .then(function (o) {
                    if (o.ok) Swal.fire({ icon: 'success', title: o.data.message || 'Permisos guardados' });
                    else Swal.fire({ icon: 'error', title: o.data.error || 'Error' });
                })
                .catch(function () { Swal.fire({ icon: 'error', title: 'Error de conexión' }); });
        });
    }

    if (getSelectedUserId()) {
        showPanel(true);
        selectUsuario.dispatchEvent(new Event('change'));
    } else {
        showPanel(false);
    }
})();
