/**
 * Tests unitarios para SuscripcionService.finalizarPago -- el punto único
 * donde se decide éxito/fracaso de un cobro de suscripción (dinero real +
 * suspensión/reactivación automática de un tenant), así que no debe quedar
 * sin cubrir como el resto del repo.
 */

jest.mock('../../../config/database', () => ({
    query: jest.fn()
}));

jest.mock('../../../services/Admin/AddonService', () => ({
    calcularTotalTenant: jest.fn().mockResolvedValue({ plan: 79900, addons: 0, total: 79900 })
}));

jest.mock('../../../services/Admin/TenantService', () => ({
    changeTenantStatus: jest.fn().mockResolvedValue(undefined)
}));

jest.mock('../../../services/Admin/TenantAuditService', () => ({
    log: jest.fn().mockResolvedValue(undefined)
}));

jest.mock('../../../services/Shared/MailerService', () => ({
    sendMail: jest.fn().mockResolvedValue({ ok: true })
}));

jest.mock('../../../services/Shared/CacheService', () => ({
    delete: jest.fn()
}));

jest.mock('../../../services/Shared/WompiService', () => ({
    cobrar: jest.fn(),
    consultarTransaccion: jest.fn()
}));

const db = require('../../../config/database');
const WompiService = require('../../../services/Shared/WompiService');
const TenantService = require('../../../services/Admin/TenantService');
const TenantAuditService = require('../../../services/Admin/TenantAuditService');
const MailerService = require('../../../services/Shared/MailerService');
const SuscripcionService = require('../../../services/Admin/SuscripcionService');

/** Configura db.query para responder según el texto de la consulta, sin depender del orden exacto de llamadas. */
function mockDbByQuery({ pago, tenant, updateAfecta = 1 }) {
    db.query.mockImplementation(sql => {
        if (sql.includes('FROM suscripcion_pagos WHERE wompi_reference')) {
            return Promise.resolve([[pago]]);
        }
        if (sql.includes('UPDATE suscripcion_pagos SET estado')) {
            return Promise.resolve([{ affectedRows: updateAfecta }]);
        }
        if (sql.includes('SELECT id, nombre, email, suspendido_por_pago')) {
            return Promise.resolve([[tenant]]);
        }
        // Cualquier otro UPDATE (tenants.proximo_cobro, intentos_fallidos_pago, suspendido_por_pago)
        return Promise.resolve([{}]);
    });
}

