// Consolidado de ventas del restaurante y sus sucursales (solo lectura, solo totales).

(function () {
    const app = document.getElementById('consolidadoApp');
    if (!app) return;
    const $ = id => document.getElementById(id);
    const charts = {};

    // "Hoy" en Colombia (no en la zona del navegador): el día cambia a medianoche allá.
    const hoy = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
    const sumarDias = (dia, n) => {
        const [y, m, d] = dia.split('-').map(Number);
        return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
    };

    function grafica(id, config) {
        if (charts[id]) charts[id].destroy();
        charts[id] = new Chart($(id), config);
    }

    function pintar(r) {
        $('kVentas').textContent = GF.dinero(r.totales.ventas);
        $('kFacturas').textContent = r.totales.facturas.toLocaleString('es-CO');
        $('kTicket').textContent = GF.dinero(r.totales.ticket_promedio);

        $('tbodyLocales').innerHTML = r.locales
            .map(
                l => `<tr>
                    <td class="fw-semibold">${GF.escapeHtml(l.nombre)}${l.es_padre ? ' <span class="badge text-bg-light">Principal</span>' : ''}${l.activo ? '' : ' <span class="badge text-bg-secondary">Inactiva</span>'}</td>
                    <td class="text-end">${GF.dinero(l.ventas)}</td>
                    <td class="text-end">${l.facturas.toLocaleString('es-CO')}</td>
                    <td class="text-end">${GF.dinero(l.ticket_promedio)}</td>
                    <td class="text-end">${l.participacion}%</td>
                </tr>`
            )
            .join('');

        $('tbodyMedios').innerHTML = r.porMedio.length
            ? r.porMedio
                  .map(
                      m => `<tr>
                        <td>${GF.escapeHtml(m.forma_pago || 'Sin dato')}</td>
                        <td class="text-end">${m.cantidad.toLocaleString('es-CO')}</td>
                        <td class="text-end">${GF.dinero(m.total)}</td>
                    </tr>`
                  )
                  .join('')
            : '<tr><td colspan="3" class="text-muted text-center py-3">Sin ventas en el periodo.</td></tr>';

        grafica('chDiario', {
            type: 'line',
            data: {
                labels: r.diario.map(d => d.fecha.slice(5)),
                datasets: [
                    {
                        label: 'Ventas',
                        data: r.diario.map(d => d.ventas),
                        borderColor: '#e8431f',
                        backgroundColor: 'rgba(232, 67, 31,.12)',
                        fill: true,
                        tension: 0.25,
                        pointRadius: r.diario.length > 45 ? 0 : 3
                    }
                ]
            },
            options: {
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: { y: { beginAtZero: true, ticks: { callback: v => GF.dinero(v) } } }
            }
        });

        grafica('chLocales', {
            type: 'bar',
            data: {
                labels: r.locales.map(l => l.nombre),
                datasets: [{ label: 'Ventas', data: r.locales.map(l => l.ventas), backgroundColor: '#10b981' }]
            },
            options: {
                indexAxis: 'y',
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: { x: { beginAtZero: true, ticks: { callback: v => GF.dinero(v) } } }
            }
        });
    }

    async function consultar() {
        const btn = $('btnConsultar');
        GF.cargando(btn, true);
        try {
            const q = new URLSearchParams({ desde: $('fDesde').value, hasta: $('fHasta').value });
            pintar(await GF.api('/api/sucursales/consolidado?' + q, {}, 'No se pudo generar el consolidado'));
        } catch (e) {
            GF.error(e.message);
        } finally {
            GF.cargando(btn, false);
        }
    }

    function fijarRango(tipo) {
        const h = hoy();
        $('fHasta').value = h;
        $('fDesde').value = tipo === 'hoy' ? h : tipo === '7' ? sumarDias(h, -6) : h.slice(0, 7) + '-01';
    }

    $('formRango').addEventListener('submit', ev => {
        ev.preventDefault();
        consultar();
    });
    document.querySelectorAll('.js-rapido').forEach(b =>
        b.addEventListener('click', () => {
            fijarRango(b.dataset.rango);
            consultar();
        })
    );

    fijarRango('mes');
    consultar();
})();
