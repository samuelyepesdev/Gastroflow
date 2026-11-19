/**
 * MenuPersonalService - "Personalizar menú": enlaces de la barra de navegación que un usuario decide ocultar.
 * Es una preferencia VISUAL por usuario; no toca permisos ni planes (ver utils/navbarCatalogo.js).
 */
const db = require('../../config/database');
const CacheService = require('./CacheService');
const { ValidationError } = require('../../utils/errors');
const { normalizarOcultos } = require('../../utils/navbarCatalogo');

class MenuPersonalService {
    static async getOcultos(userId) {
        const [rows] = await db.query('SELECT nav_oculto FROM usuarios WHERE id = ?', [userId]);
        return normalizarOcultos(rows[0]?.nav_oculto);
    }

    /**
     * Guarda la lista de enlaces ocultos (reemplaza la anterior). Las claves desconocidas se ignoran.
     * @returns {Promise<string[]>} lo que quedó guardado
     */
    static async guardar(userId, oculto) {
        if (!Array.isArray(oculto)) {
            throw new ValidationError('Indica la lista de enlaces a ocultar', 'MENU_LISTA_INVALIDA');
        }
        const claves = normalizarOcultos(oculto);
        await db.query('UPDATE usuarios SET nav_oculto = ? WHERE id = ?', [
            claves.length ? JSON.stringify(claves) : null,
            userId
        ]);
        // El contexto del usuario está cacheado (45 s): sin esto el cambio tardaría en verse.
        CacheService.delete(`user:ctx:${userId}`);
        return claves;
    }

    /** Vuelve a mostrar todo lo que el usuario puede ver. */
    static async restablecer(userId) {
        return MenuPersonalService.guardar(userId, []);
    }
}

module.exports = MenuPersonalService;
