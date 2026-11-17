/**
 * FacturaService.editarPago / getEditable: la forma de pago solo se corrige en facturas normales
 * cuyo turno de caja sigue abierto; el total y el bono no cambian.
 */

jest.mock('../../../repositories/Tenant/FacturaRepository', () => ({
    findParaEditar: jest.fn(),
    updatePago: jest.fn()
}));
jest.mock('../../../repositories/Tenant/ClienteRepository', () => ({}));
jest.mock('../../../services/Tenant/InventarioService', () => ({}));
jest.mock('../../../services/Tenant/ModificadorService', () => ({}));
jest.mock('../../../services/Tenant/ComboArmableService', () => ({}));
jest.mock('../../../services/Tenant/PrecioCatalogoService', () => ({}));
jest.mock('../../../services/Tenant/Facturacion/PostVentaService', () => ({}));
jest.mock('../../../services/Tenant/TenantOwnership', () => ({}));
jest.mock('../../../repositories/Tenant/EventoRepository', () => ({}));
jest.mock('../../../services/Shared/CacheService', () => ({
    deleteByPrefix: jest.fn(),
    delete: jest.fn()
}));

const FacturaRepository = require('../../../repositories/Tenant/FacturaRepository');
const cacheService = require('../../../services/Shared/CacheService');
const FacturaService = require('../../../services/Tenant/FacturaService');

const facturaNormal = (extra = {}) => ({
    id: 10,
    numero: 5,
    cliente_id: 1,
    cliente_nombre: 'Ana',
    total: 50000,
    forma_pago: 'efectivo',
    monto_efectivo: 50000,
    monto_transferencia: 0,
    monto_bono: 0,
    efectivo_recibido: 60000,
    caja_sesion_id: 4,
    estado_caja: 'abierta',
    tiene_fe: 0,
    ...extra
});

