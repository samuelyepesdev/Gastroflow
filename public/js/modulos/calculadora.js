/**
 * calculadora.js — Calculadora pública de pérdidas.
 * El cálculo lo hace el servidor (una sola fuente de cifras): aquí solo se envía el formulario y se pinta.
 */
(function () {
    'use strict';

    const $ = id => document.getElementById(id);
    const form = $('caForm');
    const resultado = $('caResultado');
    const errorBox = $('caError');
    const boton = $('caEnviar');

    const pesos = n => '$ ' + Math.round(n).toLocaleString('es-CO');

    // Campos de dinero: se muestran con puntos de miles mientras se escribe.
    form.querySelectorAll('[data-dinero]').forEach(input => {
        const formatear = () => {
            const digitos = input.value.replace(/\D/g, '');
            input.value = digitos ? Number(digitos).toLocaleString('es-CO') : '';
        };
        input.addEventListener('input', formatear);
        formatear();
    });

    function mostrarError(mensaje) {
        errorBox.textContent = mensaje;
        errorBox.classList.remove('d-none');
        errorBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    function leerCampos() {
        const datos = {};
        for (const el of form.elements) {
            if (!el.name) continue;
            if (el.type === 'checkbox') {
                datos[el.name] = el.checked;
            } else if (el.hasAttribute('data-dinero')) {
                // El campo muestra "45.000": al servidor viaja solo "45000".
                datos[el.name] = el.value.replace(/\D/g, '');
            } else {
                datos[el.name] = el.value.trim();
            }
        }
        return datos;
    }

    function pintar(r) {
        $('caTotalMes').textContent = pesos(r.perdida_mes);
        $('caTotalAnio').textContent = pesos(r.perdida_anio);
        $('caNoShowMes').textContent = pesos(r.no_show_mes);
        $('caMermaMes').textContent = pesos(r.merma_mes);
        $('caRecuperaMes').textContent = pesos(r.recuperable_mes);
        form.classList.add('d-none');
        resultado.classList.remove('d-none');
        resultado.focus();
        resultado.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    form.addEventListener('submit', async evento => {
        evento.preventDefault();
        errorBox.classList.add('d-none');
        boton.disabled = true;
        try {
            const resp = await fetch('/calculadora/calcular', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(leerCampos())
            });
            const json = await resp.json().catch(() => ({}));
            if (!resp.ok) {
                throw new Error(json.error || json.message || 'No se pudo calcular. Intenta de nuevo.');
            }
            if (!json.resultado) {
                // Respuesta del campo trampa: no hay cifras que mostrar.
                throw new Error('No se pudo calcular. Intenta de nuevo.');
            }
            pintar(json.resultado);
        } catch (error) {
            mostrarError(error.message);
        } finally {
            boton.disabled = false;
        }
    });

    $('caOtra').addEventListener('click', () => {
        resultado.classList.add('d-none');
        form.classList.remove('d-none');
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });
})();
