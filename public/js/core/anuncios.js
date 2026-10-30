/**
 * Anuncios: modales informativos que publica el superadmin (nuevas funcionalidades,
 * actualizaciones, tutoriales, avisos).
 *
 *   GFAnuncios.crearTarjeta(anuncio, opts)  -> elemento .gfa-card (lo usa también la vista previa del superadmin)
 *   GFAnuncios.iniciar()                    -> pide el anuncio pendiente al servidor y lo muestra
 *
 * Todo texto del anuncio se inserta con textContent (nunca innerHTML): lo escribe el superadmin,
 * pero así no hay forma de inyectar HTML aunque el dato se corrompa.
 */
(function () {
    'use strict';

    var ICONOS = {
        funcionalidad: { icono: 'bi-stars', etiqueta: 'Nuevo' },
        actualizacion: { icono: 'bi-arrow-repeat', etiqueta: 'Actualización' },
        tutorial: { icono: 'bi-lightbulb', etiqueta: 'Aprende' },
        aviso: { icono: 'bi-exclamation-triangle', etiqueta: 'Importante' }
    };
    var COLOR_DEFECTO = {
        funcionalidad: '#e8431f',
        actualizacion: '#0891b2',
        tutorial: '#059669',
        aviso: '#d97706'
    };
    // Pantallas donde nunca se interrumpe (venta / cocina en pleno servicio)
    var RUTAS_EXCLUIDAS = /^\/(cocina|pos)(\/|$)/;
    var CLAVE_SESION = 'gf_anuncios_vistos';

    function el(tag, className, texto) {
        var n = document.createElement(tag);
        if (className) n.className = className;
        if (texto !== undefined && texto !== null) n.textContent = texto;
        return n;
    }

    function icono(nombre) {
        return el('i', 'bi ' + nombre);
    }

    function urlSegura(url) {
        return /^\/(?!\/)/.test(url) || /^https:\/\//i.test(url);
    }

    /**
     * Construye la tarjeta del anuncio.
     * opts: { estatico, onCerrar, onClic, onNoMostrar, mostrarNoMostrar }
     */
    function crearTarjeta(a, opts) {
        opts = opts || {};
        var tipo = ICONOS[a.tipo] ? a.tipo : 'funcionalidad';
        var cfg = ICONOS[tipo];
        var items = Array.isArray(a.items) ? a.items : [];

        var card = el('div', 'gfa-card gfa-tipo-' + tipo + (opts.estatico ? ' gfa-estatico' : ''));
        card.style.setProperty('--gfa-accent', /^#[0-9a-f]{6}$/i.test(a.color_acento || '') ? a.color_acento : COLOR_DEFECTO[tipo]);
        card.setAttribute('role', 'dialog');
        card.setAttribute('aria-modal', opts.estatico ? 'false' : 'true');

        if (opts.onCerrar) {
            var x = el('button', 'gfa-cerrar');
            x.type = 'button';
            x.setAttribute('aria-label', 'Cerrar');
            x.appendChild(icono('bi-x-lg'));
            x.addEventListener('click', opts.onCerrar);
            card.appendChild(x);
        }

        var head = el('div', 'gfa-head');
        var ic = el('div', 'gfa-icono');
        ic.appendChild(icono(cfg.icono));
        head.appendChild(ic);
        var etiqueta = cfg.etiqueta + (a.version ? ' · v' + a.version.replace(/^v/i, '') : '');
        head.appendChild(el('span', 'gfa-etiqueta', etiqueta));
        var titulo = el('h2', 'gfa-titulo', a.titulo || 'Título del anuncio');
        titulo.id = 'gfa-titulo-' + (a.id || 'preview');
        card.setAttribute('aria-labelledby', titulo.id);
        head.appendChild(el('div'));
        head.lastChild.appendChild(titulo);
        card.appendChild(head);

        var body = el('div', 'gfa-body');
        if (a.cuerpo) {
            body.appendChild(el('p', 'gfa-texto', a.cuerpo));
        }

        var irAlPaso = null;
        var btnSiguiente = null;
        if (tipo === 'tutorial' && items.length) {
            var pasos = el('div', 'gfa-pasos');
            var puntos = el('div', 'gfa-puntos');
            items.forEach(function (t, i) {
                var p = el('div', 'gfa-paso' + (i === 0 ? ' gfa-activo' : ''));
                p.appendChild(el('div', 'gfa-paso-n', String(i + 1)));
                p.appendChild(el('p', null, t));
                pasos.appendChild(p);
                puntos.appendChild(el('span', 'gfa-punto' + (i === 0 ? ' gfa-activo' : '')));
            });
            body.appendChild(pasos);
            if (items.length > 1) body.appendChild(puntos);

            var actual = 0;
            irAlPaso = function (n) {
                actual = Math.max(0, Math.min(items.length - 1, n));
                Array.prototype.forEach.call(pasos.children, function (p, i) {
                    p.classList.toggle('gfa-activo', i === actual);
                });
                Array.prototype.forEach.call(puntos.children, function (d, i) {
                    d.classList.toggle('gfa-activo', i === actual);
                });
                if (btnSiguiente) {
                    btnSiguiente.textContent = actual === items.length - 1 ? 'Entendido' : 'Siguiente';
                }
                return actual;
            };
            card._irAlPaso = irAlPaso;
        } else if (items.length) {
            var ul = el('ul', 'gfa-lista');
            items.forEach(function (t, i) {
                var li = el('li');
                li.style.animationDelay = 0.15 + i * 0.12 + 's';
                li.appendChild(icono(tipo === 'aviso' ? 'bi-dot' : 'bi-check-circle-fill'));
                li.appendChild(el('span', null, t));
                ul.appendChild(li);
            });
            body.appendChild(ul);
        }
        card.appendChild(body);

        var footer = el('div', 'gfa-footer');
        var tieneBoton = a.boton_texto && a.boton_url && urlSegura(a.boton_url);

        if (tipo === 'tutorial' && items.length > 1) {
            var nav = el('div', 'gfa-nav');
            var atras = el('button', 'gfa-btn gfa-btn-sec', 'Atrás');
            atras.type = 'button';
            btnSiguiente = el('button', 'gfa-btn', items.length > 1 ? 'Siguiente' : 'Entendido');
            btnSiguiente.type = 'button';
            var pasoActual = 0;
            atras.addEventListener('click', function () {
                pasoActual = irAlPaso(pasoActual - 1);
            });
            btnSiguiente.addEventListener('click', function () {
                if (pasoActual >= items.length - 1) {
                    if (opts.onCerrar) opts.onCerrar();
                } else {
                    pasoActual = irAlPaso(pasoActual + 1);
                }
            });
            nav.appendChild(atras);
            nav.appendChild(btnSiguiente);
            footer.appendChild(nav);
        }

        if (tieneBoton) {
            var enlace = el('a', 'gfa-btn' + (tipo === 'tutorial' && items.length > 1 ? ' gfa-btn-sec' : ''), a.boton_texto);
            enlace.href = a.boton_url;
            if (/^https:/i.test(a.boton_url)) {
                enlace.target = '_blank';
                enlace.rel = 'noopener noreferrer';
            }
            enlace.addEventListener('click', function () {
                if (opts.onClic) opts.onClic();
            });
            footer.appendChild(enlace);
        } else if (!(tipo === 'tutorial' && items.length > 1)) {
            var ok = el('button', 'gfa-btn', tipo === 'aviso' ? 'Entendido' : '¡Genial!');
            ok.type = 'button';
            ok.addEventListener('click', function () {
                if (opts.onCerrar) opts.onCerrar();
            });
            footer.appendChild(ok);
        }

        if (opts.mostrarNoMostrar) {
            var nm = el('button', 'gfa-nomostrar', 'No volver a mostrar este aviso');
            nm.type = 'button';
            nm.addEventListener('click', function () {
                if (opts.onNoMostrar) opts.onNoMostrar();
            });
            footer.appendChild(nm);
        }
        card.appendChild(footer);

        return card;
    }

    function vistosEnSesion() {
        try {
            return JSON.parse(sessionStorage.getItem(CLAVE_SESION) || '[]');
        } catch (e) {
            return [];
        }
    }

    function marcarVistoEnSesion(id) {
        try {
            var v = vistosEnSesion();
            if (v.indexOf(id) === -1) v.push(id);
            sessionStorage.setItem(CLAVE_SESION, JSON.stringify(v));
        } catch (e) {
            /* sin sessionStorage: peor caso, se vuelve a mostrar al recargar */
        }
    }

    function enviarEvento(id, evento) {
        return fetch('/api/anuncios/' + id + '/evento', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ evento: evento })
        }).catch(function () {});
    }

    function mostrar(a) {
        var previoFoco = document.activeElement;
        var overlay = el('div', 'gfa-overlay');

        function cerrar() {
            document.removeEventListener('keydown', onKey);
            overlay.classList.add('gfa-saliendo');
            setTimeout(function () {
                overlay.remove();
                if (previoFoco && previoFoco.focus) previoFoco.focus();
            }, 180);
        }
        function onKey(e) {
            if (e.key === 'Escape') cerrar();
        }

        var card = crearTarjeta(a, {
            onCerrar: cerrar,
            onClic: function () {
                enviarEvento(a.id, 'clic');
            },
            onNoMostrar: function () {
                enviarEvento(a.id, 'no_mostrar');
                cerrar();
            },
            mostrarNoMostrar: a.frecuencia === 'cada_login'
        });
        overlay.appendChild(card);
        overlay.addEventListener('click', function (e) {
            if (e.target === overlay) cerrar();
        });
        document.addEventListener('keydown', onKey);
        document.body.appendChild(overlay);

        var primero = card.querySelector('.gfa-btn, .gfa-cerrar');
        if (primero) primero.focus();

        marcarVistoEnSesion(a.id);
        enviarEvento(a.id, 'vista');
    }

    function iniciar() {
        if (RUTAS_EXCLUIDAS.test(location.pathname)) return;
        var excluir = vistosEnSesion().join(',');
        fetch('/api/anuncios/pendiente' + (excluir ? '?excluir=' + encodeURIComponent(excluir) : ''), {
            credentials: 'same-origin',
            headers: { Accept: 'application/json' }
        })
            .then(function (r) {
                return r.ok ? r.json() : null;
            })
            .then(function (data) {
                if (data && data.anuncio) mostrar(data.anuncio);
            })
            .catch(function () {});
    }

    window.GFAnuncios = { crearTarjeta: crearTarjeta, iniciar: iniciar };
})();
