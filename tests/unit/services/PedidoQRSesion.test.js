jest.mock('../../../config/database', () => ({ getConnection: jest.fn(), query: jest.fn() }));
jest.mock('../../../repositories/Tenant/NumeracionRepository', () => ({}));
jest.mock('../../../repositories/Public/MenuQRRepository', () => ({}));
jest.mock('../../../services/Shared/RealtimeEvents', () => ({}));
jest.mock('../../../services/Tenant/InventarioService', () => ({}));
jest.mock('../../../services/Tenant/ModificadorService', () => ({}));
jest.mock('../../../services/Tenant/PromocionService', () => ({}));
jest.mock('../../../services/Tenant/ComboArmableService', () => ({}));
jest.mock('../../../repositories/Tenant/ComboVentaRepository', () => ({}));

const db = require('../../../config/database');
const PedidoQRService = require('../../../services/Public/PedidoQRService');

const item = { producto_id: 1, cantidad: 1 };

describe('PedidoQRService.procesarPedido: validación y sesión', () => {
    let conn;
    beforeEach(() => {
        jest.clearAllMocks();
        conn = { beginTransaction: jest.fn(), rollback: jest.fn(), release: jest.fn(), query: jest.fn() };
        db.getConnection.mockResolvedValue(conn);
    });

    test('más de 50 productos se rechaza antes de tocar la BD', async () => {
        const items = Array.from({ length: 51 }, () => item);
        await expect(PedidoQRService.procesarPedido('tok', items, null, '1.1.1.1', {})).rejects.toMatchObject({
            status: 400
        });
        expect(db.getConnection).not.toHaveBeenCalled();
    });

    test.each([0, -1, 100, 1.5, 'x', null])('cantidad %p se rechaza con 400', async cantidad => {
        await expect(
            PedidoQRService.procesarPedido('tok', [{ producto_id: 1, cantidad }], null, '1.1.1.1', {})
        ).rejects.toMatchObject({ status: 400 });
        expect(db.getConnection).not.toHaveBeenCalled();
    });

    test('mesa SIN sesión QR ya no acepta pedidos (antes pasaba con solo el qr_token)', async () => {
        conn.query.mockResolvedValueOnce([[{ id: 5, tenant_id: 1, qr_session_id: null, activo: 1 }]]);
        await expect(PedidoQRService.procesarPedido('tok', [item], null, '1.1.1.1', {})).rejects.toMatchObject({
            status: 403
        });
        expect(conn.rollback).toHaveBeenCalled();
    });

    test('cookie distinta a la sesión de la mesa se rechaza', async () => {
        conn.query.mockResolvedValueOnce([[{ id: 5, tenant_id: 1, qr_session_id: 'abc', activo: 1 }]]);
        await expect(
            PedidoQRService.procesarPedido('tok', [item], null, '1.1.1.1', { qr_session_5: 'otra' })
        ).rejects.toMatchObject({ status: 403 });
    });
});
