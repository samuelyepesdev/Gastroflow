const ConfirmacionStore = require('../../../services/Tenant/Asistente/ConfirmacionStore');
const CacheService = require('../../../services/Shared/CacheService');

const accion = { tool: 'liberar_mesa', payload: { mesa_id: 40 } };

describe('ConfirmacionStore', () => {
    afterEach(() => {
        jest.restoreAllMocks();
        CacheService.deleteByPrefix('asistente:');
    });

    it('guarda la acción y la entrega UNA sola vez a quien la propuso', () => {
        const id = ConfirmacionStore.crear({ tenantId: 5, userId: 9, accion, resumen: 'Liberar la mesa 4.' });

        expect(id).toMatch(/^[0-9a-f]{32}$/);
        expect(ConfirmacionStore.consumir({ tenantId: 5, userId: 9, id })).toEqual({
            accion,
            resumen: 'Liberar la mesa 4.'
        });
        expect(ConfirmacionStore.consumir({ tenantId: 5, userId: 9, id })).toBeNull();
    });

    it('otro usuario o de otro restaurante no puede consumirla, y eso no la gasta', () => {
        const id = ConfirmacionStore.crear({ tenantId: 5, userId: 9, accion, resumen: 'x' });

        expect(ConfirmacionStore.consumir({ tenantId: 5, userId: 10, id })).toBeNull();
        expect(ConfirmacionStore.consumir({ tenantId: 6, userId: 9, id })).toBeNull();
        expect(ConfirmacionStore.consumir({ tenantId: 5, userId: 9, id })).not.toBeNull();
    });

    it('un id inventado o con otra forma no consume nada', () => {
        const id = ConfirmacionStore.crear({ tenantId: 5, userId: 9, accion, resumen: 'x' });

        expect(ConfirmacionStore.consumir({ tenantId: 5, userId: 9, id: 'a'.repeat(32) })).toBeNull();
        expect(ConfirmacionStore.consumir({ tenantId: 5, userId: 9, id: { $ne: null } })).toBeNull();
        expect(ConfirmacionStore.consumir({ tenantId: 5, userId: 9, id: undefined })).toBeNull();
        expect(ConfirmacionStore.consumir({ tenantId: 5, userId: 9, id })).not.toBeNull();
    });

    it('vence a los pocos minutos', () => {
        const ahora = Date.now();
        const id = ConfirmacionStore.crear({ tenantId: 5, userId: 9, accion, resumen: 'x' });

        jest.spyOn(Date, 'now').mockReturnValue(ahora + (ConfirmacionStore.TTL_SEGUNDOS + 1) * 1000);

        expect(ConfirmacionStore.consumir({ tenantId: 5, userId: 9, id })).toBeNull();
    });

    it('cada usuario tiene una sola pendiente: la nueva reemplaza a la anterior', () => {
        const viejo = ConfirmacionStore.crear({ tenantId: 5, userId: 9, accion, resumen: 'viejo' });
        const nuevo = ConfirmacionStore.crear({ tenantId: 5, userId: 9, accion, resumen: 'nuevo' });

        expect(ConfirmacionStore.consumir({ tenantId: 5, userId: 9, id: viejo })).toBeNull();
        expect(ConfirmacionStore.consumir({ tenantId: 5, userId: 9, id: nuevo }).resumen).toBe('nuevo');
    });

    it('las pendientes de usuarios distintos no se pisan', () => {
        const a = ConfirmacionStore.crear({ tenantId: 5, userId: 1, accion, resumen: 'a' });
        const b = ConfirmacionStore.crear({ tenantId: 5, userId: 2, accion, resumen: 'b' });

        expect(ConfirmacionStore.consumir({ tenantId: 5, userId: 1, id: a }).resumen).toBe('a');
        expect(ConfirmacionStore.consumir({ tenantId: 5, userId: 2, id: b }).resumen).toBe('b');
    });
});
