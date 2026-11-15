/**
 * Cierre mensual: el mes se decide por el día de COLOMBIA (no el del servidor UTC) y los reportes se generan
 * con concurrencia acotada.
 */

jest.mock('../../../repositories/Tenant/StatsRepository', () => ({}));
jest.mock('../../../services/Tenant/FinanzasService', () => ({}));
jest.mock('../../../services/Admin/TenantService', () => ({ getAllTenants: jest.fn() }));

const ReporteMensualService = require('../../../services/Tenant/ReporteMensualService');
const TenantService = require('../../../services/Admin/TenantService');

describe('ReporteMensualService.calcularRangoFechas (día de Colombia)', () => {
    const calc = (opciones, hoy) => ReporteMensualService.calcularRangoFechas(opciones, hoy);

    it('cierre de fin de mes: reporta el mes que termina, aunque ya sea el día 1 para el servidor', () => {
        // 23:50 del 30-nov en Bogotá = 04:50 UTC del 1-dic: el día de Colombia sigue siendo noviembre.
        expect(calc({ finDeMes: true }, '2026-11-30')).toMatchObject({
            firstDay: '2026-11-01',
            lastDayStr: '2026-11-30'
        });
    });

    it('por defecto es el mes anterior, también al cruzar de año', () => {
        expect(calc({}, '2026-11-15')).toMatchObject({ firstDay: '2026-10-01', lastDayStr: '2026-10-31' });
        expect(calc({}, '2027-01-02')).toMatchObject({ firstDay: '2026-12-01', lastDayStr: '2026-12-31' });
    });

    it('último día correcto en febrero (bisiesto y no bisiesto) y meses de 30 días', () => {
        expect(calc({ mes: 2, anio: 2028 }, '2029-01-01').lastDayStr).toBe('2028-02-29');
        expect(calc({ mes: 2, anio: 2027 }, '2029-01-01').lastDayStr).toBe('2027-02-28');
        expect(calc({ mes: 4, anio: 2027 }, '2029-01-01').lastDayStr).toBe('2027-04-30');
    });

    it('mes explícito: acepta el actual y rechaza uno futuro', () => {
        expect(calc({ mes: 11, anio: 2026 }, '2026-11-15').firstDay).toBe('2026-11-01');
        expect(() => calc({ mes: 12, anio: 2026 }, '2026-11-15')).toThrow('mes futuro');
        expect(() => calc({ mes: 1, anio: 2027 }, '2026-11-15')).toThrow('mes futuro');
    });

    it('testMesActual usa el mes en curso y el nombre del mes sale en español', () => {
        const r = calc({ testMesActual: true }, '2026-11-15');
        expect(r.firstDay).toBe('2026-11-01');
        expect(r.mesNombre).toMatch(/noviembre/i);
    });
});

describe('ReporteMensualService.procesarCierreMensual (concurrencia acotada)', () => {
    beforeEach(() => jest.restoreAllMocks());

    it('genera como máximo 2 reportes a la vez, procesa a todos y un fallo no frena a los demás', async () => {
        jest.spyOn(console, 'log').mockImplementation(() => {});
        jest.spyOn(console, 'error').mockImplementation(() => {});
        TenantService.getAllTenants.mockResolvedValue([
            { id: 1, nombre: 'A', activo: 1 },
            { id: 2, nombre: 'B', activo: 1 },
            { id: 3, nombre: 'C', activo: 0 }, // inactivo: se omite
            { id: 4, nombre: 'D', activo: 1 },
            { id: 5, nombre: 'E', activo: 1 },
            { id: 6, nombre: 'F', activo: 1 }
        ]);
        let activos = 0;
        let maximo = 0;
        const procesados = [];
        jest.spyOn(ReporteMensualService, 'generarYEnviar').mockImplementation(async t => {
            activos += 1;
            maximo = Math.max(maximo, activos);
            await new Promise(r => setTimeout(r, 5));
            activos -= 1;
            procesados.push(t.id);
            if (t.id === 2) {
                throw new Error('correo inválido');
            }
        });

        await ReporteMensualService.procesarCierreMensual({ finDeMes: true });

        expect(maximo).toBe(2);
        expect(procesados.sort()).toEqual([1, 2, 4, 5, 6]);
        expect(ReporteMensualService.generarYEnviar).toHaveBeenCalledWith(
            expect.objectContaining({ id: 1 }),
            expect.objectContaining({ finDeMes: true })
        );
    });
});
