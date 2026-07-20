// Extraída del click de vista previa (S3776): convierte 7 ifs anidados en 7
// llamadas planas (las llamadas a función no suman complejidad cognitiva).
function agregarParamSiExiste(params, form, selector, key) {
    const el = form.querySelector(selector);
    if (el?.value) params.set(key, el.value);
}

document.addEventListener('DOMContentLoaded', function () {
    const btnPreview = document.getElementById('btnPreviewFactura');
    const modalPreview = new bootstrap.Modal(document.getElementById('modalPreviewFactura'));
    const iframePreview = document.getElementById('iframePreview');

    if (btnPreview) {
        btnPreview.addEventListener('click', function () {
            const form = document.querySelector('form[action="/configuracion"]');
            const params = new URLSearchParams();
            if (form) {
                agregarParamSiExiste(params, form, '[name="nombre_negocio"]', 'nombre_negocio');
                agregarParamSiExiste(params, form, '[name="direccion"]', 'direccion');
                agregarParamSiExiste(params, form, '[name="telefono"]', 'telefono');
                agregarParamSiExiste(params, form, '[name="nit"]', 'nit');
                agregarParamSiExiste(params, form, '[name="pie_pagina"]', 'pie_pagina');
                agregarParamSiExiste(params, form, '[name="ancho_papel"]', 'ancho_papel');
                agregarParamSiExiste(params, form, '[name="font_size"]', 'font_size');
            }
            iframePreview.src = '/configuracion/preview' + (params.toString() ? '?' + params.toString() : '');
            modalPreview.show();
        });
    }
});
