(function () {
    var selectTenant = document.getElementById('selectTenant');
    var selectUsuario = document.getElementById('selectUsuario');
    var panelPermisos = document.getElementById('panelPermisos');
    var sinUsuario = document.getElementById('sinUsuario');
    var btnGuardar = document.getElementById('btnGuardarUsuario');
    var btnRestablecer = document.getElementById('btnRestablecer');
    var searchPermiso = document.getElementById('searchPermiso');
    
    var presetsContainer = document.getElementById('presetsContainer');
    var searchWrapper = document.getElementById('searchWrapper');
    
    var saveBarActiveCount = document.getElementById('saveBarActiveCount');
    var saveBarUsername = document.getElementById('saveBarUsername');
    var saveBarStatus = document.getElementById('saveBarStatus');

    var loadedPermisoIds = [];

    function showPanel(show) {
        panelPermisos.style.display = show ? 'block' : 'none';
        sinUsuario.style.display = show ? 'none' : 'block';
        if (presetsContainer) presetsContainer.style.display = show ? 'inline-flex' : 'none';
        if (searchWrapper) searchWrapper.style.display = show ? 'flex' : 'none';
    }

    function getSelectedUserId() {
        var v = selectUsuario.value;
        return v ? parseInt(v, 10) : null;
    }

    function updateSectionCheckState(card) {
        var sectionHeader = card.querySelector('.section-card-header');
        var sectionCb = card.querySelector('.section-check');
        if (!sectionCb) return;
        var checks = card.querySelectorAll('.permiso-check');
        var list = Array.from(checks);
        if (list.length === 0) return;
        
        var all = list.every(function (c) { return c.checked; });
        var none = list.every(function (c) { return !c.checked; });
        
        sectionCb.checked = all;
        sectionCb.indeterminate = !all && !none;
        
        // Actualizar clases de cabecera
        sectionHeader.classList.remove('all-checked', 'some-checked');
        if (all) {
            sectionHeader.classList.add('all-checked');
        } else if (!none) {
            sectionHeader.classList.add('some-checked');
        }
        
        // Actualizar fila activa
        list.forEach(function (c) {
            var row = c.closest('.permiso-item-row');
            if (row) {
                if (c.checked) {
                    row.classList.add('active');
                } else {
                    row.classList.remove('active');
                }
            }
        });
        
        // Actualizar conteo de permisos activos en subtítulo
        var checkedCount = list.filter(function (c) { return c.checked; }).length;
        var subtitle = card.querySelector('.section-header-subtitle');
        if (subtitle) {
            subtitle.textContent = checkedCount + ' de ' + list.length + ' activos';
        }
    }

    function updateSaveBar() {
        var checkedChecks = Array.from(document.querySelectorAll('.permiso-check:checked'));
        var activeCount = checkedChecks.length;
        if (saveBarActiveCount) {
            saveBarActiveCount.textContent = activeCount;
        }
        
        var currentIds = checkedChecks.map(function (c) { return parseInt(c.value, 10); });
        
        // Comparar cargados vs actuales
        var isDirty = false;
        if (loadedPermisoIds.length !== currentIds.length) {
            isDirty = true;
        } else {
            var loadedSorted = loadedPermisoIds.slice().sort();
            var currentSorted = currentIds.slice().sort();
            for (var i = 0; i < loadedSorted.length; i++) {
                if (loadedSorted[i] !== currentSorted[i]) {
                    isDirty = true;
                    break;
                }
            }
        }
        
        if (saveBarStatus) {
            saveBarStatus.className = 'status-badge ' + (isDirty ? 'unsaved' : 'saved');
            saveBarStatus.innerHTML = isDirty 
                ? '<i class="bi bi-exclamation-circle-fill me-1"></i>Cambios sin guardar'
                : '<i class="bi bi-check-circle-fill me-1"></i>Guardado';
        }
    }

    function initSectionCheckboxes() {
        document.querySelectorAll('.section-card').forEach(function (card) {
            var sectionCb = card.querySelector('.section-check');
            if (!sectionCb) return;
            sectionCb.addEventListener('change', function () {
                var check = this.checked;
                card.querySelectorAll('.permiso-check').forEach(function (c) { 
                    c.checked = check; 
                });
                sectionCb.indeterminate = false;
                updateSectionCheckState(card);
                updateSaveBar();
            });
            card.querySelectorAll('.permiso-check').forEach(function (c) {
                c.addEventListener('change', function () { 
                    updateSectionCheckState(card); 
                    updateSaveBar();
                });
            });
            updateSectionCheckState(card);
        });
    }

    // Cambio de restaurante (Tenant)
    if (selectTenant) {
        selectTenant.addEventListener('change', function () {
            var tenantId = this.value;
            window.location.href = '/admin/permisos?tenantId=' + encodeURIComponent(tenantId);
        });
    }

    var sectionCheckboxesInited = false;

    // Cambio de usuario
    if (selectUsuario) {
        selectUsuario.addEventListener('change', function () {
            var userId = getSelectedUserId();
            if (!userId) {
                showPanel(false);
                return;
            }
            
            // Mostrar nombre del usuario en la barra de guardado
            var selectedOption = selectUsuario.options[selectUsuario.selectedIndex];
            if (saveBarUsername && selectedOption) {
                saveBarUsername.textContent = selectedOption.textContent.split('(')[0].trim();
            }
            
            showPanel(true);
            if (!sectionCheckboxesInited) {
                initSectionCheckboxes();
                sectionCheckboxesInited = true;
            }
            
            fetch('/admin/permisos/usuario/' + userId, { credentials: 'same-origin' })
                .then(function (r) { return r.json(); })
                .then(function (data) {
                    loadedPermisoIds = (data.permiso_ids || []).map(function (id) { return parseInt(id, 10); });
                    document.querySelectorAll('.permiso-check').forEach(function (cb) {
                        cb.checked = loadedPermisoIds.indexOf(parseInt(cb.value, 10)) >= 0;
                    });
                    document.querySelectorAll('.section-card').forEach(function (card) { 
                        updateSectionCheckState(card); 
                    });
                    updateSaveBar();
                })
                .catch(function () {
                    loadedPermisoIds = [];
                    document.querySelectorAll('.permiso-check').forEach(function (cb) { cb.checked = false; });
                    document.querySelectorAll('.section-card').forEach(function (card) { updateSectionCheckState(card); });
                    updateSaveBar();
                });
        });
    }

    // Configuración de presets de roles
    document.querySelectorAll('[data-preset-role]').forEach(function (btn) {
        btn.addEventListener('click', function () {
            var role = this.getAttribute('data-preset-role');
            var presets = window.GastroFlowRolePresets || {};
            var presetIds = presets[role];
            
            if (!presetIds) {
                Swal.fire({ icon: 'info', title: 'No hay permisos preestablecidos para este rol.' });
                return;
            }
            
            // Marcar checkboxes según la plantilla
            document.querySelectorAll('.permiso-check').forEach(function (cb) {
                cb.checked = presetIds.indexOf(parseInt(cb.value, 10)) >= 0;
            });
            
            // Actualizar interfaz de las tarjetas
            document.querySelectorAll('.section-card').forEach(function (card) {
                updateSectionCheckState(card);
            });
            
            // Recalcular barra de guardado
            updateSaveBar();
            
            // Toast de confirmación
            var roleNames = {
                admin: 'Administrador',
                cajero: 'Cajero',
                mesero: 'Mesero',
                cocinero: 'Cocinero'
            };
            const Toast = Swal.mixin({
                toast: true,
                position: 'top-end',
                showConfirmButton: false,
                timer: 1500,
                timerProgressBar: true
            });
            Toast.fire({
                icon: 'success',
                title: 'Plantilla de ' + (roleNames[role] || role) + ' aplicada'
            });
        });
    });

    // Botón Restablecer
    if (btnRestablecer) {
        btnRestablecer.addEventListener('click', function () {
            document.querySelectorAll('.permiso-check').forEach(function (cb) {
                cb.checked = loadedPermisoIds.indexOf(parseInt(cb.value, 10)) >= 0;
            });
            document.querySelectorAll('.section-card').forEach(function (card) {
                updateSectionCheckState(card);
            });
            updateSaveBar();
        });
    }

    // Botón Guardar
    if (btnGuardar) {
        btnGuardar.addEventListener('click', function () {
            var userId = getSelectedUserId();
            if (!userId) {
                Swal.fire({ icon: 'warning', title: 'Selecciona un usuario' });
                return;
            }
            
            btnGuardar.disabled = true;
            btnGuardar.innerHTML = '<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Guardando...';
            
            var permisoIds = Array.from(document.querySelectorAll('.permiso-check:checked')).map(function (c) { return parseInt(c.value, 10); });
            fetch('/admin/permisos/usuario/' + userId, {
                method: 'PUT',
                credentials: 'same-origin',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ permiso_ids: permisoIds })
            })
                .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, data: d }; }); })
                .then(function (o) {
                    btnGuardar.disabled = false;
                    btnGuardar.innerHTML = '<i class="bi bi-save me-1"></i>Guardar permisos';
                    
                    if (o.ok) {
                        loadedPermisoIds = permisoIds; // Actualizar IDs cargados originales
                        updateSaveBar();
                        Swal.fire({ icon: 'success', title: o.data.message || 'Permisos guardados con éxito' });
                    } else {
                        Swal.fire({ icon: 'error', title: o.data.error || 'Error' });
                    }
                })
                .catch(function () {
                    btnGuardar.disabled = false;
                    btnGuardar.innerHTML = '<i class="bi bi-save me-1"></i>Guardar permisos';
                    Swal.fire({ icon: 'error', title: 'Error de conexión' });
                });
        });
    }

    // Buscador de permisos en tiempo real
    if (searchPermiso) {
        searchPermiso.addEventListener('input', function () {
            var query = this.value.trim().toLowerCase();
            document.querySelectorAll('.section-card').forEach(function (card) {
                var sectionName = card.getAttribute('data-section-name').toLowerCase();
                var matchesSection = sectionName.indexOf(query) >= 0;
                var visibleRows = 0;
                
                card.querySelectorAll('.permiso-item-row').forEach(function (row) {
                    var text = row.querySelector('span:not(.custom-checkbox)').textContent.toLowerCase();
                    if (query === '' || matchesSection || text.indexOf(query) >= 0) {
                        row.style.display = 'flex';
                        visibleRows++;
                    } else {
                        row.style.display = 'none';
                    }
                });
                
                if (query !== '' && visibleRows === 0) {
                    card.style.display = 'none';
                } else {
                    card.style.display = 'block';
                }
            });
        });
    }

    if (getSelectedUserId()) {
        showPanel(true);
        selectUsuario.dispatchEvent(new Event('change'));
    } else {
        showPanel(false);
    }
})();
