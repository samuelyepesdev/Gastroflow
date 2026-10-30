// Banner "Instalar GastroFlow" + registro del service worker.
// Android/Chrome/Brave: usa beforeinstallprompt. iOS Safari no lo soporta,
// ahí se muestran las instrucciones de "Añadir a pantalla de inicio".
(function () {
    'use strict';

    var CLAVE = 'gf_pwa_descartado';
    var DIAS_OCULTO = 7;

    if ('serviceWorker' in navigator) {
        window.addEventListener('load', function () {
            navigator.serviceWorker.register('/sw.js').catch(function () {});
        });
    }

    var instalada = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
    if (instalada) return;

    function descartadoReciente() {
        try {
            var t = parseInt(localStorage.getItem(CLAVE), 10);
            return t && Date.now() - t < DIAS_OCULTO * 86400000;
        } catch (_) { return false; }
    }
    function recordarDescarte() {
        try { localStorage.setItem(CLAVE, String(Date.now())); } catch (_) {}
    }

    var evento = null;
    var banner = null;

    function crearBanner(textoBoton, subtitulo, alClick) {
        if (banner || descartadoReciente()) return;

        var css = document.createElement('style');
        css.textContent =
            '.gf-pwa{position:fixed;left:12px;right:12px;bottom:12px;z-index:2000;max-width:520px;margin:0 auto;' +
            'display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:18px;background:#0e1b2c;color:#fff;' +
            'box-shadow:0 10px 30px rgba(0,0,0,.35);font-family:system-ui,sans-serif}' +
            '.gf-pwa img{width:44px;height:44px;border-radius:12px;flex:none}' +
            '.gf-pwa div{flex:1;min-width:0}.gf-pwa b{display:block;font-size:.95rem}' +
            '.gf-pwa small{display:block;opacity:.7;font-size:.78rem;line-height:1.25}' +
            '.gf-pwa button{border:0;cursor:pointer;font:inherit}' +
            '.gf-pwa .gf-pwa-ok{background:#ff5a36;color:#0e1b2c;font-weight:700;padding:9px 16px;border-radius:999px}' +
            '.gf-pwa .gf-pwa-x{background:none;color:#fff;opacity:.7;font-size:1.3rem;padding:4px 8px}' +
            '.gf-pwa b{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.gf-pwa .gf-pwa-ok{white-space:nowrap}' +
            '@media(max-width:420px){.gf-pwa{left:8px;right:8px;bottom:8px;gap:8px;padding:8px 8px 8px 10px;border-radius:16px}' +
            '.gf-pwa img{width:36px;height:36px;border-radius:10px}.gf-pwa small{display:none}' +
            '.gf-pwa .gf-pwa-ok{padding:8px 14px;font-size:.85rem}.gf-pwa .gf-pwa-x{padding:2px 6px}}';
        document.head.appendChild(css);

        banner = document.createElement('div');
        banner.className = 'gf-pwa';
        banner.setAttribute('role', 'dialog');
        banner.innerHTML =
            '<img src="/icons/icon-192.png" alt="">' +
            '<div><b>Instala GastroFlow</b><small></small></div>' +
            '<button type="button" class="gf-pwa-ok"></button>' +
            '<button type="button" class="gf-pwa-x" aria-label="Cerrar">&times;</button>';
        banner.querySelector('small').textContent = subtitulo;
        var ok = banner.querySelector('.gf-pwa-ok');
        ok.textContent = textoBoton;
        ok.addEventListener('click', alClick);
        banner.querySelector('.gf-pwa-x').addEventListener('click', function () {
            recordarDescarte();
            cerrar();
        });
        document.body.appendChild(banner);
    }

    function cerrar() {
        if (banner) { banner.remove(); banner = null; }
    }

    window.addEventListener('beforeinstallprompt', function (e) {
        e.preventDefault();
        evento = e;
        crearBanner('Instalar', 'Acceso directo en tu pantalla de inicio', function () {
            if (!evento) return;
            evento.prompt();
            evento.userChoice.then(function (r) {
                if (r.outcome !== 'accepted') recordarDescarte();
                evento = null;
                cerrar();
            });
        });
    });

    window.addEventListener('appinstalled', function () {
        evento = null;
        cerrar();
    });

    // ---- iOS: Safari no permite instalar desde código, así que se guía paso a paso ----
    var ua = navigator.userAgent;
    // iPadOS 13+ se presenta como Mac con pantalla táctil
    var esIPad = /ipad/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    var esIOS = (/iphone|ipod/i.test(ua) || esIPad) && !window.MSStream;
    // Chrome/Firefox/Edge/Opera en iOS y los navegadores internos de apps no pueden instalar
    var esSafari = !/CriOS|FxiOS|EdgiOS|OPiOS|GSA\/|FBAN|FBAV|Instagram|WhatsApp|Line\/|MicroMessenger|Snapchat|TikTok/i.test(ua);

    var ICONO_COMPARTIR =
        '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" ' +
        'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
        '<path d="M12 3v12M8 7l4-4 4 4M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1"/></svg>';
    var ICONO_ANADIR =
        '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" ' +
        'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
        '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M12 8v8M8 12h8"/></svg>';

    function estilosGuia() {
        if (document.getElementById('gf-pwa-guia-css')) return;
        var css = document.createElement('style');
        css.id = 'gf-pwa-guia-css';
        css.textContent =
            '.gf-pwa-fondo{position:fixed;inset:0;z-index:2100;background:rgba(14, 27, 44,.72);display:flex;' +
            'align-items:center;justify-content:center;padding:16px;font-family:system-ui,sans-serif}' +
            '.gf-pwa-guia{background:#fff;color:#0e1b2c;border-radius:20px;max-width:380px;width:100%;padding:20px;' +
            'box-shadow:0 20px 50px rgba(0,0,0,.4)}' +
            '.gf-pwa-guia h2{font-size:1.1rem;margin:0 0 4px}' +
            '.gf-pwa-guia p{margin:0 0 12px;font-size:.88rem;color:#46566a}' +
            '.gf-pwa-guia ol{list-style:none;margin:0 0 14px;padding:0;display:flex;flex-direction:column;gap:10px}' +
            '.gf-pwa-guia li{display:flex;align-items:center;gap:12px;font-size:.95rem}' +
            '.gf-pwa-paso{flex:none;width:44px;height:44px;border-radius:12px;background:#fff0eb;color:#e8431f;' +
            'display:flex;align-items:center;justify-content:center}' +
            '.gf-pwa-num{flex:none;width:22px;height:22px;border-radius:50%;background:#0e1b2c;color:#fff;' +
            'font-size:.75rem;font-weight:700;display:flex;align-items:center;justify-content:center}' +
            '.gf-pwa-guia button{border:0;cursor:pointer;font:inherit;width:100%;padding:11px;border-radius:12px;' +
            'font-weight:700;background:#ff5a36;color:#fff}' +
            '.gf-pwa-guia .gf-pwa-sec{background:#e4dccf;color:#0e1b2c;margin-bottom:8px}' +
            '.gf-pwa-flecha{position:fixed;z-index:2101;font-size:2.4rem;line-height:1;color:#fff;text-align:center;' +
            'text-shadow:0 2px 8px rgba(0,0,0,.6);animation:gf-pwa-rebote 1s ease-in-out infinite;pointer-events:none}' +
            '.gf-pwa-flecha small{display:block;font-size:.8rem;font-weight:700}' +
            '@keyframes gf-pwa-rebote{0%,100%{transform:translateY(0)}50%{transform:translateY(8px)}}' +
            '@media (prefers-reduced-motion:reduce){.gf-pwa-flecha{animation:none}}';
        document.head.appendChild(css);
    }

    function pasoGuia(num, icono, texto) {
        var li = document.createElement('li');
        var n = document.createElement('span');
        n.className = 'gf-pwa-num';
        n.textContent = num;
        var ic = document.createElement('span');
        ic.className = 'gf-pwa-paso';
        ic.innerHTML = icono; // SVG fijo, sin datos del usuario
        var t = document.createElement('span');
        t.textContent = texto;
        li.appendChild(n);
        li.appendChild(ic);
        li.appendChild(t);
        return li;
    }

    function abrirGuia(config) {
        estilosGuia();
        var fondo = document.createElement('div');
        fondo.className = 'gf-pwa-fondo';
        fondo.setAttribute('role', 'dialog');
        fondo.setAttribute('aria-modal', 'true');

        var caja = document.createElement('div');
        caja.className = 'gf-pwa-guia';
        var h = document.createElement('h2');
        h.textContent = config.titulo;
        var p = document.createElement('p');
        p.textContent = config.subtitulo;
        caja.appendChild(h);
        caja.appendChild(p);
        var ol = document.createElement('ol');
        config.pasos.forEach(function (paso, i) {
            ol.appendChild(pasoGuia(i + 1, paso.icono, paso.texto));
        });
        caja.appendChild(ol);

        if (config.copiar) {
            var cp = document.createElement('button');
            cp.type = 'button';
            cp.className = 'gf-pwa-sec';
            cp.textContent = 'Copiar enlace';
            cp.addEventListener('click', function () {
                var listo = function () {
                    cp.textContent = '¡Enlace copiado!';
                };
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    navigator.clipboard.writeText(location.origin + '/auth/login').then(listo, function () {});
                }
            });
            caja.appendChild(cp);
        }

        // Flecha que señala dónde está el botón Compartir de Safari
        var flecha = null;
        if (config.flecha) {
            flecha = document.createElement('div');
            flecha.className = 'gf-pwa-flecha';
            flecha.setAttribute('aria-hidden', 'true');
            flecha.style.cssText = config.flecha.estilo;
            var etiqueta = document.createElement('small');
            etiqueta.textContent = config.flecha.texto;
            var simbolo = document.createElement('span');
            simbolo.textContent = config.flecha.simbolo;
            var orden = config.flecha.arriba ? [simbolo, etiqueta] : [etiqueta, simbolo];
            orden.forEach(function (nodo) {
                flecha.appendChild(nodo);
            });
        }

        var ok = document.createElement('button');
        ok.type = 'button';
        ok.textContent = 'Entendido';
        function cerrarGuia() {
            fondo.remove();
            if (flecha) flecha.remove();
            document.removeEventListener('keydown', onKey);
            recordarDescarte();
            cerrar();
        }
        function onKey(e) {
            if (e.key === 'Escape') cerrarGuia();
        }
        ok.addEventListener('click', cerrarGuia);
        fondo.addEventListener('click', function (e) {
            if (e.target === fondo) cerrarGuia();
        });
        document.addEventListener('keydown', onKey);
        caja.appendChild(ok);
        fondo.appendChild(caja);
        document.body.appendChild(fondo);
        if (flecha) document.body.appendChild(flecha);
        ok.focus();
    }

    function guiaSafari() {
        abrirGuia({
            titulo: 'Instala GastroFlow en tu ' + (esIPad ? 'iPad' : 'iPhone'),
            subtitulo: 'Pocos toques y queda como una app en tu pantalla de inicio.',
            pasos: [
                {
                    icono: ICONO_COMPARTIR,
                    texto: esIPad
                        ? 'Toca Compartir, arriba a la derecha'
                        : 'Toca Compartir, en la barra de abajo. Si ves "⋯", tócalo y luego "Compartir"'
                },
                {
                    icono: ICONO_ANADIR,
                    texto: 'Desliza el menú hacia arriba y toca "Añadir a pantalla de inicio". Si no aparece, baja hasta el final y toca "Editar acciones"'
                },
                { icono: '<b>ON</b>', texto: 'Si ves "Abrir como app web", déjalo activado' },
                { icono: '<b>OK</b>', texto: 'Toca "Añadir" y busca el ícono en tu pantalla de inicio' }
            ],
            flecha: esIPad
                ? { estilo: 'top:8px;right:48px;width:80px', simbolo: '▲', texto: 'Compartir', arriba: true }
                : { estilo: 'bottom:6px;left:50%;margin-left:-40px;width:80px', simbolo: '▼', texto: 'Compartir o ⋯' }
        });
    }

    function guiaOtroNavegador() {
        abrirGuia({
            titulo: 'Ábrelo en Safari para instalarlo',
            subtitulo: 'Desde este navegador el iPhone no permite instalar la app.',
            pasos: [
                { icono: ICONO_COMPARTIR, texto: 'Copia el enlace con el botón de abajo' },
                { icono: '<b>S</b>', texto: 'Abre Safari y pega el enlace' },
                { icono: ICONO_ANADIR, texto: 'Ahí toca Compartir y "Añadir a pantalla de inicio"' }
            ],
            copiar: true
        });
    }

    if (esIOS) {
        document.addEventListener('DOMContentLoaded', function () {
            if (esSafari) {
                crearBanner('Cómo', 'Te mostramos cómo añadirla a tu pantalla de inicio', guiaSafari);
            } else {
                crearBanner('Cómo', 'Ábrela en Safari para poder instalarla', guiaOtroNavegador);
            }
        });
    }
})();
