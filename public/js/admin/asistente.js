/**
 * Administración del asistente Chef (superadmin). Todo texto que viene de la BD (nombres de
 * restaurantes, usuarios y asistente) pasa por GF.escapeHtml antes de entrar a un innerHTML.
 */
(function () {
    const BASE = '/admin/asistente/api';
    const esc = GF.escapeHtml;
    const $ = id => document.getElementById(id);
    const MODOS = [
        ['estandar', 'Estándar'],
        ['conceder', 'Conceder'],
        ['denegar', 'Denegar']
    ];
    const ORIGEN = { rol: 'por rol y plan', concedido: 'concedido', denegado: 'denegado', ninguno: 'sin acceso' };
    let tenantAbierto = null;

    function pintarServidor(s) {
        const caja = $('asistente-servidor');
        caja.className = 'alert py-2 ' + (s.configurado ? 'alert-success' : 'alert-warning');
        caja.textContent = s.configurado
            ? 'Proveedor de IA configurado. Modelo: ' + s.modelo
            : 'Falta la variable GROQ_API_KEY en el servidor: el asistente no responderá hasta que se configure.';
    }

    function fila(r) {
        const ultimo = r.ultimoUso ? new Date(r.ultimoUso).toLocaleString('es-CO') : '—';
        return (
            '<tr data-id="' + r.id + '">' +
            '<td class="fw-semibold">' + esc(r.nombre) + '</td>' +
            '<td><div class="form-check form-switch"><input class="form-check-input js-addon" type="checkbox" ' +
            (r.addon ? 'checked ' : '') + 'aria-label="Add-on del asistente para ' + esc(r.nombre) + '"></div></td>' +
            '<td><div class="input-group input-group-sm flex-nowrap"><input type="text" class="form-control js-nombre" maxlength="24" value="' +
            esc(r.nombreAsistente) + '" aria-label="Nombre del asistente de ' + esc(r.nombre) + '">' +
            '<button type="button" class="btn btn-outline-primary js-guardar-nombre" title="Guardar nombre"><i class="bi bi-check-lg"></i></button></div></td>' +
            '<td class="text-end">' + r.usuariosConAcceso + '</td>' +
            '<td class="text-end">' + r.usos + '</td>' +
            '<td class="text-end">' + (r.errores ? '<span class="text-danger">' + r.errores + '</span>' : 0) + '</td>' +
            '<td class="text-end">' + r.tokens.toLocaleString('es-CO') + '</td>' +
            '<td class="small text-muted">' + esc(ultimo) + '</td>' +
            '<td class="text-end"><button type="button" class="btn btn-sm btn-outline-secondary js-usuarios"' +
            (r.addon ? '' : ' disabled title="Activa primero el add-on"') + '><i class="bi bi-people me-1"></i>Usuarios</button></td>' +
            '</tr>'
        );
    }

    async function cargar() {
        try {
            const datos = await GF.api.get(BASE + '/resumen', 'No se pudo cargar el resumen');
            pintarServidor(datos.servidor);
            $('asistente-filas').innerHTML = datos.restaurantes.length
                ? datos.restaurantes.map(fila).join('')
                : '<tr><td colspan="9" class="text-center text-muted py-4">No hay restaurantes activos.</td></tr>';
        } catch (e) {
            GF.tableError('asistente-filas', 9, e.message, e);
        }
    }

    async function guardar(etiqueta, operacion, exito) {
        try {
            await operacion();
            GF.toast(exito);
        } catch (e) {
            GF.error(e.message || 'No se pudo guardar ' + etiqueta);
        }
        await cargar();
    }

    function filaUsuario(u) {
        const opciones = MODOS.map(([v, t]) => {
            const actual = u.origen === 'concedido' ? 'conceder' : u.origen === 'denegado' ? 'denegar' : 'estandar';
            return '<option value="' + v + '"' + (v === actual ? ' selected' : '') + '>' + t + '</option>';
        }).join('');
        return (
            '<tr data-user="' + u.id + '"><td>' + esc(u.nombre) + (u.activo ? '' : ' <span class="badge text-bg-secondary">inactivo</span>') +
            '</td><td>' + esc(u.rol) + '</td><td>' +
            '<span class="badge ' + (u.tieneAcceso ? 'text-bg-success' : 'text-bg-light border') + '">' +
            (u.tieneAcceso ? 'Sí' : 'No') + '</span> <small class="text-muted">' + ORIGEN[u.origen] + '</small>' +
            (u.premium ? ' <span class="badge text-bg-warning" title="Las excepciones no aplican en este plan">Premium</span>' : '') +
            '</td><td><select class="form-select form-select-sm js-modo" aria-label="Excepción de ' + esc(u.nombre) + '">' +
            opciones + '</select></td></tr>'
        );
    }

    async function abrirUsuarios(id, nombre) {
        tenantAbierto = id;
        $('asistente-modal-titulo').textContent = 'Usuarios de ' + nombre;
        $('asistente-usuarios').innerHTML = '<tr><td colspan="4" class="text-muted">Cargando…</td></tr>';
        bootstrap.Modal.getOrCreateInstance($('asistente-modal-usuarios')).show();
        try {
            const usuarios = await GF.api.get(BASE + '/tenants/' + id + '/usuarios', 'No se pudieron cargar los usuarios');
            $('asistente-usuarios').innerHTML = usuarios.length
                ? usuarios.map(filaUsuario).join('')
                : '<tr><td colspan="4" class="text-muted">Este restaurante no tiene usuarios.</td></tr>';
        } catch (e) {
            GF.tableError('asistente-usuarios', 4, e.message, e);
        }
    }

    document.addEventListener('change', e => {
        const tr = e.target.closest('tr[data-id]');
        if (tr && e.target.classList.contains('js-addon')) {
            const activo = e.target.checked;
            guardar('el add-on', () => GF.api.put(BASE + '/tenants/' + tr.dataset.id + '/addon', { activo }, 'No se pudo cambiar el add-on'),
                activo ? 'Asistente activado' : 'Asistente desactivado');
        }
        const trU = e.target.closest('tr[data-user]');
        if (trU && e.target.classList.contains('js-modo')) {
            const modo = e.target.value;
            guardar('el acceso', async () => {
                await GF.api.put(BASE + '/tenants/' + tenantAbierto + '/usuarios/' + trU.dataset.user + '/acceso', { modo }, 'No se pudo cambiar el acceso');
                const usuarios = await GF.api.get(BASE + '/tenants/' + tenantAbierto + '/usuarios');
                $('asistente-usuarios').innerHTML = usuarios.map(filaUsuario).join('');
            }, 'Acceso actualizado');
        }
    });

    document.addEventListener('click', e => {
        const tr = e.target.closest('tr[data-id]');
        if (!tr) return;
        if (e.target.closest('.js-guardar-nombre')) {
            const nombre = tr.querySelector('.js-nombre').value;
            guardar('el nombre', () => GF.api.put(BASE + '/tenants/' + tr.dataset.id + '/nombre', { nombre }, 'No se pudo guardar el nombre'), 'Nombre guardado');
        } else if (e.target.closest('.js-usuarios')) {
            abrirUsuarios(Number(tr.dataset.id), tr.children[0].textContent);
        }
    });

    $('asistente-recargar').addEventListener('click', cargar);
    cargar();
})();
