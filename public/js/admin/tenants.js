// Búsqueda en sidebar
const searchInput = document.getElementById('searchTenants');
const tenantItems = document.querySelectorAll('.tenant-item');
if (searchInput) {
    searchInput.addEventListener('input', (e) => {
        const term = e.target.value.toLowerCase();
        tenantItems.forEach(item => {
            const name = item.dataset.name || '';
            item.style.display = name.includes(term) ? 'flex' : 'none';
        });
    });
}

// Manejo de Colores
const colorInput = document.getElementById('editConfigColor');
const colorPreview = document.getElementById('colorPreview');
const presetDots = document.querySelectorAll('.preset-color-dot');

if (colorInput) {
    colorInput.addEventListener('input', (e) => {
        colorPreview.style.background = e.target.value;
    });
}

presetDots.forEach(dot => {
    dot.addEventListener('click', () => {
        const color = dot.dataset.color;
        colorInput.value = color;
        colorPreview.style.background = color;
    });
});

async function saveAppearance(tenantId) {
    const color = colorInput.value;
    const tipoNegocioElement = document.getElementById('editTipoNegocio');
    const config = {
        colors: { primary: color },
        tipo_negocio: tipoNegocioElement ? tipoNegocioElement.value : 'restaurante'
    };

    try {
        await GF.api.put(`/admin/tenants/${tenantId}`, { config: JSON.stringify(config) }, 'No se pudo guardar el diseño');
        Swal.fire({ icon: 'success', title: 'Diseño Actualizado', timer: 1500, showConfirmButton: false })
            .then(() => window.location.reload());
    } catch (e) {
        GF.error(e.message);
    }
}

async function handleFormSubmit(event, tenantId, type) {
    event.preventDefault();
    const formData = new FormData(event.target);
    const data = Object.fromEntries(formData.entries());

    if (type === 'general') {
        const colorInputGeneral = document.getElementById('editConfigColorGeneral');
        const colorValue = colorInputGeneral ? colorInputGeneral.value : '#ff5a36';

        data.config = JSON.stringify({
            colors: { primary: colorValue },
            tipo_negocio: data.tipo_negocio
        });
    }

    try {
        await GF.api.put('/admin/tenants/' + tenantId, data, 'Error al actualizar datos');
        Swal.fire({ icon: 'success', title: 'Datos Guardados', timer: 1500, showConfirmButton: false })
            .then(() => { if (type === 'general') window.location.reload(); });
    } catch (e) {
        GF.error(e.message);
    }
}

async function confirmToggleStatus(id, activo) {
    const result = await Swal.fire({
        title: activo ? '¿Reactivar suscripción?' : '¿Deshabilitar acceso?',
        text: activo ? 'El restaurante podrá operar de nuevo.' : 'El personal no podrá iniciar sesión y las funciones se bloquearán.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Sí, confirmar',
        cancelButtonText: 'Cancelar'
    });

    if (result.isConfirmed) {
        toggleTenantStatus(id, activo);
    }
}

async function toggleTenantStatus(id, activo) {
    try {
        await GF.api.post(`/admin/tenants/${id}/status`, { activo }, 'No se pudo cambiar el estado');
        window.location.reload();
    } catch (e) {
        // Antes fallaba en silencio: el botón no hacía nada y no se sabía por qué.
        GF.error(e.message);
    }
}

document.addEventListener('click', e => {
    const btn = e.target.closest('.js-eliminar-tenant');
    if (btn) confirmDeleteTenant(btn.dataset.id, btn.dataset.nombre);
});

async function confirmDeleteTenant(id, name) {
    if (id == 1) {
        return Swal.fire('Acción denegada', 'No se permite eliminar el restaurante principal.', 'error');
    }
    const result = await Swal.fire({
        title: '¿Estás completamente seguro?',
        html: `Esta acción es <b>irreversible</b>.<br>Se borrarán todos los menús, ventas, usuarios y mesas de <b>${GF.escapeHtml(name)}</b>.<br><br>Escribe el nombre del restaurante para confirmar:`,
        input: 'text',
        icon: 'error',
        inputPlaceholder: name,
        showCancelButton: true,
        confirmButtonText: 'Sí, eliminar restaurante',
        confirmButtonColor: '#dc3545',
        cancelButtonText: 'Cancelar',
        inputValidator: (value) => {
            if (value.trim().toLowerCase() !== name.trim().toLowerCase()) {
                return 'El nombre no coincide. Operación cancelada.';
            }
        }
    });

    if (result.isConfirmed) {
        try {
            await GF.api.delete(`/admin/tenants/${id}`, 'No se pudo eliminar el restaurante.');
            Swal.fire('Eliminado', 'El restaurante ha sido borrado.', 'success')
                .then(() => window.location.href = '/admin/tenants');
        } catch (e) {
            GF.error(e.message);
        }
    }
}

