/**
 * FactusClient - Cliente HTTP para la API de Factus (facturación electrónica DIAN).
 * OAuth2 password grant con cache de token por tenant, reintentos con backoff y
 * refresco automático ante 401. Ver docs: https://developers.factus.com.co/
 *
 * NOTA (riesgo de Fase 0 del plan): las rutas y nombres de campo exactos deben
 * confirmarse contra el sandbox real de Factus antes de emitir en producción.
 */

const logger = require('../../../utils/logger');

const BASE_URLS = {
    sandbox: 'https://api-sandbox.factus.com.co',
    produccion: 'https://api.factus.com.co'
};

const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 500;

// Cache de tokens por tenant, en memoria del proceso.
const tokenCache = new Map();

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

class FactusClient {
    /**
     * @param {Object} config
     * @param {number} config.tenantId
     * @param {'sandbox'|'produccion'} config.ambiente
     * @param {string} config.clientId
     * @param {string} config.clientSecret
     * @param {string} config.apiUsuario
     * @param {string} config.apiPassword
     */
    constructor(config) {
        this.tenantId = config.tenantId;
        this.ambiente = config.ambiente === 'produccion' ? 'produccion' : 'sandbox';
        this.clientId = config.clientId;
        this.clientSecret = config.clientSecret;
        this.apiUsuario = config.apiUsuario;
        this.apiPassword = config.apiPassword;
        this.baseUrl = BASE_URLS[this.ambiente];
    }

    _cacheKey() {
        return `${this.tenantId}:${this.ambiente}`;
    }

    /**
     * Obtiene un access token válido, usando cache si no ha expirado.
     * @param {boolean} forceRefresh
     * @returns {Promise<string>}
     */
    async getToken(forceRefresh = false) {
        const key = this._cacheKey();
        const cached = tokenCache.get(key);
        if (!forceRefresh && cached && cached.expiresAt > Date.now() + 5000) {
            return cached.accessToken;
        }

        if (!this.clientId || !this.clientSecret || !this.apiUsuario || !this.apiPassword) {
            throw new Error('Credenciales de Factus incompletas para este tenant');
        }

        const body = new URLSearchParams({
            grant_type: 'password',
            client_id: this.clientId,
            client_secret: this.clientSecret,
            username: this.apiUsuario,
            password: this.apiPassword
        });

        const res = await fetch(`${this.baseUrl}/oauth/token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
            body: body.toString()
        });

        if (!res.ok) {
            const text = await res.text().catch(() => '');
            logger.error('FactusClient: fallo al obtener token', { tenantId: this.tenantId, status: res.status });
            throw new Error(`No se pudo autenticar con Factus (HTTP ${res.status}): ${text}`);
        }

        const data = await res.json();
        const expiresInSec = Number(data.expires_in) || 3600;
        tokenCache.set(key, {
            accessToken: data.access_token,
            expiresAt: Date.now() + expiresInSec * 1000
        });
        return data.access_token;
    }

    /**
     * Petición autenticada a la API de Factus, con reintento en 401 (token vencido)
     * y backoff exponencial en errores de red / 5xx.
     * @param {string} method
     * @param {string} path - Debe empezar con '/'
     * @param {Object} [payload]
     * @returns {Promise<Object>}
     */
    async request(method, path, payload = null) {
        let lastError;
        for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
            try {
                const token = await this.getToken(attempt > 0 && lastError?.status === 401);
                const res = await fetch(`${this.baseUrl}${path}`, {
                    method,
                    headers: {
                        Authorization: `Bearer ${token}`,
                        'Content-Type': 'application/json',
                        Accept: 'application/json'
                    },
                    body: payload ? JSON.stringify(payload) : undefined
                });

                if (res.status === 401 && attempt < MAX_RETRIES) {
                    lastError = { status: 401 };
                    continue;
                }

                const text = await res.text();
                const data = text ? JSON.parse(text) : {};

                if (!res.ok) {
                    const err = new Error(data.message || `Error Factus HTTP ${res.status}`);
                    err.status = res.status;
                    err.body = data;
                    throw err;
                }

                return data;
            } catch (err) {
                lastError = err;
                const isNetworkOrServerError = !err.status || err.status >= 500;
                if (isNetworkOrServerError && attempt < MAX_RETRIES) {
                    const delay = RETRY_BASE_DELAY_MS * 2 ** attempt;
                    logger.warn('FactusClient: reintentando tras error', {
                        tenantId: this.tenantId,
                        attempt,
                        error: err.message
                    });
                    await sleep(delay);
                    continue;
                }
                logger.error('FactusClient: error en request', {
                    tenantId: this.tenantId,
                    method,
                    path,
                    error: err.message
                });
                throw err;
            }
        }
        throw lastError;
    }

    /**
     * Valida las credenciales configuradas obteniendo un token nuevo.
     * @returns {Promise<{ok: boolean}>}
     */
    async testConnection() {
        await this.getToken(true);
        return { ok: true };
    }

    /**
     * Rangos de numeración disponibles para el emisor autenticado.
     * @returns {Promise<Array>}
     */
    async getNumberingRanges() {
        const data = await this.request('GET', '/v1/numbering-ranges');
        return data.data || data;
    }
}

module.exports = FactusClient;
