/* «Personalizar menú»: cada usuario oculta o muestra enlaces de su barra. Solo visual, no cambia permisos.
   Usa GF.api (public/js/core/gf.js). Tras guardar se recarga la página para que la barra se redibuje. */
(function () {
    'use strict';

    const modal = document.getElementById('modalMenuPersonal');
    if (!modal) return;

    const checks = () => [...modal.querySelectorAll('.mp-check')];
    const $ = id => document.getElementById(id);

    function contar() {
        const todos = checks();
        const visibles = todos.filter(c => c.checked).length;
        $('mpContador').textContent = `Mostrando ${visibles} de ${todos.length}`;
    }

    async function guardar() {
        const boton = $('mpGuardar');
        GF.cargando(boton, true);
        try {
            const oculto = checks()
                .filter(c => !c.checked)
                .map(c => c.dataset.clave);
            await GF.api.put('/api/menu-personal', { oculto }, 'No se pudo guardar tu menú');
            location.reload();
        } catch (e) {
            GF.cargando(boton, false);
            GF.error(e.message);
        }
    }

    async function restablecer() {
        const boton = $('mpRestablecer');
        GF.cargando(boton, true);
        try {
            await GF.api.delete('/api/menu-personal', 'No se pudo restablecer tu menú');
            location.reload();
        } catch (e) {
            GF.cargando(boton, false);
            GF.error(e.message);
        }
    }

    modal.addEventListener('change', e => {
        if (e.target.classList.contains('mp-check')) contar();
    });
    $('mpMostrarTodos').addEventListener('click', () => {
        checks().forEach(c => (c.checked = true));
        contar();
    });
    $('mpOcultarTodos').addEventListener('click', () => {
        checks().forEach(c => (c.checked = false));
        contar();
    });
    $('mpGuardar').addEventListener('click', guardar);
    $('mpRestablecer').addEventListener('click', restablecer);
    contar();
})();
