class CacheService {
    constructor() {
        this.cache = new Map();
        this.enVuelo = new Map();
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
        return item.value;
    }

    /**
     * Almacena un elemento en la caché con un tiempo de vida (TTL).
     * @param {string} key - Clave del elemento
     * @param {any} value - Valor a almacenar
     * @param {number} ttlSeconds - Tiempo de vida en segundos (por defecto 300 segundos = 5 minutos)
     */
    set(key, value, ttlSeconds = 300) {
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
