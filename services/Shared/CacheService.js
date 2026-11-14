// Tope de entradas: sin él, claves dinámicas (por IP, por filtro JSON, por Idempotency-Key...) hacen crecer
// el Map sin límite y un pico de tráfico puede agotar el heap de Node. Sobrescribible con CACHE_MAX_ENTRIES.
const MAX_ENTRADAS_POR_DEFECTO = 5000;
// Las entradas vencidas solo se borraban al volver a leerlas: las que nadie volvía a pedir quedaban para
// siempre. Un barrido periódico las elimina.
const INTERVALO_BARRIDO_MS = 5 * 60 * 1000;

class CacheService {
    /**
     * @param {{maxEntradas?: number, intervaloBarridoMs?: number}} [opciones]
     */
    constructor({ maxEntradas, intervaloBarridoMs = INTERVALO_BARRIDO_MS } = {}) {
        // Map conserva el orden de inserción: la primera clave es la usada hace más tiempo (LRU)
        this.cache = new Map();
        this.enVuelo = new Map();
        const deEntorno = Number.parseInt(process.env.CACHE_MAX_ENTRIES, 10);
        this.maxEntradas = maxEntradas || (deEntorno > 0 ? deEntorno : MAX_ENTRADAS_POR_DEFECTO);

        if (intervaloBarridoMs > 0) {
            // unref: el barrido no debe impedir que el proceso (o los tests) terminen
            this._barrido = setInterval(() => this.barrerExpiradas(), intervaloBarridoMs);
            if (typeof this._barrido.unref === 'function') {
                this._barrido.unref();
            }
        }
    }

    /** Elimina todas las entradas vencidas. @returns {number} cuántas eliminó */
    barrerExpiradas() {
        const ahora = Date.now();
        let eliminadas = 0;
        for (const [key, item] of this.cache) {
            if (ahora > item.expiresAt) {
                this.cache.delete(key);
                eliminadas += 1;
            }
        }
        return eliminadas;
    }

    get size() {
        return this.cache.size;
    }

    /**
     * Obtiene un elemento de la caché. Si expiró, lo elimina y retorna null.
     * @param {string} key - Clave del elemento
     * @returns {any|null} Valor cacheado o null si no existe o expiró
     */
    get(key) {
        const item = this.cache.get(key);
        if (!item) {
            return null;
        }

        if (Date.now() > item.expiresAt) {
            this.cache.delete(key);
            return null;
        }
        // Acceso reciente: pasa al final del orden de desalojo (LRU)
        this.cache.delete(key);
        this.cache.set(key, item);
        return item.value;
    }

    /**
     * Almacena un elemento en la caché con un tiempo de vida (TTL).
     * @param {string} key - Clave del elemento
     * @param {any} value - Valor a almacenar
     * @param {number} ttlSeconds - Tiempo de vida en segundos (por defecto 300 segundos = 5 minutos)
     */
    set(key, value, ttlSeconds = 300) {
        // Reescribir una clave existente la mueve al final (más reciente) y no consume una entrada nueva
        this.cache.delete(key);
        if (this.cache.size >= this.maxEntradas) {
            // Primero lo ya vencido (gratis); si sigue lleno, se desaloja lo menos usado recientemente
            this.barrerExpiradas();
            while (this.cache.size >= this.maxEntradas) {
                this.cache.delete(this.cache.keys().next().value);
            }
        }
        this.cache.set(key, {
            value,
            expiresAt: Date.now() + ttlSeconds * 1000
        });
    }

    /**
     * Devuelve el valor cacheado o lo calcula UNA sola vez aunque lleguen muchas peticiones a la vez
     * (evita el "cache stampede": N peticiones simultáneas con la caché fría ejecutaban N veces
     * las mismas consultas pesadas). Si el cálculo falla no se cachea y el error llega a todos los que esperan.
     * @param {string} key
     * @param {number} ttlSeconds
     * @param {() => Promise<any>} producer
     */
    async remember(key, ttlSeconds, producer) {
        const hit = this.get(key);
        if (hit) {
            return hit;
        }
        if (this.enVuelo.has(key)) {
            return this.enVuelo.get(key);
        }
        const promesa = (async () => {
            try {
                const value = await producer();
                this.set(key, value, ttlSeconds);
                return value;
            } finally {
                this.enVuelo.delete(key);
            }
        })();
        this.enVuelo.set(key, promesa);
        return promesa;
    }

    /**
     * Elimina un elemento específico de la caché.
     * @param {string} key - Clave del elemento
     */
    delete(key) {
        this.cache.delete(key);
    }

    /**
     * Elimina elementos de la caché que coinciden con un prefijo.
     * @param {string} prefix - Prefijo de las claves a eliminar
     */
    deleteByPrefix(prefix) {
        for (const key of this.cache.keys()) {
            if (key.startsWith(prefix)) {
                this.cache.delete(key);
            }
        }
    }

    /**
     * Limpia por completo la caché.
     */
    clear() {
        this.cache.clear();
    }
}

module.exports = new CacheService();
module.exports.CacheService = CacheService; // para tests con otro tope
