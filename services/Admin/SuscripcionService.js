/**
 * SuscripcionService - Cobro recurrente de la suscripción de cada tenant vía
 * Wompi. Orquesta WompiService (cliente HTTP puro) + AddonService (cálculo de
 * precio, ya existente) + TenantService (activar/desactivar, ya existente) +
 * MailerService + TenantAuditService.
 *
 * Política de reintento/suspensión (confirmada con el usuario): el cron corre
 * una vez al día; si el cobro falla, se reintenta al día siguiente sin volver
 * a avanzar `proximo_cobro`; al tercer intento fallido consecutivo se
 * suspende automáticamente al tenant (tenants.activo = 0). Un cobro exitoso
 * posterior reactiva automáticamente si la suspensión fue por impago.
 *
 * Regla de seguridad: el cron NUNCA toca un tenant sin
 * wompi_payment_source_id -- los tenants existentes siguen en cobro 100%
 * manual hasta que registren una tarjeta desde /facturacion.
 */
const db = require('../../config/database');
const WompiService = require('../Shared/WompiService');
const AddonService = require('./AddonService');
const TenantService = require('./TenantService');
const TenantAuditService = require('./TenantAuditService');
const MailerService = require('../Shared/MailerService');
const CacheService = require('../Shared/CacheService');

const MAX_INTENTOS = 3;
const RECONCILIAR_DESPUES_DE_MINUTOS = 60;

function addOneMonth(dateStr) {
    const d = dateStr ? new Date(`${dateStr}T00:00:00`) : new Date();
    d.setMonth(d.getMonth() + 1);
    return d.toISOString().slice(0, 10);
}

function todayStr() {
    return new Date().toISOString().slice(0, 10);
}

async function enviarCorreoSeguro(opts) {
    try {
        await MailerService.sendMail(opts);
    } catch (err) {
        console.error('Error enviando correo de suscripción:', err.message);
    }
}

class SuscripcionService {
    /**
     * Guarda el método de pago. `paymentSourceId` ya fue creado por
     * FacturacionController.guardarMetodoPago vía WompiService.crearFuenteDePago
     * (tokenización de tarjeta en el frontend -> payment_source_id reutilizable);
     * este método solo lo persiste, no vuelve a llamar a Wompi.
     *
     * No se hace ningún cobro aquí. Si el tenant no tenía ciclo todavía,
     * `proximo_cobro` queda en hoy para que el cron diario cobre el primer mes
     * en su próxima corrida; si ya tenía ciclo, solo se actualiza la tarjeta y
     * se respeta la fecha de cobro vigente.
     */
    static async registrarMetodoPago(tenantId, { paymentSourceId }) {
        if (!paymentSourceId) {
            throw new Error('paymentSourceId requerido');
        }

        const [rows] = await db.query('SELECT proximo_cobro FROM tenants WHERE id = ?', [tenantId]);
        const yaTeniaCiclo = rows[0] && rows[0].proximo_cobro;

        const params = [paymentSourceId];
        let query = 'UPDATE tenants SET wompi_payment_source_id = ?, intentos_fallidos_pago = 0';
        if (!yaTeniaCiclo) {
            query += ', proximo_cobro = ?';
            params.push(todayStr());
        }
        query += ' WHERE id = ?';
        params.push(tenantId);
        await db.query(query, params);
        CacheService.delete(`tenant:${tenantId}`);

        await TenantAuditService.log({
            tenantId,
            userId: null,
            accion: 'registrar_metodo_pago',
            detalles: `payment_source_id=${paymentSourceId}`
        });

        return { paymentSourceId };
    }

    /**
     * Job diario: intenta cobrar a todos los tenants con tarjeta guardada y
     * proximo_cobro vencido. Un tenant que falla no debe tumbar el batch
     * (mismo patrón que ReporteMensualService.procesarCierreMensual).
     */
    static async procesarCobrosDiarios() {
        const [tenants] = await db.query(
            `SELECT id, nombre, email, plan_id, tamano, wompi_payment_source_id, intentos_fallidos_pago
             FROM tenants
             WHERE wompi_payment_source_id IS NOT NULL
               AND proximo_cobro IS NOT NULL
               AND proximo_cobro <= CURDATE()`
        );

        await Promise.all(
            (tenants || []).map(async t => {
                try {
                    await SuscripcionService._intentarCobro(t);
                } catch (err) {
                    console.error(`Error cobrando suscripción del tenant ${t.id} (${t.nombre}):`, err.message);
                }
            })
        );
    }

