/**
 * PermisosCatalogoService - Lleva a la BD el catálogo de permisos (utils/permisosCatalogo.js).
 *
 * Se ejecuta al arrancar (scripts/sincronizar-permisos.js) y es idempotente:
 * - Crea los permisos que faltan y, SOLO a esos, los asigna a sus roles por defecto. Un permiso que ya
 *   existía nunca recibe roles: si alguien se los quitó a mano a un rol, no se los devolvemos.
 * - Actualiza la descripción de los existentes para que el catálogo sea la única fuente.
 * - No borra nada: los permisos de la BD que el catálogo no conoce se devuelven como `huerfanos`
 *   para revisarlos (pueden venir de una migración antigua).
 */
const db = require('../../config/database');
const { PERMISOS_CATALOGO } = require('../../utils/permisosCatalogo');

class PermisosCatalogoService {
    /**
     * @param {{dryRun?: boolean, catalogo?: Array}} [opciones]
     * @returns {Promise<{creados: string[], descripcionesActualizadas: string[], huerfanos: string[], rolesInexistentes: string[]}>}
     */
    static async sincronizar({ dryRun = false, catalogo = PERMISOS_CATALOGO } = {}) {
        const [existentes] = await db.query('SELECT id, nombre, descripcion FROM permisos');
        const porNombre = new Map(existentes.map(p => [p.nombre, p]));
        const [roles] = await db.query('SELECT id, nombre FROM roles');
        const rolId = new Map(roles.map(r => [r.nombre, r.id]));

        const creados = [];
        const descripcionesActualizadas = [];
        const rolesInexistentes = new Set();

        for (const permiso of catalogo) {
            const actual = porNombre.get(permiso.nombre);
            if (actual) {
                if (actual.descripcion !== permiso.descripcion) {
                    descripcionesActualizadas.push(permiso.nombre);
                    if (!dryRun) {
                        await db.query('UPDATE permisos SET descripcion = ? WHERE id = ?', [
                            permiso.descripcion,
                            actual.id
                        ]);
                    }
                }
                continue;
            }

            creados.push(permiso.nombre);
            if (dryRun) {
                continue;
            }
            // INSERT IGNORE: si otra instancia lo creó a la vez, affectedRows = 0 y ella se encarga de los roles
            const [resultado] = await db.query('INSERT IGNORE INTO permisos (nombre, descripcion) VALUES (?, ?)', [
                permiso.nombre,
                permiso.descripcion
            ]);
            if (!resultado.affectedRows) {
                continue;
            }
            for (const nombreRol of permiso.roles) {
                if (!rolId.has(nombreRol)) {
                    rolesInexistentes.add(nombreRol);
                    continue;
                }
                await db.query('INSERT IGNORE INTO rol_permisos (rol_id, permiso_id) VALUES (?, ?)', [
                    rolId.get(nombreRol),
                    resultado.insertId
                ]);
            }
        }

        const enCatalogo = new Set(catalogo.map(p => p.nombre));
        const huerfanos = existentes.filter(p => !enCatalogo.has(p.nombre)).map(p => p.nombre);
        return { creados, descripcionesActualizadas, huerfanos, rolesInexistentes: [...rolesInexistentes] };
    }
}

module.exports = PermisosCatalogoService;
