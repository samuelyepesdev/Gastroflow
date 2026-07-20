document.addEventListener('DOMContentLoaded', function () {
    const btnPreview = document.getElementById('btnPreviewFactura');
    const modalPreview = new bootstrap.Modal(document.getElementById('modalPreviewFactura'));
    const iframePreview = document.getElementById('iframePreview');

    if (btnPreview) {
        btnPreview.addEventListener('click', function () {
            const form = document.querySelector('form[action="/configuracion"]');
            const params = new URLSearchParams();
            if (form) {
                const nombre = form.querySelector('[name="nombre_negocio"]');
                const direccion = form.querySelector('[name="direccion"]');
                const telefono = form.querySelector('[name="telefono"]');
                const nit = form.querySelector('[name="nit"]');
                const pie = form.querySelector('[name="pie_pagina"]');
                const ancho = form.querySelector('[name="ancho_papel"]');
                const fontSize = form.querySelector('[name="font_size"]');
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
