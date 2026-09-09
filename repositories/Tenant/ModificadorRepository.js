/**
 * ModificadorRepository - Data access for modifier/topping groups and options
 * Related to: ModificadorService, routes/tenant/modificadores.js
 */

const db = require('../../config/database');

const GRUPO_COLUMNS =
    'g.id, g.tenant_id, g.nombre, g.descripcion, g.tipo_seleccion, g.obligatorio, g.descuenta_inventario, ' +
    'g.minimo_selecciones, g.maximo_selecciones, g.activo, g.created_at, g.updated_at';

class ModificadorRepository {
    static async findAllGrupos(tenantId, filters = {}) {
        let sql = `SELECT ${GRUPO_COLUMNS} FROM grupos_modificadores g WHERE g.tenant_id = ?`;
        const params = [tenantId];
        if (filters.activo !== undefined) {
            sql += ' AND g.activo = ?';
            params.push(filters.activo ? 1 : 0);
        }
        if (filters.q && filters.q.trim()) {
            sql += ' AND g.nombre LIKE ?';
            params.push('%' + filters.q.trim() + '%');
        }
        sql += ' ORDER BY g.nombre';
        const [rows] = await db.query(sql, params);
        return rows;
    }

    static async findGrupoById(id, tenantId) {
        const [rows] = await db.query(
            `SELECT ${GRUPO_COLUMNS} FROM grupos_modificadores g WHERE g.id = ? AND g.tenant_id = ?`,
            [id, tenantId]
        );
        return rows[0] || null;
    }

    static async createGrupo(tenantId, data) {
        const {
            nombre,
            descripcion,
            tipo_seleccion,
            obligatorio,
            descuenta_inventario,
            minimo_selecciones,
            maximo_selecciones
        } = data;
        const [result] = await db.query(
            `INSERT INTO grupos_modificadores
                (tenant_id, nombre, descripcion, tipo_seleccion, obligatorio, descuenta_inventario, minimo_selecciones, maximo_selecciones)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                tenantId,
                nombre,
                descripcion || null,
                tipo_seleccion,
                obligatorio ? 1 : 0,
                descuenta_inventario ? 1 : 0,
                minimo_selecciones || 0,
                maximo_selecciones ?? null
            ]
        );
        return result.insertId;
    }

    static async updateGrupo(id, tenantId, data) {
        const {
            nombre,
            descripcion,
            tipo_seleccion,
            obligatorio,
            descuenta_inventario,
            minimo_selecciones,
            maximo_selecciones,
            activo
        } = data;
        const [result] = await db.query(
            `UPDATE grupos_modificadores
             SET nombre = ?, descripcion = ?, tipo_seleccion = ?, obligatorio = ?, descuenta_inventario = ?,
                 minimo_selecciones = ?, maximo_selecciones = ?, activo = ?
             WHERE id = ? AND tenant_id = ?`,
            [
                nombre,
                descripcion || null,
                tipo_seleccion,
                obligatorio ? 1 : 0,
                descuenta_inventario ? 1 : 0,
                minimo_selecciones || 0,
                maximo_selecciones ?? null,
                activo === undefined ? 1 : activo ? 1 : 0,
                id,
                tenantId
            ]
        );
        return result;
    }

    static async deleteGrupo(id, tenantId) {
        const [result] = await db.query('DELETE FROM grupos_modificadores WHERE id = ? AND tenant_id = ?', [
            id,
            tenantId
        ]);
        return result;
    }

    static async getOpciones(grupoId) {
        const [rows] = await db.query(
            `SELECT o.*, i.nombre AS insumo_nombre
             FROM opciones_modificador o
             LEFT JOIN insumos i ON i.id = o.insumo_id
             WHERE o.grupo_id = ?
             ORDER BY o.orden, o.id`,
            [grupoId]
        );
        return rows;
    }

    /**
     * Reemplaza todas las opciones de un grupo (mismo patrón que RecetaRepository.setIngredientes).
     * Las opciones eliminadas sobreviven en el histórico de ventas vía snapshot
     * (detalle_factura_modificadores/pedido_item_modificadores usan ON DELETE SET NULL).
     */
    static async setOpciones(grupoId, tenantId, items) {
        const conn = await db.getConnection();
        try {
            await conn.query('DELETE FROM opciones_modificador WHERE grupo_id = ?', [grupoId]);
            if (items && items.length > 0) {
                for (let i = 0; i < items.length; i++) {
                    const it = items[i];
                    await conn.query(
                        `INSERT INTO opciones_modificador
                            (grupo_id, tenant_id, nombre, precio_adicional, insumo_id, cantidad_insumo, unidad_insumo, orden)
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                        [
                            grupoId,
                            tenantId,
                            it.nombre,
                            parseFloat(it.precio_adicional) || 0,
                            it.insumo_id || null,
                            it.cantidad_insumo ?? null,
                            it.unidad_insumo || null,
                            i
                        ]
                    );
                }
            }
        } finally {
            conn.release();
        }
    }

    static async findGruposByProductoId(productoId, tenantId) {
        const [grupos] = await db.query(
            `SELECT ${GRUPO_COLUMNS}, pmg.orden AS orden_en_producto
             FROM producto_modificador_grupo pmg
             INNER JOIN grupos_modificadores g ON g.id = pmg.grupo_id
             INNER JOIN productos p ON p.id = pmg.producto_id
             WHERE pmg.producto_id = ? AND p.tenant_id = ? AND g.activo = 1
             ORDER BY pmg.orden, g.nombre`,
            [productoId, tenantId]
        );
        if (grupos.length === 0) {
            return [];
        }
        const grupoIds = grupos.map(g => g.id);
        const [opciones] = await db.query(
            `SELECT * FROM opciones_modificador
             WHERE grupo_id IN (?) AND activo = 1
             ORDER BY orden, id`,
            [grupoIds]
        );
        return grupos.map(g => ({
            ...g,
            opciones: opciones.filter(o => o.grupo_id === g.id)
        }));
    }

    static async getGruposIdsDeProducto(productoId, tenantId) {
        const [rows] = await db.query(
            `SELECT pmg.grupo_id, pmg.orden
             FROM producto_modificador_grupo pmg
             INNER JOIN productos p ON p.id = pmg.producto_id
             WHERE pmg.producto_id = ? AND p.tenant_id = ?
             ORDER BY pmg.orden`,
            [productoId, tenantId]
        );
        return rows;
    }

    static async setGruposDeProducto(productoId, grupoIds) {
        const conn = await db.getConnection();
        try {
            await conn.query('DELETE FROM producto_modificador_grupo WHERE producto_id = ?', [productoId]);
            if (grupoIds && grupoIds.length > 0) {
                for (let i = 0; i < grupoIds.length; i++) {
                    await conn.query(
                        'INSERT INTO producto_modificador_grupo (producto_id, grupo_id, orden) VALUES (?, ?, ?)',
                        [productoId, grupoIds[i], i]
                    );
                }
            }
        } finally {
            conn.release();
        }
    }

    static async findOpcionesByIds(opcionIds, tenantId) {
        if (!opcionIds || opcionIds.length === 0) {
            return [];
        }
        const [rows] = await db.query(
            `SELECT o.*, g.nombre AS grupo_nombre, g.tipo_seleccion, g.obligatorio,
                    g.minimo_selecciones, g.maximo_selecciones, g.activo AS grupo_activo
             FROM opciones_modificador o
             INNER JOIN grupos_modificadores g ON g.id = o.grupo_id
             WHERE o.id IN (?) AND o.tenant_id = ?`,
            [opcionIds, tenantId]
        );
        return rows;
    }
}

module.exports = ModificadorRepository;