    /** Estado de suscripción + historial de cobros de un tenant (para /facturacion y el panel de superadmin). */
    static async getEstado(tenantId) {
        const [tenantRows] = await db.query(
            `SELECT id, plan_id, tamano, wompi_payment_source_id, proximo_cobro,
                    intentos_fallidos_pago, suspendido_por_pago, ultimo_intento_cobro_at
             FROM tenants WHERE id = ?`,
            [tenantId]
        );
        const tenant = tenantRows[0];
        if (!tenant) {
            return null;
        }
        const { plan, addons, total } = await AddonService.calcularTotalTenant(tenantId, tenant.plan_id, tenant.tamano);
        const [historial] = await db.query(
            `SELECT id, monto, estado, periodo_desde, periodo_hasta, created_at
             FROM suscripcion_pagos WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 24`,
            [tenantId]
        );
        return {
            tieneMetodoPago: Boolean(tenant.wompi_payment_source_id),
            proximoCobro: tenant.proximo_cobro,
            intentosFallidos: tenant.intentos_fallidos_pago,
            suspendidoPorPago: Boolean(tenant.suspendido_por_pago),
            ultimoIntentoAt: tenant.ultimo_intento_cobro_at,
            montoPlan: plan,
            montoAddons: addons,
            montoTotal: total,
            historial
        };
    }

    /**
     * Reintento manual (botón superadmin o botón del propio tenant).
     * `fingerprint` ({ sessionId, deviceId }) llega solo cuando el cobro se
     * dispara desde el navegador (WompiJs); el cron llama sin él.
     */
    static async cobrarAhora(tenantId, userId = null, fingerprint = null) {
        const [rows] = await db.query(
            `SELECT id, nombre, email, plan_id, tamano, wompi_payment_source_id, intentos_fallidos_pago
             FROM tenants WHERE id = ?`,
            [tenantId]
        );
        const tenant = rows[0];
        if (!tenant) {
            throw new Error('Tenant no encontrado');
        }
        if (!tenant.wompi_payment_source_id) {
            throw new Error('El tenant no tiene un método de pago registrado');
        }
        await SuscripcionService._intentarCobro(tenant, userId, fingerprint);
    }

    /** Crea el intento de cobro en Wompi y la fila `pendiente` correspondiente. No decide éxito/fracaso -- eso lo resuelve finalizarPago (webhook o reconciliación). */
    static async _intentarCobro(tenant, userId = null, fingerprint = null) {
        const { total } = await AddonService.calcularTotalTenant(tenant.id, tenant.plan_id, tenant.tamano);
        if (!total || total <= 0) {
            return; // Sin plan/monto asignado: nada que cobrar.
        }

        const intentoNumero = (tenant.intentos_fallidos_pago || 0) + 1;
        const reference = `sub-${tenant.id}-${todayStr().replace(/-/g, '')}-${intentoNumero}-${Date.now()}`;
        const periodoDesde = todayStr();
        const periodoHasta = addOneMonth(periodoDesde);

        await db.query(
            `INSERT INTO suscripcion_pagos (tenant_id, monto, estado, wompi_reference, periodo_desde, periodo_hasta)
             VALUES (?, ?, 'pendiente', ?, ?, ?)`,
            [tenant.id, total, reference, periodoDesde, periodoHasta]
        );

        await db.query('UPDATE tenants SET ultimo_intento_cobro_at = NOW() WHERE id = ?', [tenant.id]);

        try {
            const { status } = await WompiService.cobrar({
                paymentSourceId: tenant.wompi_payment_source_id,
                amountInCents: Math.round(total * 100),
                customerEmail: tenant.email,
                reference,
                sessionId: fingerprint?.sessionId || null,
                deviceId: fingerprint?.deviceId || null
            });
            // Algunos métodos (tarjeta) pueden resolver sincrónicamente.
            if (status && status !== 'PENDING') {
                await SuscripcionService.finalizarPago({ reference, status, rawPayload: { status }, userId });
            }
        } catch (err) {
            // Fallo de red/API al crear la transacción: se trata igual que un rechazo.
            await SuscripcionService.finalizarPago({
                reference,
                status: 'ERROR',
                rawPayload: { error: err.message },
                userId
            });
        }
    }

    /**
     * Red de seguridad: si el webhook no llega, esta función (llamada al
     * inicio de cada tick del cron) consulta directamente el estado de las
     * transacciones que llevan más de una hora en `pendiente`.
     */
    static async reconciliarPendientes() {
        const [pendientes] = await db.query(
            `SELECT id, wompi_transaction_id, wompi_reference
             FROM suscripcion_pagos
             WHERE estado = 'pendiente'
               AND wompi_transaction_id IS NOT NULL
               AND created_at <= DATE_SUB(NOW(), INTERVAL ? MINUTE)`,
            [RECONCILIAR_DESPUES_DE_MINUTOS]
        );

        await Promise.all(
            (pendientes || []).map(async p => {
                try {
                    const { status } = await WompiService.consultarTransaccion(p.wompi_transaction_id);
                    if (status && status !== 'PENDING') {
                        await SuscripcionService.finalizarPago({
                            reference: p.wompi_reference,
                            transactionId: p.wompi_transaction_id,
                            status,
                            rawPayload: { status, reconciliado: true }
                        });
                    }
                } catch (err) {
                    console.error(`Error reconciliando pago ${p.wompi_reference}:`, err.message);
                }
            })
        );
    }

