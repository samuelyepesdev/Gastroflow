jest.mock('../../../repositories/Tenant/NumeracionRepository', () => ({
    siguienteNumeroFactura: jest.fn().mockResolvedValue(41)
}));
jest.mock('../../../repositories/Tenant/BonoRepository', () => ({ redimir: jest.fn() }));
jest.mock('../../../repositories/Tenant/CajaRepository', () => ({ registrarSalidaServicioExterno: jest.fn() }));
jest.mock('../../../repositories/Tenant/ComboVentaRepository', () => ({ getInfoCombos: jest.fn() }));
jest.mock('../../../services/Shared/TaxService', () => ({
    getTasasPorProducto: jest.fn(),
    desglosarLinea: jest.fn((subtotal, tasa) => ({
        base_gravable: Math.round((subtotal / (1 + tasa / 100)) * 100) / 100,
        valor_impuesto: Math.round((subtotal - subtotal / (1 + tasa / 100)) * 100) / 100
    }))
}));

const BonoRepository = require('../../../repositories/Tenant/BonoRepository');
const CajaRepository = require('../../../repositories/Tenant/CajaRepository');
const ComboVentaRepository = require('../../../repositories/Tenant/ComboVentaRepository');
const TaxService = require('../../../services/Shared/TaxService');
const Nucleo = require('../../../repositories/Tenant/NucleoFacturaRepository');

const CONN = { query: jest.fn() };

beforeEach(() => {
    jest.clearAllMocks();
});

describe('NucleoFacturaRepository.obtenerNumeroYTurno', () => {
    test('número + turno abierto, leyendo el turno con LOCK IN SHARE MODE (serializa con el cierre de caja)', async () => {
        CONN.query.mockResolvedValue([[{ id: 9, usuario_id: 3 }]]);
        const r = await Nucleo.obtenerNumeroYTurno(CONN, 1);
        expect(r).toEqual({ numero: 41, cajaSesionId: 9, cajaSesionUsuarioId: 3 });
        expect(CONN.query.mock.calls[0][0]).toMatch(/estado = "abierta" LIMIT 1 LOCK IN SHARE MODE/);
        expect(CONN.query.mock.calls[0][1]).toEqual([1]);
    });

    test('sin turno abierto: ids nulos', async () => {
        CONN.query.mockResolvedValue([[]]);
        expect(await Nucleo.obtenerNumeroYTurno(CONN, 1)).toEqual({
            numero: 41,
            cajaSesionId: null,
            cajaSesionUsuarioId: null
        });
    });

    test('venta de otro día (evento): no consulta el turno', async () => {
        const r = await Nucleo.obtenerNumeroYTurno(CONN, 1, { sinTurno: true });
        expect(CONN.query).not.toHaveBeenCalled();
        expect(r).toEqual({ numero: 41, cajaSesionId: null, cajaSesionUsuarioId: null });
    });
});

describe('NucleoFacturaRepository.redimirBono', () => {
    test('descuenta el monto cubierto con la conexión de la venta', async () => {
        await Nucleo.redimirBono(CONN, {
            bono: { id: 5, saldo_actual: 30000 },
            montoBono: 12000,
            tenantId: 1,
            facturaId: 77,
            usuarioId: 8
        });
        expect(BonoRepository.redimir).toHaveBeenCalledWith(
            { bonoId: 5, tenantId: 1, saldoAnterior: 30000, monto: 12000, facturaId: 77, usuarioId: 8 },
            CONN
        );
    });

    test.each([
        [null, 5000],
        [{ id: 5, saldo_actual: 100 }, 0],
        [{ id: 5, saldo_actual: 100 }, undefined]
    ])('sin bono o sin monto (%p, %p) no hace nada', async (bono, montoBono) => {
        await Nucleo.redimirBono(CONN, { bono, montoBono, tenantId: 1, facturaId: 1 });
        expect(BonoRepository.redimir).not.toHaveBeenCalled();
    });
});

describe('NucleoFacturaRepository.compensarServiciosExternos', () => {
    const base = {
        tenantId: 1,
        cajaSesionId: 9,
        cajaSesionUsuarioId: 3,
        facturaId: 77,
        numeroFactura: 41,
        monto: 8000
    };

    test('registra la salida de caja; el usuario cae al del turno si no hay usuario de la venta', async () => {
        await Nucleo.compensarServiciosExternos(CONN, { ...base, usuarioId: null });
        expect(CajaRepository.registrarSalidaServicioExterno).toHaveBeenCalledWith(
            { tenantId: 1, sesionId: 9, usuarioId: 3, facturaId: 77, numeroFactura: 41, monto: 8000 },
            CONN
        );
        await Nucleo.compensarServiciosExternos(CONN, { ...base, usuarioId: 8 });
        expect(CajaRepository.registrarSalidaServicioExterno.mock.calls[1][0].usuarioId).toBe(8);
    });

    test.each([{ cajaSesionId: null }, { monto: 0 }, { monto: undefined }])(
        'sin turno o sin monto (%p) no registra nada',
        async cambio => {
            await Nucleo.compensarServiciosExternos(CONN, { ...base, ...cambio });
            expect(CajaRepository.registrarSalidaServicioExterno).not.toHaveBeenCalled();
        }
    );
});

describe('NucleoFacturaRepository.cargarTasas y desglosarLinea', () => {
    test('carga tasas solo de productos reales y combos únicos', async () => {
        TaxService.getTasasPorProducto.mockResolvedValue({ tasas: new Map([[7, 8]]), defaultTasa: 19 });
        ComboVentaRepository.getInfoCombos.mockResolvedValue(new Map([[50, { tasa_impuesto: 0 }]]));
        const r = await Nucleo.cargarTasas(CONN, 1, [
            { producto_id: 7 },
            { es_servicio: 1, servicio_id: 3 },
            { combo_id: 50 },
            { combo_id: 50 }
        ]);
        expect(TaxService.getTasasPorProducto).toHaveBeenCalledWith(1, [7], CONN);
        expect(ComboVentaRepository.getInfoCombos).toHaveBeenCalledWith(1, [50], CONN);
        expect(r.defaultTasa).toBe(19);
    });

    test('tasa por tipo de línea: producto, servicio (por defecto), combo (propia o por defecto)', () => {
        const ctx = {
            tasas: new Map([[7, 8]]),
            defaultTasa: 19,
            infoCombos: new Map([
                [50, { tasa_impuesto: 0 }],
                [51, { tasa_impuesto: null }]
            ])
        };
        expect(Nucleo.desglosarLinea({ producto_id: 7 }, 108, ctx).tasa).toBe(8);
        expect(Nucleo.desglosarLinea({ producto_id: 99 }, 119, ctx).tasa).toBe(19); // sin tasa propia: la del restaurante
        expect(Nucleo.desglosarLinea({ es_servicio: 1, servicio_id: 3 }, 119, ctx).tasa).toBe(19);
        expect(Nucleo.desglosarLinea({ combo_id: 50 }, 100, ctx).tasa).toBe(0); // combo exento
        expect(Nucleo.desglosarLinea({ combo_id: 51 }, 119, ctx).tasa).toBe(19); // NULL = la del restaurante
        const l = Nucleo.desglosarLinea({ producto_id: 7 }, 108, ctx);
        expect(l.base_gravable).toBe(100);
        expect(l.valor_impuesto).toBe(8);
    });
});
