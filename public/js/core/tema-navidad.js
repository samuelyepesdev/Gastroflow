/* Tema de Navidad (páginas públicas): nieve y confeti. Solo corre si el body tiene .tema-navidad y no hay
   preferencia de movimiento reducido ni la opción «sin animaciones» (.tema-navidad-quieto). */
(function () {
    'use strict';

    const body = document.body;
    if (!body || !body.classList.contains('tema-navidad')) return;

    const sinMovimiento = () =>
        body.classList.contains('tema-navidad-quieto') ||
        (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    const azar = (min, max) => min + Math.random() * (max - min);

    function nevar() {
        if (sinMovimiento() || document.querySelector('.tn-nieve')) return;
        const cont = document.createElement('div');
        cont.className = 'tn-nieve';
        cont.setAttribute('aria-hidden', 'true');
        const enPanel = body.classList.contains('tema-navidad--panel');
        const movil = window.innerWidth < 600;
        // En los paneles de trabajo, menos copos: la pantalla ya está llena de información.
        const cantidad = enPanel ? (movil ? 10 : 18) : movil ? 16 : 28;
        for (let i = 0; i < cantidad; i++) {
            const copo = document.createElement('i');
            copo.className = 'bi bi-snow2 tn-copo';
            const st = copo.style;
            st.setProperty('--x', `${azar(0, 100).toFixed(1)}%`);
            st.setProperty('--s', `${azar(9, 22).toFixed(0)}px`);
            st.setProperty('--o', azar(0.35, 0.85).toFixed(2));
            st.setProperty('--d', `${azar(10, 19).toFixed(1)}s`);
            st.setProperty('--g', `${azar(8, 16).toFixed(1)}s`);
            st.setProperty('--r', `${(-azar(0, 18)).toFixed(1)}s`); // retraso negativo: ya van cayendo al abrir
            st.setProperty('--dx', `${azar(-60, 60).toFixed(0)}px`);
            cont.appendChild(copo);
        }
        body.appendChild(cont);
    }

    /** Lluvia corta de confeti (por ejemplo, al enviar una reserva). */
    function confeti() {
        if (sinMovimiento()) return;
        const colores = ['--tn-c1', '--tn-c2', '--tn-c3', '--tn-c4'];
        const piezas = [];
        for (let i = 0; i < 40; i++) {
            const p = document.createElement('i');
            p.className = 'tn-confeti';
            p.setAttribute('aria-hidden', 'true');
            const st = p.style;
            st.setProperty('--x', `${azar(2, 98).toFixed(1)}%`);
            st.setProperty('--w', `${azar(7, 13).toFixed(0)}px`);
            st.setProperty('--k', `var(${colores[i % colores.length]})`);
            st.setProperty('--d', `${azar(1.8, 3.4).toFixed(2)}s`);
            st.setProperty('--dx', `${azar(-90, 90).toFixed(0)}px`);
            st.setProperty('--rot', `${azar(300, 900).toFixed(0)}deg`);
            st.animationDelay = `${azar(0, 0.5).toFixed(2)}s`;
            body.appendChild(p);
            piezas.push(p);
        }
        setTimeout(() => piezas.forEach(p => p.remove()), 4200);
    }

    window.TemaNavidad = { confeti };
    nevar();
})();
