(function () {
    'use strict';

    var esc = GF.escapeHtml;
    var $ = function (id) {
        return document.getElementById(id);
    };
    var todos = function (sel, raiz) {
        return Array.prototype.slice.call((raiz || document).querySelectorAll(sel));
    };
    var valores = function (sel) {
        return todos(sel)
            .filter(function (c) {
                return c.checked;
            })
            .map(function (c) {
                return c.value;
            });
    };
    var DATOS = JSON.parse($('pm-data').textContent);

    // ------------------------------------------------------------------ Edición masiva
    var btnPrev = $('btnPrevisualizar');
    var btnAplicar = $('btnAplicar');
    var resultado = $('pmResultado');
    var AYUDA = resultado.innerHTML;

    function modo() {
        return document.querySelector('input[name="pmModo"]:checked').value;
    }
    function accion() {
        return document.querySelector('input[name="pmAccion"]:checked').value;
    }
    function payload() {
        return {
            accion: accion(),
            roles: valores('.pm-rol'),
            modo: modo(),
            plan_ids: valores('.pm-plan'),
            tenant_ids: valores('.pm-tenant'),
            permiso_ids: valores('.pm-permiso')
        };
    }

    // Cualquier cambio en el formulario invalida la vista previa: hay que volver a previsualizar
    function invalidar() {
        btnAplicar.disabled = true;
        resultado.innerHTML = AYUDA;
        $('pmContador').textContent = valores('.pm-permiso').length + ' elegidos';
    }

    todos('input[name="pmModo"]').forEach(function (r) {
        r.addEventListener('change', function () {
            $('pmPlanes').hidden = modo() !== 'planes';
            $('pmManual').hidden = modo() !== 'manual';
            invalidar();
        });
    });
    ['.pm-rol', '.pm-plan', '.pm-tenant', '.pm-permiso', 'input[name="pmAccion"]'].forEach(function (sel) {
        todos(sel).forEach(function (c) {
            c.addEventListener('change', invalidar);
        });
    });

    todos('.pm-sec-check').forEach(function (cb) {
        cb.addEventListener('change', function () {
            todos('.pm-permiso', cb.closest('[data-seccion]')).forEach(function (p) {
                p.checked = cb.checked;
            });
            invalidar();
        });
    });

    function filtrar(input, selector, atributo) {
        input.addEventListener('input', function () {
            var t = input.value.trim().toLowerCase();
            todos(selector).forEach(function (el) {
                el.hidden = t !== '' && el.getAttribute(atributo).indexOf(t) === -1;
            });
        });
    }
    filtrar($('pmBuscarRest'), '.pm-rest', 'data-nombre');
    filtrar($('pmBuscarPerm'), '.pm-perm', 'data-texto');

    function textoResumen(r, aplicado) {
        var partes = [];
        partes.push(
            '<div class="fw-bold mb-1">' +
                (aplicado ? 'Cambio aplicado' : 'Vista previa') +
                '</div>' +
                '<div>Usuarios en el alcance: <strong>' + r.usuarios + '</strong> en <strong>' + r.restaurantes + '</strong> restaurantes.</div>' +
                '<div>' + (aplicado ? 'Modificados' : 'Se modificarían') + ': <strong>' + r.usuariosConCambios + '</strong> usuarios en <strong>' +
                r.restaurantesConCambios + '</strong> restaurantes.</div>'
        );
        if (r.sinCambios > 0) {
            partes.push('<div class="text-muted">' + r.sinCambios + ' ya estaban como se pide.</div>');
        }
        if (r.premium > 0) {
            partes.push('<div class="text-muted">' + r.premium + ' admins de plan Premium/Definitivo se omiten (ya tienen todo).</div>');
        }
        if (!aplicado && r.muestra.length) {
            partes.push(
                '<div class="mt-2 text-muted">Por ejemplo: ' +
                    r.muestra
                        .map(function (m) {
                            return esc(m.usuario) + ' (' + esc(m.restaurante) + ')';
                        })
                        .join(', ') +
                    '</div>'
            );
        }
        return partes.join('');
    }

    btnPrev.addEventListener('click', function () {
        GF.cargando(btnPrev, true);
        GF.api
            .post('/admin/permisos/masivo/previsualizar', payload(), 'No se pudo calcular la vista previa')
            .then(function (r) {
                resultado.innerHTML = textoResumen(r, false);
                btnAplicar.disabled = r.usuariosConCambios === 0;
                if (r.usuariosConCambios === 0) {
                    resultado.innerHTML += '<div class="mt-2">No hay nada que cambiar.</div>';
                }
            })
            .catch(function (e) {
                btnAplicar.disabled = true;
                GF.error(e.message);
            })
            .finally(function () {
                GF.cargando(btnPrev, false);
            });
    });

    btnAplicar.addEventListener('click', function () {
        GF.confirmar('¿Aplicar el cambio a los usuarios de la vista previa? Queda registrado en la auditoría.').then(function (ok) {
            if (!ok) return;
            GF.cargando(btnAplicar, true);
            GF.api
                .post('/admin/permisos/masivo/aplicar', payload(), 'No se pudo aplicar el cambio')
                .then(function (r) {
                    resultado.innerHTML = textoResumen(r, true);
                    btnAplicar.disabled = true;
                    GF.toast('Cambio aplicado');
                    exCargado = false;
                    auCargado = false;
                })
                .catch(function (e) {
                    GF.error(e.message);
                })
                .finally(function () {
                    GF.cargando(btnAplicar, false);
                });
        });
    });

    // ------------------------------------------------------------------ Excepciones
    var exCargado = false;
    var exMostrados = [];

    function chips(lista, clase) {
        if (!lista.length) return '<span class="text-muted">—</span>';
        return lista
            .map(function (n) {
                return '<span class="badge ' + clase + ' me-1 mb-1">' + esc(n) + '</span>';
            })
            .join('');
    }

    function cargarExcepciones() {
        var qs = new URLSearchParams({
            tenantId: $('exTenant').value,
            rol: $('exRol').value,
            q: $('exBuscar').value.trim()
        });
        $('exCuerpo').innerHTML = '<tr><td colspan="6" class="text-muted text-center py-4">Cargando...</td></tr>';
        GF.api
            .get('/admin/permisos/masivo/excepciones?' + qs.toString(), 'No se pudo cargar el reporte')
            .then(function (r) {
                exCargado = true;
                exMostrados = r.usuarios;
                $('exResumen').textContent =
                    r.total + ' usuarios con excepciones' + (r.total > r.usuarios.length ? ' (se muestran ' + r.usuarios.length + ')' : '');
                $('btnExReiniciarTodos').hidden = r.usuarios.length === 0;
                if (!r.usuarios.length) {
                    $('exCuerpo').innerHTML = '<tr><td colspan="6" class="text-muted text-center py-4">Ningún usuario se aparta de su rol.</td></tr>';
                    return;
                }
                $('exCuerpo').innerHTML = r.usuarios
                    .map(function (u) {
                        return (
                            '<tr><td>' + esc(u.tenant_nombre || '—') + '</td>' +
                            '<td class="fw-semibold">' + esc(u.nombre_completo || u.username) + '<br><small class="text-muted">' + esc(u.username) + '</small></td>' +
                            '<td>' + esc(u.rol_nombre) + '</td>' +
                            '<td>' + chips(u.concedidos, 'text-bg-success') + '</td>' +
                            '<td>' + chips(u.denegados, 'text-bg-danger') + '</td>' +
                            '<td class="text-end"><button type="button" class="btn btn-sm btn-outline-secondary js-reiniciar" data-id="' + Number(u.id) + '">Volver al estándar</button></td></tr>'
                        );
                    })
                    .join('');
            })
            .catch(function (e) {
                $('exCuerpo').innerHTML = '<tr><td colspan="6" class="text-danger text-center py-4">' + esc(e.message) + '</td></tr>';
            });
    }

    function reiniciar(ids, mensaje) {
        GF.confirmar(mensaje).then(function (ok) {
            if (!ok) return;
            GF.api
                .post('/admin/permisos/masivo/excepciones/reiniciar', { user_ids: ids }, 'No se pudo volver al estándar')
                .then(function (r) {
                    GF.toast(r.excepcionesQuitadas + ' excepciones quitadas');
                    auCargado = false;
                    cargarExcepciones();
                })
                .catch(function (e) {
                    GF.error(e.message);
                });
        });
    }

    $('btnTabExcepciones').addEventListener('shown.bs.tab', function () {
        if (!exCargado) cargarExcepciones();
    });
    $('btnExBuscar').addEventListener('click', cargarExcepciones);
    $('exBuscar').addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter') cargarExcepciones();
    });
    $('exCuerpo').addEventListener('click', function (ev) {
        var btn = ev.target.closest('.js-reiniciar');
        if (!btn) return;
        reiniciar([Number(btn.dataset.id)], '¿Quitarle todas las excepciones a este usuario? Volverá a los permisos de su rol y plan.');
    });
    $('btnExReiniciarTodos').addEventListener('click', function () {
        reiniciar(
            exMostrados.map(function (u) {
                return u.id;
            }),
            '¿Volver al estándar a los ' + exMostrados.length + ' usuarios mostrados?'
        );
    });

    // ------------------------------------------------------------------ Matriz de roles
    var original = {}; // rolId -> "1,2,3" ordenado, para saber si hay cambios sin guardar

    function marcados(rolId) {
        return todos('.pm-celda[data-rol="' + rolId + '"]')
            .filter(function (c) {
                return c.checked;
            })
            .map(function (c) {
                return Number(c.value);
            })
            .sort(function (a, b) {
                return a - b;
            });
    }
    DATOS.matriz.forEach(function (r) {
        var ids = r.permiso_ids.map(Number);
        todos('.pm-celda[data-rol="' + r.id + '"]').forEach(function (c) {
            c.checked = ids.indexOf(Number(c.value)) !== -1;
        });
        original[r.id] = marcados(r.id).join(',');
    });

    function actualizarBotonRol(rolId) {
        var btn = document.querySelector('.js-guardar-rol[data-rol="' + rolId + '"]');
        btn.disabled = marcados(rolId).join(',') === original[rolId];
    }
    todos('.pm-celda').forEach(function (c) {
        c.addEventListener('change', function () {
            actualizarBotonRol(c.dataset.rol);
        });
    });
    todos('.js-guardar-rol').forEach(function (btn) {
        btn.addEventListener('click', function () {
            var rolId = btn.dataset.rol;
            var rol = DATOS.matriz.filter(function (r) {
                return String(r.id) === rolId;
            })[0];
            GF.confirmar('Este cambio llega a los ' + rol.usuarios + ' usuarios con el rol «' + rol.nombre + '», en todos los restaurantes. ¿Guardar?').then(function (ok) {
                if (!ok) return;
                GF.cargando(btn, true);
                GF.api
                    .put('/admin/permisos/masivo/roles/' + rolId, { permiso_ids: marcados(rolId) }, 'No se pudo guardar el rol')
                    .then(function (r) {
                        original[rolId] = marcados(rolId).join(',');
                        GF.toast('Rol guardado: +' + r.agregados.length + ' / −' + r.quitados.length);
                        auCargado = false;
                    })
                    .catch(function (e) {
                        GF.error(e.message);
                    })
                    .finally(function () {
                        GF.cargando(btn, false);
                        actualizarBotonRol(rolId);
                    });
            });
        });
    });

    // ------------------------------------------------------------------ Auditoría
    var auCargado = false;
    var ETIQUETAS = {
        'permisos.masivo.conceder': 'Conceder en lote',
        'permisos.masivo.denegar': 'Denegar en lote',
        'permisos.masivo.quitar': 'Volver al estándar en lote',
        'permisos.reiniciar': 'Volver al estándar',
        'permisos.rol': 'Cambio de rol'
    };

    function detalle(d) {
        if (!d) return '—';
        var out = [];
        if (d.rol) out.push('Rol: ' + esc(d.rol));
        if (d.roles) out.push('Roles: ' + esc(d.roles.join(', ')));
        if (d.agregados && d.agregados.length) out.push('Agregó: ' + esc(d.agregados.join(', ')));
        if (d.quitados && d.quitados.length) out.push('Quitó: ' + esc(d.quitados.join(', ')));
        if (d.permisos && d.permisos.length) out.push('Permisos: ' + esc(d.permisos.join(', ')));
        if (d.usuarios_modificados !== undefined) out.push(d.usuarios_modificados + ' usuarios en ' + d.restaurantes_modificados + ' restaurantes');
        if (d.excepciones_quitadas !== undefined) out.push(d.usuarios + ' usuarios, ' + d.excepciones_quitadas + ' excepciones quitadas');
        return out.join('<br>') || '—';
    }

    function cargarAuditoria() {
        GF.api
            .get('/admin/permisos/masivo/auditoria', 'No se pudo cargar la auditoría')
            .then(function (r) {
                auCargado = true;
                if (!r.registros.length) {
                    $('auCuerpo').innerHTML = '<tr><td colspan="4" class="text-muted text-center py-4">Todavía no hay cambios registrados.</td></tr>';
                    return;
                }
                $('auCuerpo').innerHTML = r.registros
                    .map(function (a) {
                        return (
                            '<tr><td class="text-nowrap">' + esc(new Date(a.created_at).toLocaleString('es-CO')) + '</td>' +
                            '<td>' + esc(a.username || '—') + '</td>' +
                            '<td>' + esc(ETIQUETAS[a.accion] || a.accion) + '</td>' +
                            '<td class="small">' + detalle(a.detalles) + '</td></tr>'
                        );
                    })
                    .join('');
            })
            .catch(function (e) {
                $('auCuerpo').innerHTML = '<tr><td colspan="4" class="text-danger text-center py-4">' + esc(e.message) + '</td></tr>';
            });
    }
    $('btnTabAuditoria').addEventListener('shown.bs.tab', function () {
        if (!auCargado) cargarAuditoria();
    });
})();