describe('FacturaService.editarPago', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        FacturaRepository.findParaEditar.mockResolvedValue(facturaNormal());
        FacturaRepository.updatePago.mockResolvedValue({ updated: true });
    });

    it('efectivo -> transferencia: mueve todo el cobro y borra el efectivo recibido', async () => {
        const r = await FacturaService.editarPago(3, 10, { forma_pago: 'transferencia' });

        expect(FacturaRepository.updatePago).toHaveBeenCalledWith(10, 3, {
            formaPago: 'transferencia',
            montoEfectivo: 0,
            montoTransferencia: 50000,
            efectivoRecibido: null
        });
        expect(r).toEqual({ id: 10, forma_pago: 'transferencia', monto_efectivo: 0, monto_transferencia: 50000 });
        expect(cacheService.deleteByPrefix).toHaveBeenCalledWith('tenant_dashboard_stats_3');
    });

    it('a mixto reparte según lo indicado y conserva el efectivo recibido si lo cubre', async () => {
        await FacturaService.editarPago(3, 10, {
            forma_pago: 'mixto',
            monto_efectivo: 20000,
            monto_transferencia: 30000
        });

        expect(FacturaRepository.updatePago).toHaveBeenCalledWith(10, 3, {
            formaPago: 'mixto',
            montoEfectivo: 20000,
            montoTransferencia: 30000,
            efectivoRecibido: 60000
        });
    });

    it('mixto que no suma lo cobrado da 400 y no escribe', async () => {
        await expect(
            FacturaService.editarPago(3, 10, { forma_pago: 'mixto', monto_efectivo: 10000, monto_transferencia: 10000 })
        ).rejects.toMatchObject({ statusCode: 400, code: 'PAGO_INVALIDO' });
        expect(FacturaRepository.updatePago).not.toHaveBeenCalled();
    });

    it('con bono, solo reparte lo cobrado en dinero (total menos bono) y la forma queda mixta', async () => {
        FacturaRepository.findParaEditar.mockResolvedValue(
            facturaNormal({ total: 50000, monto_bono: 20000, monto_efectivo: 30000, forma_pago: 'mixto' })
        );

        await FacturaService.editarPago(3, 10, { forma_pago: 'transferencia' });

        expect(FacturaRepository.updatePago).toHaveBeenCalledWith(10, 3, {
            formaPago: 'mixto',
            montoEfectivo: 0,
            montoTransferencia: 30000,
            efectivoRecibido: null
        });
    });

    it('rechaza (409) si el turno de caja ya está cerrado, sin escribir', async () => {
        FacturaRepository.findParaEditar.mockResolvedValue(facturaNormal({ estado_caja: 'cerrada' }));

        await expect(FacturaService.editarPago(3, 10, { forma_pago: 'transferencia' })).rejects.toMatchObject({
            statusCode: 409,
            code: 'TURNO_CERRADO'
        });
        expect(FacturaRepository.updatePago).not.toHaveBeenCalled();
    });

    it('una factura sin turno de caja se puede corregir (no entra a ningún cierre)', async () => {
        FacturaRepository.findParaEditar.mockResolvedValue(facturaNormal({ caja_sesion_id: null, estado_caja: null }));

        await FacturaService.editarPago(3, 10, { forma_pago: 'transferencia' });

        expect(FacturaRepository.updatePago).toHaveBeenCalled();
    });

    it('rechaza (409) una factura electrónica', async () => {
        FacturaRepository.findParaEditar.mockResolvedValue(facturaNormal({ tiene_fe: 1 }));

        await expect(FacturaService.editarPago(3, 10, { forma_pago: 'transferencia' })).rejects.toMatchObject({
            statusCode: 409,
            code: 'FACTURA_ELECTRONICA'
        });
        expect(FacturaRepository.updatePago).not.toHaveBeenCalled();
    });

    it('rechaza (400) una factura pagada completa con bono', async () => {
        FacturaRepository.findParaEditar.mockResolvedValue(
            facturaNormal({ monto_bono: 50000, monto_efectivo: 0, forma_pago: 'bono' })
        );

        await expect(FacturaService.editarPago(3, 10, { forma_pago: 'efectivo' })).rejects.toMatchObject({
            statusCode: 400,
            code: 'SIN_COBRO_EN_DINERO'
        });
    });

    it('si el turno se cierra entre la lectura y el UPDATE, responde 409 TURNO_CERRADO', async () => {
        FacturaRepository.updatePago.mockResolvedValue({ updated: false, motivo: 'TURNO_CERRADO' });

        await expect(FacturaService.editarPago(3, 10, { forma_pago: 'transferencia' })).rejects.toMatchObject({
            statusCode: 409,
            code: 'TURNO_CERRADO'
        });
        expect(cacheService.deleteByPrefix).not.toHaveBeenCalled();
    });

    it('404 si la factura no es de este restaurante', async () => {
        FacturaRepository.findParaEditar.mockResolvedValue(null);

        await expect(FacturaService.editarPago(3, 10, { forma_pago: 'efectivo' })).rejects.toMatchObject({
            statusCode: 404
        });
        expect(FacturaRepository.findParaEditar).toHaveBeenCalledWith(10, 3);
    });

    it.each([[undefined], ['bono'], ['tarjeta'], ['']])('400 con forma de pago inválida (%p)', async forma => {
        await expect(FacturaService.editarPago(3, 10, { forma_pago: forma })).rejects.toMatchObject({
            statusCode: 400,
            code: 'FORMA_PAGO_INVALIDA'
        });
        expect(FacturaRepository.updatePago).not.toHaveBeenCalled();
    });
});

describe('FacturaService.getEditable', () => {
    beforeEach(() => jest.clearAllMocks());

    it('factura normal con turno abierto: forma de pago editable', async () => {
        FacturaRepository.findParaEditar.mockResolvedValue(facturaNormal({ monto_bono: 10000 }));

        const r = await FacturaService.getEditable(3, 10);

        expect(r).toMatchObject({
            id: 10,
            electronica: false,
            pendiente_en_dinero: 40000,
            pago_editable: true,
            pago_motivo: null
        });
    });

    it('turno cerrado: explica por qué la forma de pago no se puede corregir', async () => {
        FacturaRepository.findParaEditar.mockResolvedValue(facturaNormal({ estado_caja: 'cerrada' }));

        const r = await FacturaService.getEditable(3, 10);

        expect(r.pago_editable).toBe(false);
        expect(r.pago_motivo).toMatch(/turno de caja/);
    });

    it('factura electrónica: no editable', async () => {
        FacturaRepository.findParaEditar.mockResolvedValue(facturaNormal({ tiene_fe: 2 }));

        const r = await FacturaService.getEditable(3, 10);

        expect(r).toMatchObject({ electronica: true, pago_editable: false });
    });
});
