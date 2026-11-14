jest.mock('../../../config/database', () => ({ query: jest.fn() }));
jest.mock('../../../utils/dateHelpers', () => {
    const real = jest.requireActual('../../../utils/dateHelpers');
    return { ...real, hoyColombia: () => '2026-11-03' };
});

const db = require('../../../config/database');
const cache = require('../../../services/Shared/CacheService');
const TenantStatsService = require('../../../services/Admin/Tenant/TenantStatsService');

function responder(sql) {
    if (/COUNT\(\*\) AS total,\s*SUM\(CASE WHEN t\.activo = 1/.test(sql)) {
        return [[{ total: 5, activos: 3, inactivos: 2 }]];
    }
    if (/FROM planes p/.test(sql)) {
        return [[{ plan_nombre: 'Pro', plan_slug: 'pro', orden: 1, cantidad: 2 }]];
    }
    if (/plan_id IS NULL/.test(sql)) {
        return [[{ cantidad: 1 }]];
    }
    if (/FROM usuarios/.test(sql)) {
        return [[{ total: 9 }]];
    }
    if (/GROUP BY forma_pago/.test(sql)) {
        return [
            [
                { forma_pago: 'Efectivo', cnt: 6, total: '600' },
                { forma_pago: 'transferencia', cnt: 3, total: '300' },
                { forma_pago: 'mixto', cnt: 1, total: '100' }
            ]
        ];
    }
    if (/FROM productos/.test(sql)) {
        return [[{ cnt: 40 }]];
    }
    if (/FROM clientes/.test(sql)) {
        return [[{ cnt: 20 }]];
    }
    if (/FROM mesas/.test(sql)) {
        return [[{ cnt: 15 }]];
    }
    if (/INTERVAL 30 DAY/.test(sql)) {
        return [[{ cantidad: 2 }]];
    }
    if (/INTERVAL 6 MONTH/.test(sql)) {
        return [[{ mes: '2026-10', cantidad: 2 }]];
    }
    if (/GROUP BY evento_aparte, fecha_colombia/.test(sql)) {
        return [
            [
                { evento_aparte: 0, fecha_colombia: '2026-11-01', total: '100' },
                { evento_aparte: 1, fecha_colombia: '2026-11-01', total: '40' },
                { evento_aparte: 0, fecha_colombia: '2026-11-03', total: '70' }
            ]
        ];
    }
    if (/SELECT id, nombre FROM tenants WHERE activo = 1/.test(sql)) {
        return [
            [
                { id: 1, nombre: 'Resto A' },
                { id: 2, nombre: 'Resto B' }
            ]
        ];
    }
    if (/JOIN tenants t ON f\.tenant_id/.test(sql)) {
        return [[{ tenant_nombre: 'Resto A', fecha_colombia: '2026-11-01', total: '100' }]];
    }
    if (/LEFT JOIN facturas f ON f\.tenant_id/.test(sql)) {
        return [
            [
                { tenant_nombre: 'Resto A', total: '70', facturas: 2 },
                { tenant_nombre: 'Resto B', total: '0', facturas: 0 }
            ]
        ];
    }
    if (/JOIN eventos e/.test(sql)) {
        return [[{ nombre: 'Feria', total: '40' }]];
    }
    if (/WHERE evento_aparte = 0 AND fecha BETWEEN/.test(sql)) {
        return [[{ fecha_colombia: '2026-10-31', total: '55' }]]; // mes anterior
    }
    throw new Error('consulta no esperada: ' + sql.slice(0, 80));
}

describe('TenantStatsService.getDashboardStats', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        cache.clear();
    });

    test('arma las mismas cifras con menos consultas (16 en vez de 19) y un solo escaneo total de facturas', async () => {
        db.query.mockImplementation(async sql => responder(sql));
        const s = await TenantStatsService.getDashboardStats();

        expect(db.query).toHaveBeenCalledTimes(16);
        const totalesGlobales = db.query.mock.calls.filter(([sql]) => /GROUP BY forma_pago/.test(sql));
        expect(totalesGlobales).toHaveLength(1);

        expect(s).toMatchObject({
            totalRestaurantes: 5,
            restaurantesActivos: 3,
            restaurantesInactivos: 2,
            totalUsuarios: 9,
            totalFacturas: 10,
            totalVentasMonto: 1000,
            totalEfectivo: 600,
            totalTransferencia: 300,
            totalOtros: 100,
            totalProductos: 40,
            totalClientes: 20,
            totalMesas: 15,
            restaurantesUltimos30Dias: 2,
            ventasHoyTotalGlobal: 70
        });
        expect(s.porPlan).toEqual([
            { plan_nombre: 'Pro', plan_slug: 'pro', cantidad: 2 },
            { plan_nombre: 'Sin plan', plan_slug: '', cantidad: 1 }
        ]);
        expect(s.ventasDiariasMes).toEqual([
            { fecha: '2026-11-01', total: 100 },
            { fecha: '2026-11-02', total: 0 },
            { fecha: '2026-11-03', total: 70 }
        ]);
        // las ventas de eventos salen de la MISMA consulta pero no se mezclan con las normales
        expect(s.ventasEventosDiariasMes).toEqual([
            { fecha: '2026-11-01', total: 40 },
            { fecha: '2026-11-02', total: 0 },
            { fecha: '2026-11-03', total: 0 }
        ]);
        expect(s.ventasDiariasMesAnterior.find(d => d.fecha === '2026-10-31').total).toBe(55);
        expect(s.ventasDiariasMesAnterior).toHaveLength(31);
        expect(s.ventasDiariasPorTenant.map(t => t.nombre)).toEqual(['Resto A', 'Resto B']);
        expect(s.ventasDiariasPorTenant[0].data[0]).toEqual({ fecha: '2026-11-01', total: 100 });
        expect(s.ventasHoyPorTenant).toEqual([
            { nombre: 'Resto A', total: 70, facturas: 2 },
            { nombre: 'Resto B', total: 0, facturas: 0 }
        ]);
        expect(s.topEventos).toEqual([{ nombre: 'Feria', total: 40 }]);
        expect(s.historicoRegistro).toEqual([{ mes: '2026-10', cantidad: 2 }]);
    });

    test('nunca hay más de 4 consultas simultáneas (no acapara el pool de 10)', async () => {
        let activas = 0;
        let maximo = 0;
        db.query.mockImplementation(async sql => {
            activas += 1;
            maximo = Math.max(maximo, activas);
            await new Promise(r => setTimeout(r, 3));
            activas -= 1;
            return responder(sql);
        });
        await TenantStatsService.getDashboardStats();
        expect(maximo).toBeLessThanOrEqual(4);
        expect(maximo).toBeGreaterThan(1); // y sí corren en paralelo
    });

    test('se cachea 5 minutos: la segunda llamada no consulta', async () => {
        db.query.mockImplementation(async sql => responder(sql));
        await TenantStatsService.getDashboardStats();
        db.query.mockClear();
        await TenantStatsService.getDashboardStats();
        expect(db.query).not.toHaveBeenCalled();
    });

    test('si una consulta falla, el error se propaga y no se cachea un resultado a medias', async () => {
        db.query.mockImplementation(async sql => {
            if (/FROM mesas/.test(sql)) {
                throw new Error('db caída');
            }
            return responder(sql);
        });
        await expect(TenantStatsService.getDashboardStats()).rejects.toThrow('db caída');
        expect(cache.get('superadmin_dashboard_stats')).toBeNull();
    });
});
