(function () {
    'use strict';

    var datosEl = document.getElementById('anuncios-data');
    var anuncios = datosEl ? JSON.parse(datosEl.textContent) : [];
    var modalEl = document.getElementById('modalAnuncio');
    var modal = new bootstrap.Modal(modalEl);
    var stage = document.getElementById('previewStage');

    var COLOR_DEFECTO = { funcionalidad: '#e8431f', actualizacion: '#0891b2', tutorial: '#059669', aviso: '#d97706' };
    var colorPersonalizado = false;

    function $(id) {
        return document.getElementById(id);
    }

    function tipoActual() {
        return document.querySelector('input[name="tipo"]:checked').value;
    }

    function itemsDeTexto() {
        return $('fItems').value
            .split('\n')
            .map(function (l) { return l.trim(); })
            .filter(Boolean);
    }

    function marcados(nombre) {
        return Array.prototype.map.call(document.querySelectorAll('input[name="' + nombre + '"]:checked'), function (c) {
            return c.value;
        });
    }

    function leerFormulario() {
        return {
            tipo: tipoActual(),
            titulo: $('fTitulo').value.trim(),
            cuerpo: $('fCuerpo').value.trim(),
            items: itemsDeTexto(),
            version: $('fVersion').value.trim(),
            boton_texto: $('fBotonTexto').value.trim(),
            boton_url: $('fBotonUrl').value.trim(),
            color_acento: colorPersonalizado ? $('fColor').value : '',
            frecuencia: $('fFrecuencia').value,
            planes: marcados('plan'),
            roles: marcados('rol'),
            fecha_inicio: $('fInicio').value,
            fecha_fin: $('fFin').value,
            activo: $('fActivo').checked
        };
    }

    function actualizarAyudaItems() {
        var tipo = tipoActual();
        $('ayudaItems').textContent =
            tipo === 'tutorial'
                ? 'En un tutorial cada línea es un paso del carrusel.'
                : tipo === 'actualizacion'
                  ? 'Cada línea es un cambio de la lista (entran uno a uno con animación).'
                  : 'Cada línea es un punto con check.';
    }

    function pintarPreview() {
        var datos = leerFormulario();
        if (!colorPersonalizado) $('fColor').value = COLOR_DEFECTO[datos.tipo];
        stage.textContent = '';
        stage.appendChild(GFAnuncios.crearTarjeta(datos, { estatico: true, mostrarNoMostrar: datos.frecuencia === 'cada_login', onCerrar: function () {} }));
    }

    function repetirAnimacion() {
        // Un tipo con animación de entrada: se vuelve a crear la tarjeta con animación completa (sin .gfa-estatico)
        var datos = leerFormulario();
        stage.textContent = '';
        var card = GFAnuncios.crearTarjeta(datos, { estatico: true, onCerrar: function () {} });
        card.classList.remove('gfa-estatico');
        stage.appendChild(card);
    }

    function limpiarFormulario() {
        $('formAnuncio').reset();
        $('anuncioId').value = '';
        colorPersonalizado = false;
        $('fColor').value = COLOR_DEFECTO.funcionalidad;
        actualizarAyudaItems();
    }

    function abrirNuevo() {
        limpiarFormulario();
        $('modalAnuncioTitulo').textContent = 'Nuevo anuncio';
        pintarPreview();
        modal.show();
    }

    function abrirEditar(id) {
        var a = anuncios.find(function (x) { return x.id === id; });
        if (!a) return;
        limpiarFormulario();
        $('modalAnuncioTitulo').textContent = 'Editar anuncio';
        $('anuncioId').value = a.id;
        document.querySelector('input[name="tipo"][value="' + a.tipo + '"]').checked = true;
        $('fTitulo').value = a.titulo || '';
        $('fCuerpo').value = a.cuerpo || '';
        $('fItems').value = (a.items || []).join('\n');
        $('fVersion').value = a.version || '';
        $('fBotonTexto').value = a.boton_texto || '';
        $('fBotonUrl').value = a.boton_url || '';
        colorPersonalizado = !!a.color_acento;
        $('fColor').value = a.color_acento || COLOR_DEFECTO[a.tipo];
        $('fFrecuencia').value = a.frecuencia;
        $('fInicio').value = a.fecha_inicio || '';
        $('fFin').value = a.fecha_fin || '';
        $('fActivo').checked = !!a.activo;
        (a.planes || []).forEach(function (pid) {
            var c = document.querySelector('input[name="plan"][value="' + pid + '"]');
            if (c) c.checked = true;
        });
        (a.roles || []).forEach(function (r) {
            var c = document.querySelector('input[name="rol"][value="' + r + '"]');
            if (c) c.checked = true;
        });
        actualizarAyudaItems();
        pintarPreview();
        modal.show();
    }

    async function guardar() {
        var datos = leerFormulario();
        if (!datos.titulo) {
            GF.error('Escribe un título para el anuncio');
            return;
        }
        var id = $('anuncioId').value;
        var btn = $('btnGuardarAnuncio');
        GF.cargando(btn, true);
        try {
            if (id) {
                await GF.api.put('/admin/anuncios/' + id, datos, 'No se pudo guardar el anuncio');
            } else {
                await GF.api.post('/admin/anuncios', datos, 'No se pudo crear el anuncio');
            }
            location.reload();
        } catch (error) {
            GF.cargando(btn, false);
            GF.error(error.message);
        }
    }

    // Eventos
    $('btnNuevoAnuncio').addEventListener('click', abrirNuevo);
    $('btnGuardarAnuncio').addEventListener('click', guardar);
    $('btnReplay').addEventListener('click', repetirAnimacion);
    $('btnColorDefecto').addEventListener('click', function () {
        colorPersonalizado = false;
        pintarPreview();
    });
    $('fColor').addEventListener('input', function () {
        colorPersonalizado = true;
        pintarPreview();
    });
    $('formAnuncio').addEventListener('input', pintarPreview);
    $('formAnuncio').addEventListener('change', function (e) {
        if (e.target.name === 'tipo') actualizarAyudaItems();
        pintarPreview();
    });

    document.addEventListener('click', async function (e) {
        var editar = e.target.closest('.js-editar');
        if (editar) return abrirEditar(Number(editar.dataset.id));

        var eliminar = e.target.closest('.js-eliminar');
        if (eliminar) {
            var ok = await GF.confirmar('Se borrará también su historial de vistas. Esta acción no se puede deshacer.', { titulo: '¿Eliminar este anuncio?', confirmar: 'Eliminar', peligro: true });
            if (!ok) return;
            try {
                await GF.api.delete('/admin/anuncios/' + eliminar.dataset.id, 'No se pudo eliminar');
                location.reload();
            } catch (error) {
                GF.error(error.message);
            }
        }
    });

    document.addEventListener('change', async function (e) {
        var sw = e.target.closest('.js-activo');
        if (!sw) return;
        try {
            await GF.api.patch('/admin/anuncios/' + sw.dataset.id + '/activo', { activo: sw.checked }, 'No se pudo cambiar el estado');
            sw.closest('.anuncio-card').classList.toggle('inactivo', !sw.checked);
            GF.toast(sw.checked ? 'Anuncio activado' : 'Anuncio desactivado');
        } catch (error) {
            sw.checked = !sw.checked;
            GF.error(error.message);
        }
    });
})();