describe('SuscripcionService.finalizarPago', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('cobro exitoso normal: avanza proximo_cobro, resetea intentos, envía recibo, no toca activo', async () => {
        const pago = { id: 1, tenant_id: 5, estado: 'pendiente', monto: 79900 };
        const tenant = {
            id: 5,
            nombre: 'La Parrilla',
            email: 'dueno@parrilla.com',
            suspendido_por_pago: 0,
            intentos_fallidos_pago: 0,
            proximo_cobro: '2026-09-01'
        };
        mockDbByQuery({ pago, tenant });

        await SuscripcionService.finalizarPago({ reference: 'sub-5-1', status: 'APPROVED', rawPayload: {} });

        expect(TenantService.changeTenantStatus).not.toHaveBeenCalled();
        expect(TenantAuditService.log).toHaveBeenCalledWith(
            expect.objectContaining({ tenantId: 5, accion: 'cobro_suscripcion_exitoso' })
        );
        expect(MailerService.sendMail).toHaveBeenCalledWith(
            expect.objectContaining({ to: 'dueno@parrilla.com', subject: expect.stringContaining('Recibo') })
        );
    });

    it('cobro exitoso con proximo_cobro como Date (así llega la columna DATE en producción) avanza un mes', async () => {
        const pago = { id: 3, tenant_id: 6, estado: 'pendiente', monto: 79900 };
        const tenant = {
            id: 6,
            nombre: 'El Fogón',
            email: 'dueno@fogon.com',
            suspendido_por_pago: 0,
            intentos_fallidos_pago: 0,
            proximo_cobro: new Date(2026, 0, 31) // 31-ene, a medianoche local como lo arma mysql2
        };
        mockDbByQuery({ pago, tenant });

        await SuscripcionService.finalizarPago({ reference: 'sub-6-1', status: 'APPROVED', rawPayload: {} });

        const update = db.query.mock.calls.find(([sql]) => sql.includes('UPDATE tenants SET proximo_cobro'));
        expect(update).toBeDefined();
        // Antes: "Invalid time value" (y el tenant quedaba listo para cobrarse otra vez).
        // Fin de mes: 31-ene + 1 mes = 28-feb, no 3-mar.
        expect(update[1][0]).toBe('2026-02-28');
    });

    it('cobro exitoso mientras estaba suspendido: reactiva el tenant y envía correo de reactivación', async () => {
        const pago = { id: 2, tenant_id: 7, estado: 'pendiente', monto: 79900 };
        const tenant = {
            id: 7,
            nombre: 'Bistro Urbano',
            email: 'dueno@bistro.com',
            suspendido_por_pago: 1,
            intentos_fallidos_pago: 3,
            proximo_cobro: '2026-08-01'
        };
        mockDbByQuery({ pago, tenant });

        await SuscripcionService.finalizarPago({ reference: 'sub-7-1', status: 'APPROVED', rawPayload: {} });

        expect(TenantService.changeTenantStatus).toHaveBeenCalledWith(7, true);
        expect(TenantAuditService.log).toHaveBeenCalledWith(
            expect.objectContaining({ tenantId: 7, accion: 'suscripcion_reactivada' })
        );
        expect(MailerService.sendMail).toHaveBeenCalledWith(
            expect.objectContaining({ subject: expect.stringContaining('reactivado') })
        );
    });

    it('cobro fallido por debajo del umbral: incrementa intentos, no suspende', async () => {
        const pago = { id: 3, tenant_id: 9, estado: 'pendiente', monto: 79900 };
        const tenant = {
            id: 9,
            nombre: 'Burger Loft',
            email: 'dueno@burgerloft.com',
            suspendido_por_pago: 0,
            intentos_fallidos_pago: 1,
            proximo_cobro: '2026-09-01'
        };
        mockDbByQuery({ pago, tenant });

        await SuscripcionService.finalizarPago({ reference: 'sub-9-2', status: 'DECLINED', rawPayload: {} });

        expect(TenantService.changeTenantStatus).not.toHaveBeenCalled();
        expect(TenantAuditService.log).toHaveBeenCalledWith(
            expect.objectContaining({ tenantId: 9, accion: 'cobro_suscripcion_fallido' })
        );
        expect(MailerService.sendMail).toHaveBeenCalledWith(
            expect.objectContaining({ subject: expect.stringContaining('No pudimos cobrar') })
        );
    });

    it('cobro fallido que alcanza el umbral (3 intentos): suspende automáticamente al tenant', async () => {
        const pago = { id: 4, tenant_id: 11, estado: 'pendiente', monto: 79900 };
        const tenant = {
            id: 11,
            nombre: 'Pastelería Dulce',
            email: 'dueno@dulce.com',
            suspendido_por_pago: 0,
            intentos_fallidos_pago: 2,
            proximo_cobro: '2026-09-01'
        };
        mockDbByQuery({ pago, tenant });

        await SuscripcionService.finalizarPago({ reference: 'sub-11-3', status: 'DECLINED', rawPayload: {} });

        expect(TenantService.changeTenantStatus).toHaveBeenCalledWith(11, false);
        expect(TenantAuditService.log).toHaveBeenCalledWith(
            expect.objectContaining({ tenantId: 11, accion: 'suscripcion_suspendida_por_pago' })
        );
        expect(MailerService.sendMail).toHaveBeenCalledWith(
            expect.objectContaining({ subject: expect.stringContaining('suspendido') })
        );
    });

    it('no reprocesa un pago que ya no está pendiente (idempotencia ante reintentos de webhook)', async () => {
        const pago = { id: 5, tenant_id: 13, estado: 'exitoso', monto: 79900 };
        db.query.mockImplementation(sql => {
            if (sql.includes('FROM suscripcion_pagos WHERE wompi_reference')) {
                return Promise.resolve([[pago]]);
            }
            return Promise.resolve([{}]);
        });

        await SuscripcionService.finalizarPago({ reference: 'sub-13-1', status: 'APPROVED', rawPayload: {} });

        expect(TenantService.changeTenantStatus).not.toHaveBeenCalled();
        expect(TenantAuditService.log).not.toHaveBeenCalled();
        expect(MailerService.sendMail).not.toHaveBeenCalled();
    });
});

describe('SuscripcionService.finalizarPago: carrera webhook vs respuesta síncrona', () => {
    beforeEach(() => jest.clearAllMocks());

    it('si otro proceso ya finalizó el pago (UPDATE no afecta filas) NO suma el mes ni envía recibo', async () => {
        const pago = { id: 8, tenant_id: 14, estado: 'pendiente', monto: 79900 };
        const tenant = {
            id: 14,
            nombre: 'Carrera',
            email: 'a@b.co',
            suspendido_por_pago: 0,
            intentos_fallidos_pago: 0,
            proximo_cobro: '2026-09-01'
        };
        mockDbByQuery({ pago, tenant, updateAfecta: 0 });

        await SuscripcionService.finalizarPago({ reference: 'sub-14-1', status: 'APPROVED', rawPayload: {} });

        const update = db.query.mock.calls.find(([sql]) => sql.includes('UPDATE suscripcion_pagos SET estado'));
        expect(update[0]).toMatch(/AND estado = 'pendiente'/);
        expect(db.query.mock.calls.some(([sql]) => sql.includes('UPDATE tenants SET proximo_cobro'))).toBe(false);
        expect(MailerService.sendMail).not.toHaveBeenCalled();
        expect(TenantAuditService.log).not.toHaveBeenCalled();
    });
});