async function saveAllRoles(tenantId) {
    const groups = document.querySelectorAll('.user-roles-group');
    const changes = [];
    let sinRoles = false;

    groups.forEach(group => {
        const userId = group.dataset.userId;
        const originalRoles = (group.dataset.originalRoles || '')
            .split(',')
            .filter(Boolean)
            .sort((a, b) => a.localeCompare(b));
        const newRoles = Array.from(group.querySelectorAll('.user-role-checkbox:checked'))
            .map(cb => cb.value)
            .sort((a, b) => a.localeCompare(b));

        if (newRoles.length === 0) {
            sinRoles = true;
            return;
        }
        if (JSON.stringify(newRoles) !== JSON.stringify(originalRoles)) {
            changes.push({ userId, rol_nombres: newRoles });
        }
    });

    if (sinRoles) {
        return Swal.fire('Falta un rol', 'Cada usuario debe tener al menos un rol asignado.', 'warning');
    }

    if (changes.length === 0) {
        return Swal.fire({
            icon: 'info',
            title: 'No hay cambios',
            text: 'No has modificado ningún rol.',
            timer: 1500,
            showConfirmButton: false
        });
    }

    try {
        Swal.fire({
            title: 'Guardando cambios...',
            allowOutsideClick: false,
            didOpen: () => {
                Swal.showLoading();
            }
        });

        const data = await GF.api.post(`/admin/tenants/${tenantId}/users/batch-roles`, { changes }, 'No se pudieron actualizar los roles.');
        Swal.fire({
            icon: 'success',
            title: '¡Éxito!',
            text: data.message,
            timer: 1500,
            showConfirmButton: false
        }).then(() => window.location.reload());
    } catch (e) {
        GF.error(e.message);
    }
}

async function toggleUserStatus(userId, tenantId, activo) {
    try {
        await GF.api.post(`/admin/tenants/${tenantId}/users/${userId}/status`, { activo }, 'No se pudo cambiar el estado del usuario');
        window.location.reload();
    } catch (e) {
        GF.error(e.message);
    }
}

async function deleteUser(userId, username, tenantId) {
    const result = await Swal.fire({
        title: '¿Eliminar usuario?',
        text: `¿Estás seguro de que deseas eliminar permanentemente a "${username}"? Esta acción no se puede deshacer.`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#dc3545',
        cancelButtonColor: '#5b6b7e',
        confirmButtonText: 'Sí, eliminar',
        cancelButtonText: 'Cancelar'
    });

    if (result.isConfirmed) {
        try {
            await GF.api.delete(`/admin/tenants/${tenantId}/users/${userId}`, 'No se pudo eliminar el usuario.');
            Swal.fire({
                icon: 'success',
                title: 'Eliminado',
                text: 'El usuario ha sido eliminado correctamente.',
                timer: 1500,
                showConfirmButton: false
            }).then(() => window.location.reload());
        } catch (e) {
            GF.error(e.message);
        }
    }
}

function openModalPassword(userId, username, tenantId) {
    document.getElementById('modalPasswordUserId').value = userId;
    document.getElementById('modalPasswordUsername').innerText = username;
    document.getElementById('modalPasswordTenantId').value = tenantId;
    document.getElementById('modalPasswordNew').value = '';
    document.getElementById('modalPasswordConfirm').value = '';
    new bootstrap.Modal(document.getElementById('modalCambiarPassword')).show();
}

document.getElementById('btnGuardarPassword').addEventListener('click', async () => {
    const userId = document.getElementById('modalPasswordUserId').value;
    const tenantId = document.getElementById('modalPasswordTenantId').value;
    const pass1 = document.getElementById('modalPasswordNew').value;
    const pass2 = document.getElementById('modalPasswordConfirm').value;

    if (pass1 !== pass2) return Swal.fire('Error', 'Las contraseñas no coinciden', 'error');
    if (pass1.length < 6) return Swal.fire('Error', 'Mínimo 6 caracteres', 'error');

    try {
        const data = await GF.api.put(
            `/admin/tenants/${tenantId}/users/${userId}/password`,
            { newPassword: pass1, newPasswordConfirm: pass2 },
            'No se pudo actualizar la contraseña'
        );
        Swal.fire('Éxito', data.message || 'Contraseña actualizada correctamente', 'success')
            .then(() => GF.cerrarModal('modalCambiarPassword'));
    } catch (e) {
        GF.error(e.message);
    }
});

function openModalCorreo(userId, username, currentEmail, tenantId) {
    document.getElementById('modalCorreoUserId').value = userId;
    document.getElementById('modalCorreoUsername').innerText = username;
    document.getElementById('modalCorreoInput').value = currentEmail;
    document.getElementById('modalCorreoTenantId').value = tenantId;
    new bootstrap.Modal(document.getElementById('modalEditarCorreo')).show();
}

document.getElementById('btnGuardarCorreo').addEventListener('click', async () => {
    const userId = document.getElementById('modalCorreoUserId').value;
    const tenantId = document.getElementById('modalCorreoTenantId').value;
    const email = document.getElementById('modalCorreoInput').value;

    try {
        const data = await GF.api.put(`/admin/tenants/${tenantId}/users/${userId}/email`, { email }, 'No se pudo actualizar el correo');
        Swal.fire('Éxito', data.message || 'Correo actualizado correctamente', 'success')
            .then(() => {
                GF.cerrarModal('modalEditarCorreo');
                window.location.reload();
            });
    } catch (e) {
        GF.error(e.message);
    }
});

const btnSeed = document.getElementById('btnSeedCategorias');
if (btnSeed) {
    btnSeed.addEventListener('click', async () => {
        const tenantId = btnSeed.dataset.tenantId;
        const result = await Swal.fire({
            title: '¿Cargar configuración sugerida?',
            text: 'Esto creará categorías y productos base según el tipo de negocio seleccionado.',
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: 'Sí, configurar'
        });

        if (result.isConfirmed) {
            Swal.fire({ title: 'Configurando...', allowOutsideClick: false, didOpen: () => { Swal.showLoading(); } });
            try {
                await GF.api.post(`/admin/tenants/${tenantId}/seed-initial`, undefined, 'No se pudo realizar la configuración.');
                Swal.fire('¡Listo!', 'El restaurante ha sido configurado.', 'success').then(() => window.location.reload());
            } catch (e) {
                GF.error(e.message);
            }
        }
    });
}
