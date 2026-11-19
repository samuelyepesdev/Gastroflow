/**
 * carta_foto.js — Importar la carta desde una foto.
 * 1) La foto se reduce en el navegador y se envía a /productos/importar-carta/analizar (devuelve un borrador).
 * 2) El dueño revisa y corrige. 3) /productos/importar-carta/confirmar crea los productos.
 * Usa GF.api / GF.escapeHtml (public/js/core/gf.js). Todo texto que viene de la IA se escapa.
 */
(function () {
    'use strict';

    const MAX_LADO = 1600; // px: lo bastante nítido para leer letra pequeña y mucho más liviano que una foto de celular
    const CALIDAD = 0.85;

    const $ = id => document.getElementById(id);
    const esc = v => GF.escapeHtml(v == null ? '' : String(v));
    const modalEl = $('cartaFotoModal');
    if (!modalEl) {
        return;
    }

    let archivo = null; // Blob listo para enviar
    let urlPrevia = null;
    let borrador = [];

    const mostrar = (...ids) => {
        ['cfPaso1', 'cfCargando', 'cfPaso2', 'cfPaso3'].forEach(id => $(id).classList.toggle('d-none', !ids.includes(id)));
    };
    const botones = estado => {
        $('cfLeer').classList.toggle('d-none', !estado.leer);
        $('cfImportar').classList.toggle('d-none', !estado.importar);
        $('cfOtra').classList.toggle('d-none', !estado.otra);
        $('cfListo').classList.toggle('d-none', !estado.listo);
        $('cfCerrar').classList.toggle('d-none', !!estado.listo);
    };
    const error = mensaje => {
        const caja = $('cfError');
        caja.textContent = mensaje || '';
        caja.classList.toggle('d-none', !mensaje);
    };
    const pesos = n => (n === '' || n == null ? '' : Number(n).toLocaleString('es-CO'));
    const soloDigitos = v => String(v).replace(/\D/g, '');

    function reiniciar() {
        archivo = null;
        borrador = [];
        if (urlPrevia) {
            URL.revokeObjectURL(urlPrevia);
            urlPrevia = null;
        }
        $('cfArchivo').value = '';
        $('cfPrevia').classList.add('d-none');
        $('cfArchivoTexto').textContent = 'Elegir o tomar una foto';
        error('');
        mostrar('cfPaso1');
        botones({ leer: true });
        $('cfLeer').disabled = true;
    }

    // ------------------------------------------------------------------ foto

    /** Reduce la foto a MAX_LADO y la convierte a JPEG. Si el navegador no la puede decodificar (p. ej. HEIC) falla con un mensaje claro. */
    async function reducir(file) {
        let bitmap;
        try {
            bitmap = await createImageBitmap(file);
        } catch {
            throw new Error('No pudimos abrir esa foto. Usa una imagen JPG, PNG o WebP.');
        }
        const escala = Math.min(1, MAX_LADO / Math.max(bitmap.width, bitmap.height));
        const lienzo = document.createElement('canvas');
        lienzo.width = Math.round(bitmap.width * escala);
        lienzo.height = Math.round(bitmap.height * escala);
        const ctx = lienzo.getContext('2d');
        ctx.fillStyle = '#fff'; // los PNG con fondo transparente quedarían negros en JPEG
        ctx.fillRect(0, 0, lienzo.width, lienzo.height);
        ctx.drawImage(bitmap, 0, 0, lienzo.width, lienzo.height);
        bitmap.close?.();
        const blob = await new Promise(resolve => lienzo.toBlob(resolve, 'image/jpeg', CALIDAD));
        if (!blob) {
            throw new Error('No pudimos preparar la foto. Intenta con otra.');
        }
        return blob;
    }

    $('cfArchivo').addEventListener('change', async () => {
        const file = $('cfArchivo').files[0];
        error('');
        if (!file) {
            return;
        }
        $('cfLeer').disabled = true;
        try {
            archivo = await reducir(file);
            if (urlPrevia) {
                URL.revokeObjectURL(urlPrevia);
            }
            urlPrevia = URL.createObjectURL(archivo);
            $('cfPrevia').src = urlPrevia;
            $('cfPrevia').classList.remove('d-none');
            $('cfArchivoTexto').textContent = 'Cambiar foto';
            $('cfLeer').disabled = false;
        } catch (e) {
            archivo = null;
            error(e.message);
        }
    });

    // ------------------------------------------------------------------ leer

    $('cfLeer').addEventListener('click', async () => {
        if (!archivo) {
            return;
        }
        error('');
        mostrar('cfCargando');
        botones({});
        try {
            const datos = new FormData();
            datos.append('imagen', archivo, 'carta.jpg');
            const r = await GF.api('/productos/importar-carta/analizar', { method: 'POST', body: datos }, 'No se pudo leer la carta');
            borrador = r.productos.map(p => ({ ...p, incluir: true }));
            pintarBorrador(r.sin_precio);
        } catch (e) {
            mostrar('cfPaso1');
            botones({ leer: true });
            error(e.message);
        }
    });

    // ------------------------------------------------------------------ revisión

    function pintarBorrador(sinPrecio) {
        const dudosos = borrador.filter(p => p.precio_dudoso).length;
        $('cfResumenLectura').textContent =
            `Encontramos ${borrador.length} ${borrador.length === 1 ? 'producto' : 'productos'}.` +
            (dudosos ? ` ${dudosos} tienen un precio para revisar (marcados en coral).` : '') +
            (sinPrecio ? ` ${sinPrecio} no tenían precio: complétalo.` : '');

        $('cfFilas').innerHTML = borrador
            .map(
                (p, i) => `
            <tr class="${p.precio_dudoso ? 'cf-fila--dudosa' : ''}" data-i="${i}">
                <td><input type="checkbox" class="form-check-input cf-incluir" checked aria-label="Importar ${esc(p.nombre)}"></td>
                <td>
                    <input type="text" class="form-control form-control-sm cf-nombre" maxlength="100" value="${esc(p.nombre)}" aria-label="Nombre">
                    ${p.descripcion ? `<div class="cf-desc">${esc(p.descripcion)}</div>` : ''}
                </td>
                <td><input type="text" class="form-control form-control-sm cf-categoria" maxlength="60" value="${esc(p.categoria)}" aria-label="Categoría"></td>
                <td>
                    <input type="text" class="form-control form-control-sm cf-precio" inputmode="numeric" value="${esc(pesos(p.precio))}" placeholder="0" aria-label="Precio">
                    ${p.precio_dudoso ? '<div class="cf-aviso-precio"><i class="bi bi-exclamation-circle me-1" aria-hidden="true"></i>Revisa este precio</div>' : ''}
                </td>
            </tr>`
            )
            .join('');
        $('cfTodos').checked = true;
        mostrar('cfPaso2');
        botones({ importar: true, otra: true });
        actualizarContador();
    }

    function filas() {
        return Array.from($('cfFilas').querySelectorAll('tr'));
    }

    function actualizarContador() {
        const n = filas().filter(tr => tr.querySelector('.cf-incluir').checked).length;
        $('cfImportarTexto').textContent = n ? `Importar ${n} ${n === 1 ? 'producto' : 'productos'}` : 'Importar';
        $('cfImportar').disabled = n === 0;
    }

    $('cfFilas').addEventListener('input', evento => {
        if (evento.target.classList.contains('cf-precio')) {
            evento.target.value = pesos(soloDigitos(evento.target.value));
            evento.target.closest('tr').classList.remove('cf-fila--error');
        }
    });
    $('cfFilas').addEventListener('change', evento => {
        if (evento.target.classList.contains('cf-incluir')) {
            evento.target.closest('tr').classList.toggle('cf-fila--descartada', !evento.target.checked);
            actualizarContador();
        }
    });
    $('cfTodos').addEventListener('change', () => {
        filas().forEach(tr => {
            const check = tr.querySelector('.cf-incluir');
            check.checked = $('cfTodos').checked;
            tr.classList.toggle('cf-fila--descartada', !check.checked);
        });
        actualizarContador();
    });

    // ------------------------------------------------------------------ importar

    $('cfImportar').addEventListener('click', async () => {
        const items = [];
        let faltaPrecio = false;
        filas().forEach(tr => {
            if (!tr.querySelector('.cf-incluir').checked) {
                return;
            }
            const i = Number(tr.dataset.i);
            const precio = soloDigitos(tr.querySelector('.cf-precio').value);
            tr.classList.toggle('cf-fila--error', precio === '');
            if (precio === '') {
                faltaPrecio = true;
            }
            items.push({
                nombre: tr.querySelector('.cf-nombre').value,
                categoria: tr.querySelector('.cf-categoria').value,
                descripcion: borrador[i]?.descripcion || null,
                precio: precio === '' ? null : Number(precio)
            });
        });
        if (faltaPrecio) {
            GF.toast('Completa el precio de los productos marcados en rojo (o desmárcalos)', 'warning');
            return;
        }

        const btn = $('cfImportar');
        GF.cargando(btn, true);
        try {
            const r = await GF.api.post('/productos/importar-carta/confirmar', { items }, 'No se pudo importar la carta');
            pintarResultado(r);
        } catch (e) {
            GF.error(e.message);
        } finally {
            GF.cargando(btn, false);
        }
    });

    function pintarResultado(r) {
        $('cfResultadoTitulo').textContent =
            r.creados === 0
                ? 'No se creó ningún producto'
                : `Se ${r.creados === 1 ? 'creó 1 producto' : `crearon ${r.creados} productos`}`;
        const bloque = (titulo, lista, texto) =>
            lista.length
                ? `<p class="fw-semibold mb-1">${esc(titulo)}</p><ul class="cf-lista">${lista
                      .map(x => `<li>${esc(x.nombre)} — ${esc(texto(x))}</li>`)
                      .join('')}</ul>`
                : '';
        $('cfResultadoDetalle').innerHTML =
            (r.categorias_creadas ? `<p class="small text-muted">Categorías nuevas: ${r.categorias_creadas}.</p>` : '') +
            bloque(`Omitidos (${r.omitidos.length})`, r.omitidos, x => x.motivo) +
            bloque(`Con error (${r.errores.length})`, r.errores, x => x.mensaje);
        mostrar('cfPaso3');
        botones({ listo: true });
    }

    $('cfListo').addEventListener('click', () => window.location.reload());
    $('cfOtra').addEventListener('click', reiniciar);
    modalEl.addEventListener('hidden.bs.modal', () => {
        // Si ya se importó, la tabla de productos de la página está desactualizada.
        if (!$('cfPaso3').classList.contains('d-none')) {
            window.location.reload();
            return;
        }
        reiniciar();
    });

    reiniciar();
})();
