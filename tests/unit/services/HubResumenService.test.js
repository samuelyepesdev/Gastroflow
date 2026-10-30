jest.mock('../../../config/database');
jest.mock('../../../repositories/Admin/HubRepository');
jest.mock('../../../utils/dateHelpers', () => ({
    hoyColombia: jest.fn(() => '2026-10-28'),
    sumarDias: jest.fn(() => '2026-10-22'),
    rangoUtcColombia: jest.fn((desde, hasta = desde) => ({
        utcDesde: `${desde} 05:00:00`,
        utcHasta: `${hasta} 23:59:59`
    }))
}));

const HubRepository = require('../../../repositories/Admin/HubRepository');
const HubResumenService = require('../../../services/Admin/HubResumenService');

const metrica = (resumen, clave) => resumen.metricas.find(m => m.clave === clave);

describe('HubResumenService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        HubRepository.pingDb.mockResolvedValue(12);
        HubRepository.restaurantes.mockResolvedValue({
            total: '10',
            activos: '8',
            suspendidos_por_pago: '0',
            con_cobro_fallido: '0'
        });
        HubRepository.usuariosActivos.mockResolvedValue(31);
        HubRepository.ventas.mockResolvedValue({ total: '1250000.50', facturas: 42, restaurantes: 6 });
        HubRepository.cobrosFallidos.mockResolvedValue(0);
    });

    it('arma las métricas con tipos numéricos y formato del contrato del Hub', async () => {
        const r = await HubResumenService.obtener();

        expect(typeof r.version).toBe('string');
        expect(metrica(r, 'ventas_hoy')).toMatchObject({ valor: 1250000.5, formato: 'pesos' });
        expect(metrica(r, 'facturas_hoy').valor).toBe(42);
        expect(metrica(r, 'restaurantes_activos').valor).toBe(8);
        expect(metrica(r, 'restaurantes_vendieron_hoy').valor).toBe(6);
        expect(metrica(r, 'usuarios_activos').valor).toBe(31);
        expect(metrica(r, 'latencia_db_ms').valor).toBe(12);
        expect(r.alertas).toEqual([]);
        r.metricas.forEach(m => expect(['numero', 'pesos', 'texto']).toContain(m.formato));
    });

    it('consulta las ventas con el rango UTC del día de Colombia', async () => {
        await HubResumenService.obtener();
        expect(HubRepository.ventas).toHaveBeenCalledWith('2026-10-28 05:00:00', '2026-10-28 23:59:59');
    });

    it('informa el entorno (producción o desarrollo)', async () => {
        const original = process.env.NODE_ENV;
        process.env.NODE_ENV = 'production';
        expect(metrica(await HubResumenService.obtener(), 'entorno').valor).toBe('Producción');
        process.env.NODE_ENV = 'development';
        expect(metrica(await HubResumenService.obtener(), 'entorno').valor).toBe('Desarrollo');
        process.env.NODE_ENV = original;
    });

    it('avisa de suspendidos, cobros fallidos y base de datos lenta', async () => {
        HubRepository.restaurantes.mockResolvedValue({
            total: '10',
            activos: '8',
            suspendidos_por_pago: '2',
            con_cobro_fallido: '3'
        });
        HubRepository.cobrosFallidos.mockResolvedValue(4);
        HubRepository.pingDb.mockResolvedValue(900);

        const { alertas } = await HubResumenService.obtener();
        const mensajes = alertas.map(a => a.mensaje).join(' | ');

        expect(mensajes).toMatch(/2 restaurante\(s\) suspendido/);
        expect(mensajes).toMatch(/1 restaurante\(s\) con el último cobro fallido/);
        expect(mensajes).toMatch(/4 cobro\(s\)/);
        expect(mensajes).toMatch(/900 ms/);
        alertas.forEach(a => expect(['info', 'warning', 'critical']).toContain(a.nivel));
    });

    it('propaga el error si la base de datos falla (el controlador responderá 503)', async () => {
        HubRepository.pingDb.mockRejectedValue(new Error('ECONNREFUSED'));
        await expect(HubResumenService.obtener()).rejects.toThrow('ECONNREFUSED');
    });
});
