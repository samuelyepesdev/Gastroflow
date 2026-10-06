// Movimiento de la landing pública: aparición al hacer scroll, barra de progreso,
// brillo en tarjetas, scroll narrativo de "Cómo empezar" y la cocina/margen del hero.
// El CSS solo oculta o anima cuando <html> tiene .js, así que sin JS todo queda visible y estático.
(function () {
    'use strict';

    const sinMovimiento = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const $ = (sel, raiz) => (raiz || document).querySelector(sel);
    const $$ = (sel, raiz) => Array.from((raiz || document).querySelectorAll(sel));

    // ---------- Aparición de secciones ----------
    function iniciarReveal() {
        const elementos = $$('.reveal');
        if (!elementos.length) return;
        if (sinMovimiento || !('IntersectionObserver' in window)) {
            elementos.forEach(el => el.classList.add('in'));
            return;
        }
        const obs = new IntersectionObserver(
            entradas => {
                entradas.forEach(e => {
                    if (!e.isIntersecting) return;
                    e.target.classList.add('in');
                    obs.unobserve(e.target);
                });
            },
            { rootMargin: '0px 0px -8% 0px', threshold: 0.08 }
        );
        elementos.forEach(el => obs.observe(el));
    }

    // ---------- Barra de progreso de scroll ----------
    function iniciarProgreso() {
        const barra = $('#progreso');
        if (!barra || sinMovimiento) return;
        let pendiente = false;
        const pintar = () => {
            pendiente = false;
            const max = document.documentElement.scrollHeight - window.innerHeight;
            barra.style.transform = `scaleX(${max > 0 ? Math.min(1, window.scrollY / max) : 0})`;
        };
        window.addEventListener('scroll', () => {
            if (pendiente) return;
            pendiente = true;
            requestAnimationFrame(pintar);
        }, { passive: true });
        pintar();
    }

    // ---------- Brillo que sigue al cursor ----------
    function iniciarBrillo() {
        if (sinMovimiento || !window.matchMedia('(hover: hover)').matches) return;
        $$('.card').forEach(card => {
            card.addEventListener('pointermove', e => {
                const r = card.getBoundingClientRect();
                card.style.setProperty('--mx', `${e.clientX - r.left}px`);
                card.style.setProperty('--my', `${e.clientY - r.top}px`);
            });
        });
    }

    // ---------- Scroll narrativo (Cómo empezar) ----------
    function iniciarHistoria() {
        const pasos = $$('.step[data-scene]');
        const escenas = $$('.scene[data-scene]');
        if (!pasos.length || !escenas.length || !('IntersectionObserver' in window)) return;

        const activar = n => {
            pasos.forEach(p => p.classList.toggle('is-active', p.dataset.scene === n));
            escenas.forEach(s => s.classList.toggle('on', s.dataset.scene === n));
        };
        activar('0');

        // Franja central de la pantalla: el paso que la cruza es el activo.
        const obs = new IntersectionObserver(
            entradas => entradas.forEach(e => e.isIntersecting && activar(e.target.dataset.scene)),
            { rootMargin: '-45% 0px -45% 0px', threshold: 0 }
        );
        pasos.forEach(p => obs.observe(p));
    }

    // ---------- Hero vivo: cocina + margen ----------
    const formatoMoneda = n => '$ ' + Math.round(n).toLocaleString('es-CO');
    const mmss = s => String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
    const LIMITE_TARDE = 12 * 60;

    const PEDIDOS = [
        { mesa: '9', nombre: 'Mesa 9', items: '1 × Salmón a la plancha · 1 × Vino' },
        { mesa: '3', nombre: 'Mesa 3', items: '2 × Arepa rellena · 2 × Café' },
        { mesa: '5', nombre: 'Barra', items: '1 × Hamburguesa clásica · 1 × Cerveza' },
        { mesa: '6', nombre: 'Mesa 6', items: '4 × Empanadas · 2 × Limonada' }
    ];

    function crearPedido(p, segundos) {
        const tw = document.createElement('div');
        tw.className = 'tw tw--in';
        tw.innerHTML =
            '<div class="tw__in"><div class="ticket">' +
            `<div class="ticket__mesa">${p.mesa}</div>` +
            `<div><div class="ticket__name">${p.nombre}</div><div class="ticket__items">${p.items}</div></div>` +
            '<span class="chip chip--ok"></span></div></div>';
        tw.dataset.seg = String(segundos);
        return tw;
    }

    function pintarTiempos(kds) {
        $$('.tw', kds).forEach(tw => {
            const seg = Number(tw.dataset.seg);
            const chip = $('.chip', tw);
            const ticket = $('.ticket', tw);
            if (chip.dataset.fijo) return;
            chip.textContent = mmss(seg);
            const tarde = seg >= LIMITE_TARDE;
            chip.className = 'chip ' + (tarde ? 'chip--warn' : 'chip--ok');
            ticket.classList.toggle('ticket--late', tarde);
        });
    }

    function tween(desde, hasta, ms, pintar) {
        const t0 = performance.now();
        const paso = ahora => {
            const k = Math.min(1, (ahora - t0) / ms);
            const suave = 1 - Math.pow(1 - k, 3);
            pintar(desde + (hasta - desde) * suave);
            if (k < 1) requestAnimationFrame(paso);
        };
        requestAnimationFrame(paso);
    }

    function iniciarHero() {
        const kds = $('#kds');
        const tarjeta = $('#margen');
        if (!kds || !tarjeta || sinMovimiento) return;

        // Estado inicial a partir del HTML estático.
        $$('.tw', kds).forEach(tw => {
            const [m, s] = $('.chip', tw).textContent.split(':').map(Number);
            tw.dataset.seg = String(m * 60 + s);
            tw.classList.remove('tw--in');
        });

        let visible = true;
        let indice = 0;
        let costo = 8420;
        const PRECIO = 22000;
        const elCosto = $('#m-costo');
        const elPct = $('#m-pct');
        const elBarra = $('#m-barra');
        const elBarraI = $('#m-barra-i');
        const margen = c => Math.round(((PRECIO - c) / PRECIO) * 100);

        const pintarMargen = c => {
            const pct = margen(c);
            elCosto.textContent = formatoMoneda(c);
            elPct.textContent = pct + '%';
            elBarraI.style.setProperty('--p', String(pct / 100));
        };

        // Cada segundo avanzan los tiempos de los pedidos.
        setInterval(() => {
            if (!visible || document.hidden) return;
            $$('.tw', kds).forEach(tw => { tw.dataset.seg = String(Number(tw.dataset.seg) + 1); });
            pintarTiempos(kds);
        }, 1000);

        // Cada 6 s se despacha el pedido más antiguo y entra uno nuevo.
        setInterval(() => {
            if (!visible || document.hidden) return;
            const pedidos = $$('.tw', kds);
            const ultimo = pedidos[pedidos.length - 1];
            if (!ultimo || ultimo.classList.contains('tw--out')) return;

            const chip = $('.chip', ultimo);
            chip.dataset.fijo = '1';
            chip.className = 'chip chip--ok';
            chip.textContent = 'Listo ✓';
            $('.ticket', ultimo).classList.add('ticket--done');

            setTimeout(() => {
                ultimo.classList.add('tw--out');
                setTimeout(() => {
                    ultimo.remove();
                    const nuevo = crearPedido(PEDIDOS[indice % PEDIDOS.length], 5 + (indice % 3) * 20);
                    indice += 1;
                    kds.prepend(nuevo);
                    pintarTiempos(kds);
                }, 200);
            }, 1100);
        }, 6000);

        // Cada 8 s el proveedor "sube la carne" y el margen se recalcula; luego vuelve.
        let alza = false;
        setInterval(() => {
            if (!visible || document.hidden) return;
            alza = !alza;
            const destino = alza ? 9650 : 8420;
            tarjeta.classList.toggle('is-alert', alza);
            elBarra.classList.toggle('is-low', alza);
            tween(costo, destino, 600, v => { costo = v; pintarMargen(v); });
        }, 8000);

        if ('IntersectionObserver' in window) {
            new IntersectionObserver(e => { visible = e[0].isIntersecting; }, { threshold: 0.1 }).observe(kds);
        }
    }

    iniciarReveal();
    iniciarProgreso();
    iniciarBrillo();
    iniciarHistoria();
    iniciarHero();
})();
