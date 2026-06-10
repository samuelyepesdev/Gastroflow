document.addEventListener('DOMContentLoaded', function () {
    const btnPreview = document.getElementById('btnPreviewFactura');
    const modalPreview = new bootstrap.Modal(document.getElementById('modalPreviewFactura'));
    const iframePreview = document.getElementById('iframePreview');

    if (btnPreview) {
        btnPreview.addEventListener('click', function () {
            var form = document.querySelector('form[action="/configuracion"]');
            var params = new URLSearchParams();
            if (form) {
                var nombre = form.querySelector('[name="nombre_negocio"]');
                var direccion = form.querySelector('[name="direccion"]');
                var telefono = form.querySelector('[name="telefono"]');
                var nit = form.querySelector('[name="nit"]');
                var pie = form.querySelector('[name="pie_pagina"]');
                var ancho = form.querySelector('[name="ancho_papel"]');
                var fontSize = form.querySelector('[name="font_size"]');
                if (nombre && nombre.value) params.set('nombre_negocio', nombre.value);
                if (direccion && direccion.value) params.set('direccion', direccion.value);
                if (telefono && telefono.value) params.set('telefono', telefono.value);
                if (nit && nit.value) params.set('nit', nit.value);
                if (pie && pie.value) params.set('pie_pagina', pie.value);
                if (ancho && ancho.value) params.set('ancho_papel', ancho.value);
                if (fontSize && fontSize.value) params.set('font_size', fontSize.value);
            }
            iframePreview.src = '/configuracion/preview' + (params.toString() ? '?' + params.toString() : '');
            modalPreview.show();
        });
    }
});
