/**
 * FacturaService.editarCliente: solo se corrige el cliente de facturas normales (sin facturación electrónica).
 */

jest.mock('../../../repositories/Tenant/FacturaRepository', () => ({
    findParaEditarCliente: jest.fn(),
    updateCliente: jest.fn()
}));
jest.mock('../../../repositories/Tenant/ClienteRepository', () => ({
    findById: jest.fn()
}));
jest.mock('../../../services/Tenant/InventarioService', () => ({}));
jest.mock('../../../services/Tenant/ModificadorService', () => ({}));
jest.mock('../../../services/Tenant/ComboArmableService', () => ({}));
jest.mock('../../../services/Tenant/PrecioCatalogoService', () => ({}));
jest.mock('../../../services/Tenant/Facturacion/PostVentaService', () => ({}));
jest.mock('../../../services/Tenant/TenantOwnership', () => ({}));
jest.mock('../../../repositories/Tenant/EventoRepository', () => ({}));

const FacturaRepository = require('../../../repositories/Tenant/FacturaRepository');
const ClienteRepository = require('../../../repositories/Tenant/ClienteRepository');
const FacturaService = require('../../../services/Tenant/FacturaService');

describe('FacturaService.editarCliente', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        FacturaRepository.findParaEditarCliente.mockResolvedValue({ id: 10, numero: 5, cliente_id: 1, tiene_fe: 0 });
        ClienteRepository.findById.mockResolvedValue({ id: 7, nombre: 'Ana' });
        FacturaRepository.updateCliente.mockResolvedValue(true);
    });

    it('cambia el cliente de una factura normal', async () => {
        const r = await FacturaService.editarCliente(3, 10, 7);

        expect(FacturaRepository.updateCliente).toHaveBeenCalledWith(10, 3, 7);
        expect(r).toEqual({ id: 10, cliente_id: 7, cliente_nombre: 'Ana' });
    });

    it('rechaza una factura con facturación electrónica (409) sin escribir', async () => {
        FacturaRepository.findParaEditarCliente.mockResolvedValue({ id: 10, cliente_id: 1, tiene_fe: 1 });

        await expect(FacturaService.editarCliente(3, 10, 7)).rejects.toMatchObject({
            statusCode: 409,
            code: 'FACTURA_ELECTRONICA'
        });
        expect(FacturaRepository.updateCliente).not.toHaveBeenCalled();
    });

    it('rechaza si la emisión electrónica se encoló entre la lectura y el UPDATE (409)', async () => {
        FacturaRepository.updateCliente.mockResolvedValue(false);

        await expect(FacturaService.editarCliente(3, 10, 7)).rejects.toMatchObject({
            statusCode: 409,
            code: 'FACTURA_ELECTRONICA'
        });
    });

    it('404 si la factura no es de este restaurante', async () => {
        FacturaRepository.findParaEditarCliente.mockResolvedValue(null);

        await expect(FacturaService.editarCliente(3, 10, 7)).rejects.toMatchObject({
            statusCode: 404,
            code: 'FACTURA_NO_ENCONTRADA'
        });
        expect(FacturaRepository.findParaEditarCliente).toHaveBeenCalledWith(10, 3);
    });

    it('404 si el cliente es de otro restaurante', async () => {
        ClienteRepository.findById.mockResolvedValue(null);

        await expect(FacturaService.editarCliente(3, 10, 7)).rejects.toMatchObject({
            statusCode: 404,
            code: 'CLIENTE_NO_ENCONTRADO'
        });
        expect(ClienteRepository.findById).toHaveBeenCalledWith(7, 3);
        expect(FacturaRepository.updateCliente).not.toHaveBeenCalled();
    });

    it.each([[undefined], [null], [''], ['abc'], [0], [-2], [1.5]])('400 con cliente_id inválido (%p)', async valor => {
        await expect(FacturaService.editarCliente(3, 10, valor)).rejects.toMatchObject({
            statusCode: 400,
            code: 'CLIENTE_INVALIDO'
        });
        expect(FacturaRepository.updateCliente).not.toHaveBeenCalled();
    });

    it('400 con id de factura inválido', async () => {
        await expect(FacturaService.editarCliente(3, 'x', 7)).rejects.toMatchObject({
            statusCode: 400,
            code: 'FACTURA_INVALIDA'
        });
    });
});