    /**
     * Punto único de finalización de un intento de cobro -- llamado por el
     * webhook, por la reconciliación de respaldo, o de forma síncrona cuando
     * Wompi resuelve la transacción en el mismo request.
     */
    static async finalizarPago({ reference, transactionId, status, rawPayload, userId = null }) {
        const [rows] = await db.query('SELECT * FROM suscripcion_pagos WHERE wompi_reference = ?', [reference]);
        const pago = rows[0];
        if (!pago) {
            console.error(`finalizarPago: no se encontró suscripcion_pagos con reference=${reference}`);
            return;
        }
        if (pago.estado !== 'pendiente') {
            return; // Ya finalizado (evita doble procesamiento si el webhook llega más de una vez).
        }

        const aprobado = status === 'APPROVED';
        const nuevoEstado = aprobado ? 'exitoso' : 'fallido';

        await db.query(
            `UPDATE suscripcion_pagos SET estado = ?, wompi_transaction_id = COALESCE(?, wompi_transaction_id), respuesta_raw = ?
             WHERE id = ?`,
            [nuevoEstado, transactionId || null, JSON.stringify(rawPayload || {}), pago.id]
        );

        const [tenantRows] = await db.query(
            'SELECT id, nombre, email, suspendido_por_pago, intentos_fallidos_pago, proximo_cobro FROM tenants WHERE id = ?',
            [pago.tenant_id]
        );
        const tenant = tenantRows[0];
        if (!tenant) {
            return;
        }

        if (aprobado) {
            await db.query('UPDATE tenants SET proximo_cobro = ?, intentos_fallidos_pago = 0 WHERE id = ?', [
                addOneMonth(tenant.proximo_cobro || todayStr()),
                tenant.id
            ]);
            CacheService.delete(`tenant:${tenant.id}`);

            if (tenant.suspendido_por_pago) {
                await db.query('UPDATE tenants SET suspendido_por_pago = 0 WHERE id = ?', [tenant.id]);
                await TenantService.changeTenantStatus(tenant.id, true);
                await TenantAuditService.log({
                    tenantId: tenant.id,
                    userId,
                    accion: 'suscripcion_reactivada',
                    detalles: `reference=${reference}`
                });
                await enviarCorreoSeguro({
                    to: tenant.email,
                    subject: 'Tu restaurante ha sido reactivado - GastroFlow',
                    html: `<div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;">
                        <h2>¡Buenas noticias!</h2>
                        <p>Recibimos tu pago y <strong>${tenant.nombre}</strong> ya está activo de nuevo en GastroFlow.</p>
                    </div>`
                });
            } else {
                await TenantAuditService.log({
                    tenantId: tenant.id,
                    userId,
                    accion: 'cobro_suscripcion_exitoso',
                    detalles: `reference=${reference}, monto=${pago.monto}`
                });
                await enviarCorreoSeguro({
                    to: tenant.email,
                    subject: 'Recibo de pago - GastroFlow',
                    html: `<div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;">
                        <h2>Pago recibido</h2>
                        <p>Cobramos exitosamente $${Number(pago.monto).toLocaleString('es-CO')} COP de tu suscripción a GastroFlow.</p>
                    </div>`
                });
            }
            return;
        }

        // Fallido
        const intentos = (tenant.intentos_fallidos_pago || 0) + 1;
        await db.query('UPDATE tenants SET intentos_fallidos_pago = ? WHERE id = ?', [intentos, tenant.id]);
        CacheService.delete(`tenant:${tenant.id}`);

        if (intentos >= MAX_INTENTOS) {
            await db.query('UPDATE tenants SET suspendido_por_pago = 1 WHERE id = ?', [tenant.id]);
            await TenantService.changeTenantStatus(tenant.id, false);
            await TenantAuditService.log({
                tenantId: tenant.id,
                userId,
                accion: 'suscripcion_suspendida_por_pago',
                detalles: `reference=${reference}, intentos=${intentos}`
            });
            await enviarCorreoSeguro({
                to: tenant.email,
                subject: 'Tu restaurante fue suspendido por falta de pago - GastroFlow',
                html: `<div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;">
                    <h2>Suscripción suspendida</h2>
                    <p>No pudimos cobrar tu suscripción a GastroFlow después de ${MAX_INTENTOS} intentos.
                    Tu restaurante quedó suspendido. Actualiza tu método de pago para reactivarlo de inmediato.</p>
                </div>`
            });
        } else {
            await TenantAuditService.log({
                tenantId: tenant.id,
                userId,
                accion: 'cobro_suscripcion_fallido',
                detalles: `reference=${reference}, intentos=${intentos}`
            });
            await enviarCorreoSeguro({
                to: tenant.email,
                subject: 'No pudimos cobrar tu suscripción - GastroFlow',
                html: `<div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;">
                    <h2>Pago fallido</h2>
                    <p>Intentaremos cobrar de nuevo en las próximas horas. Si el problema persiste,
                    actualiza tu método de pago desde tu panel de GastroFlow (intento ${intentos} de ${MAX_INTENTOS}).</p>
                </div>`
            });
        }
    }
}

module.exports = SuscripcionService;
