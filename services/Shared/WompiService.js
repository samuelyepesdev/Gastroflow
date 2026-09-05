/**
 * WompiService - Cliente HTTP puro hacia la API de Wompi (pasarela de pagos
 * usada para el cobro recurrente de la suscripción de cada tenant). Sin
 * lógica de negocio: eso vive en services/Admin/SuscripcionService.js.
 *
 * Requiere WOMPI_PRIVATE_KEY / WOMPI_EVENTS_SECRET en el .env (patrón
 * opcional-con-fallback, igual que SENTRY_DSN / GA_MEASUREMENT_ID: si faltan,
 * los métodos que las necesitan lanzan un error claro en vez de fallar
 * silenciosamente, pero el arranque del servidor no se bloquea).
 *
 * IMPORTANTE: los nombres exactos de campo de /payment_sources y /tokens/cards
 * deben confirmarse contra el dashboard/Postman de Wompi antes de ir a
 * producción -- no se pudieron verificar en vivo contra la documentación al
 * escribir este archivo. El algoritmo de firma de webhooks (verificarFirmaWebhook)
 * sí está confirmado contra la documentación oficial de Wompi.
 */
const crypto = require('crypto');

const BASE_URLS = {
    sandbox: 'https://sandbox.wompi.co/v1',
    production: 'https://production.wompi.co/v1'
};

function getBaseUrl() {
    const env = process.env.WOMPI_ENV === 'production' ? 'production' : 'sandbox';
    return BASE_URLS[env];
}

/**
 * URL base de la API de Wompi que el frontend necesita para tokenizar la
 * tarjeta (GET /merchants/{public_key} para el acceptance_token y
 * POST /tokens/cards, ambas operaciones de llave pública). Se expone a la
 * vista para no hardcodear el host en el JS del navegador.
 */
function getPublicApiBaseUrl() {
    return getBaseUrl();
}

async function request(path, { method = 'GET', body, useBearer = true } = {}) {
    const privateKey = process.env.WOMPI_PRIVATE_KEY;
    if (!privateKey) {
        throw new Error('WOMPI_PRIVATE_KEY no configurada');
    }
    const res = await fetch(`${getBaseUrl()}${path}`, {
        method,
        headers: {
            'Content-Type': 'application/json',
            ...(useBearer ? { Authorization: `Bearer ${privateKey}` } : {})
        },
        body: body ? JSON.stringify(body) : undefined
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        const msg = data?.error?.reason || data?.error?.messages || res.statusText;
        const err = new Error(`Wompi respondió ${res.status}: ${JSON.stringify(msg)}`);
        err.status = res.status;
        err.data = data;
        throw err;
    }
    return data;
}

class WompiService {
    /** URL base de la API de Wompi (sandbox/production) para el frontend. */
    static apiBaseUrl() {
        return getPublicApiBaseUrl();
    }

    /**
     * Crea una fuente de pago reutilizable (tarjeta tokenizada) a partir de un
     * token de tarjeta ya generado en el frontend con Wompi
     * (WOMPI_PUBLIC_KEY, nunca toca este backend con datos de tarjeta cruda).
     *
     * Wompi exige los DOS tokens de aceptación (política de privacidad +
     * autorización de datos personales), ambos vienen de
     * GET /v1/merchants/{public_key} -> presigned_acceptance /
     * presigned_personal_data_auth.
     * @returns {Promise<string|number>} payment_source_id
     */
    static async crearFuenteDePago({ token, customerEmail, acceptanceToken, personalAuthToken }) {
        const data = await request('/payment_sources', {
            method: 'POST',
            body: {
                type: 'CARD',
                token,
                customer_email: customerEmail,
                acceptance_token: acceptanceToken,
                accept_personal_auth: personalAuthToken
            }
        });
        const id = data?.data?.id;
        if (!id) {
            throw new Error('Wompi no retornó un payment_source_id válido');
        }
        return id;
    }

    /**
     * Cobra una fuente de pago ya guardada, sin interacción del cliente
     * (cobro recurrente). El resultado inmediato puede ser PENDING -- el
     * estado final llega por webhook (o por reconciliación de respaldo).
     *
     * Wompi exige la firma de integridad en TODA creación de transacción
     * (no solo en el widget). `recurrent: true` activa COF (Credential On
     * File) para Visa/Mastercard, requerido para cobros recurrentes.
     * `sessionId`/`deviceId` (huella de dispositivo de WompiJs) son
     * opcionales: mejoran el scoring antifraude cuando el cobro se dispara
     * desde el navegador; el cron los omite.
     * @returns {Promise<{ id: string, status: string }>}
     */
    static async cobrar({ paymentSourceId, amountInCents, customerEmail, reference, sessionId, deviceId }) {
        const body = {
            amount_in_cents: amountInCents,
            currency: 'COP',
            signature: WompiService.firmarIntegridad({ reference, amountInCents, currency: 'COP' }),
            customer_email: customerEmail,
            payment_source_id: paymentSourceId,
            reference,
            recurrent: true
        };
        if (sessionId) {
            body.session_id = sessionId;
        }
        if (deviceId) {
            body.customer_data = { device_id: deviceId };
        }
        const data = await request('/transactions', { method: 'POST', body });
        return { id: data?.data?.id, status: data?.data?.status };
    }

    /** Consulta el estado actual de una transacción (usado en la reconciliación de respaldo). */
    static async consultarTransaccion(transactionId) {
        const data = await request(`/transactions/${transactionId}`, { useBearer: false });
        return { id: data?.data?.id, status: data?.data?.status };
    }

    /**
     * Firma de integridad de Wompi, obligatoria en toda creación de
     * transacción (POST /transactions). Fórmula (Wompi):
     * SHA256(reference + amountInCents + currency + Integrity Secret).
     * Requiere WOMPI_INTEGRITY_SECRET. El secreto nunca sale del backend.
     */
    static firmarIntegridad({ reference, amountInCents, currency = 'COP' }) {
        const integritySecret = process.env.WOMPI_INTEGRITY_SECRET;
        if (!integritySecret) {
            throw new Error('WOMPI_INTEGRITY_SECRET no configurada');
        }
        const toHash = `${reference}${amountInCents}${currency}${integritySecret}`;
        return crypto.createHash('sha256').update(toHash).digest('hex');
    }

    /**
     * Verifica la firma de un evento de webhook de Wompi.
     * Algoritmo (confirmado contra la documentación oficial de Wompi):
     * SHA256( valores de las propiedades listadas en signature.properties
     *         (extraídas de `data`, en ese orden) + timestamp + Event Secret )
     * comparado contra signature.checksum.
     */
    static verificarFirmaWebhook(payload) {
        const eventsSecret = process.env.WOMPI_EVENTS_SECRET;
        if (!eventsSecret) {
            throw new Error('WOMPI_EVENTS_SECRET no configurada');
        }
        const { signature, timestamp, data } = payload || {};
        if (!signature?.properties || !signature?.checksum || !timestamp || !data) {
            return false;
        }
        const concatenated = signature.properties
            .map(propPath => {
                const value = propPath
                    .split('.')
                    .reduce((obj, key) => (obj === null || obj === undefined ? obj : obj[key]), data);
                return value === undefined || value === null ? '' : String(value);
            })
            .join('');
        const toHash = `${concatenated}${timestamp}${eventsSecret}`;
        const computed = crypto.createHash('sha256').update(toHash).digest('hex');
        return computed === signature.checksum;
    }
}

module.exports = WompiService;
