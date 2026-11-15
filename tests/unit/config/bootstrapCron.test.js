/**
 * El cierre de fin de mes se agenda a las 23:50 HORA DE COLOMBIA (no del servidor, que en producción es UTC).
 */

jest.mock('node-cron', () => ({ schedule: jest.fn() }));
jest.mock('../../../services/Tenant/ReporteMensualService', () => ({ procesarCierreMensual: jest.fn() }));
jest.mock('../../../services/Tenant/FacturacionElectronicaWorkerService', () => ({ procesarPendientes: jest.fn() }));
jest.mock('../../../services/Shared/JobWorkerService', () => ({ procesarPendientes: jest.fn() }));
jest.mock('../../../services/Shared/DesktopSyncService', () => ({ runCycle: jest.fn() }));
jest.mock('../../../services/Admin/SuscripcionService', () => ({}));
jest.mock('../../../services/Tenant/AlertasService', () => ({}));
jest.mock('../../../utils/dateHelpers', () => ({ esUltimoDiaDelMes: jest.fn(), ZONA_COLOMBIA: 'America/Bogota' }));

const cron = require('node-cron');
const ReporteMensualService = require('../../../services/Tenant/ReporteMensualService');
const { esUltimoDiaDelMes } = require('../../../utils/dateHelpers');
const { runBackgroundJobs } = require('../../../config/bootstrap');

async function cierreMensual() {
    cron.schedule.mockClear();
    await runBackgroundJobs();
    const llamada = cron.schedule.mock.calls.find(([expr]) => expr === '50 23 * * *');
    return llamada;
}

describe('cron de cierre mensual', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        jest.spyOn(console, 'log').mockImplementation(() => {});
        jest.spyOn(console, 'error').mockImplementation(() => {});
    });

    it('se agenda a las 23:50 con la zona horaria de Colombia', async () => {
        const [, , opciones] = await cierreMensual();
        expect(opciones).toEqual({ timezone: 'America/Bogota' });
    });

    it('solo cierra el último día del mes (según el día de Colombia)', async () => {
        const [, tarea] = await cierreMensual();
        esUltimoDiaDelMes.mockReturnValue(false);
        await tarea();
        expect(ReporteMensualService.procesarCierreMensual).not.toHaveBeenCalled();

        esUltimoDiaDelMes.mockReturnValue(true);
        await tarea();
        expect(ReporteMensualService.procesarCierreMensual).toHaveBeenCalledWith({ finDeMes: true });
    });

    it('un fallo del cierre no revienta el cron', async () => {
        const [, tarea] = await cierreMensual();
        esUltimoDiaDelMes.mockReturnValue(true);
        ReporteMensualService.procesarCierreMensual.mockRejectedValue(new Error('smtp caído'));
        await expect(tarea()).resolves.toBeUndefined();
    });
});