describe('SuscripcionService._intentarCobro', () => {
    const tenant = {
        id: 21,
        nombre: 'Cobro',
        email: 'c@d.co',
        plan_id: 1,
        tamano: 'pequeno',
        wompi_payment_source_id: 99,
        intentos_fallidos_pago: 0
    };

    /** db.query por texto: `enCurso` simula un cobro pendiente reciente. */
    function mockDb({ enCurso = false } = {}) {
        db.query.mockImplementation(sql => {
            if (sql.includes("estado = 'pendiente' AND created_at >")) {
                return Promise.resolve([enCurso ? [{ id: 1 }] : []]);
            }
            if (sql.includes('FROM suscripcion_pagos WHERE wompi_reference')) {
                return Promise.resolve([[{ id: 7, tenant_id: 21, estado: 'pendiente', monto: 79900 }]]);
            }
            if (sql.includes('SELECT id, nombre, email, suspendido_por_pago')) {
                return Promise.resolve([[{ id: 21, nombre: 'Cobro', email: 'c@d.co', proximo_cobro: '2026-09-01' }]]);
            }
            return Promise.resolve([{ affectedRows: 1 }]);
        });
    }

    beforeEach(() => jest.clearAllMocks());

    it('guarda wompi_transaction_id apenas Wompi responde, aunque siga PENDING (base de la reconciliación)', async () => {
        mockDb();
        WompiService.cobrar.mockResolvedValue({ id: 'tx-abc', status: 'PENDING' });

        await SuscripcionService._intentarCobro(tenant);

        const guardado = db.query.mock.calls.find(([sql]) => sql.includes('SET wompi_transaction_id = ?'));
        expect(guardado).toBeDefined();
        expect(guardado[1][0]).toBe('tx-abc');
        expect(guardado[1][1]).toMatch(/^sub-21-/); // misma referencia del INSERT
        expect(db.query.mock.calls.some(([sql]) => sql.includes('UPDATE suscripcion_pagos SET estado'))).toBe(false);
    });

    it('si Wompi resuelve en el acto, finaliza pasando también el id de la transacción', async () => {
        mockDb();
        WompiService.cobrar.mockResolvedValue({ id: 'tx-ok', status: 'APPROVED' });

        await SuscripcionService._intentarCobro(tenant);

        const finalizacion = db.query.mock.calls.find(([sql]) => sql.includes('UPDATE suscripcion_pagos SET estado'));
        expect(finalizacion[1][1]).toBe('tx-ok'); // transactionId
    });

    it('con un cobro pendiente reciente NO crea otro (ni llama a Wompi): evita cobrar dos veces', async () => {
        mockDb({ enCurso: true });

        await expect(SuscripcionService._intentarCobro(tenant)).rejects.toMatchObject({ code: 'COBRO_EN_CURSO' });

        expect(WompiService.cobrar).not.toHaveBeenCalled();
        expect(db.query.mock.calls.some(([sql]) => sql.includes('INSERT INTO suscripcion_pagos'))).toBe(false);
    });
});

describe('SuscripcionService.reconciliarPendientes', () => {
    beforeEach(() => jest.clearAllMocks());

    it('consulta a Wompi por el id guardado y finaliza el cobro con ese id', async () => {
        db.query.mockImplementation(sql => {
            if (sql.includes('AND wompi_transaction_id IS NOT NULL')) {
                return Promise.resolve([[{ id: 7, wompi_transaction_id: 'tx-9', wompi_reference: 'sub-21-1' }]]);
            }
            if (sql.includes('FROM suscripcion_pagos WHERE wompi_reference')) {
                return Promise.resolve([[{ id: 7, tenant_id: 21, estado: 'pendiente', monto: 79900 }]]);
            }
            if (sql.includes('SELECT id, nombre, email, suspendido_por_pago')) {
                return Promise.resolve([[{ id: 21, nombre: 'X', email: 'x@y.co', proximo_cobro: '2026-09-01' }]]);
            }
            return Promise.resolve([{ affectedRows: 1 }]);
        });
        WompiService.consultarTransaccion.mockResolvedValue({ id: 'tx-9', status: 'APPROVED' });

        await SuscripcionService.reconciliarPendientes();

        expect(WompiService.consultarTransaccion).toHaveBeenCalledWith('tx-9');
        const update = db.query.mock.calls.find(([sql]) => sql.includes('UPDATE suscripcion_pagos SET estado'));
        expect(update[1][0]).toBe('exitoso');
    });
});
