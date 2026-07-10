/**
 * FacturaRepository - Data access layer for invoices
 * Handles all SQL queries related to invoices and invoice details
 * Related to: routes/facturas.js, services/FacturaService.js
 */

const db = require('../../config/database');
const { toFechaISOUtc } = require('../../utils/dateHelpers');
const TaxService = require('../../services/Shared/TaxService');

class FacturaRepository {
    /**
     * Si hay facturas sin numerar (numero NULL) o con numeración que no empieza en 1 por tenant
     * (p. ej. migración que puso numero = id), las acomoda a 1, 2, 3... por tenant (orden por id).
     * Usa la misma connection (dentro de transacción).
     * @param {import('mysql2/promise').PoolConnection} connection
     * @param {number} tenantId - Tenant actual (para acomodar solo su secuencia si hace falta)
     */
    static async acomodarNumeracionSiFalta(connection, tenantId) {
        const tieneColumnaNumero = true;
        try {
            const [rows] = await connection.query('SELECT COUNT(*) AS total FROM facturas WHERE numero IS NULL');
            const total = (rows && rows[0] && rows[0].total) || 0;
            if (total > 0) {
                const [tenants] = await connection.query(
                    'SELECT DISTINCT tenant_id FROM facturas ORDER BY tenant_id ASC'
                );
                for (const { tenant_id } of tenants) {
                    const [facturas] = await connection.query(
                        'SELECT id FROM facturas WHERE tenant_id <=> ? ORDER BY id ASC',
                        [tenant_id]
                    );
                    let n = 1;
                    for (const f of facturas || []) {
                        await connection.query('UPDATE facturas SET numero = ? WHERE id = ?', [n, f.id]);
                        n++;
                    }
                }
                return;
            }
        } catch (err) {
            if (err.code === 'ER_BAD_FIELD_ERROR' || (err.message && err.message.includes('numero'))) {
                return;
            }
            throw err;
        }

        try {
            const [minRows] = await connection.query(
                'SELECT MIN(numero) AS min_num FROM facturas WHERE tenant_id = ?',
                [tenantId]
            );
            const minNum =
                minRows && minRows[0] && minRows[0].min_num !== null && minRows[0].min_num !== undefined
                    ? Number(minRows[0].min_num)
                    : null;
            if (minNum === null || minNum === 1) {
                return;
            }

            const [facturas] = await connection.query('SELECT id FROM facturas WHERE tenant_id = ? ORDER BY id ASC', [
                tenantId
            ]);
            let n = 1;
            for (const f of facturas || []) {
                await connection.query('UPDATE facturas SET numero = ? WHERE id = ?', [n, f.id]);
                n++;
            }
        } catch (err) {
            if (err.code === 'ER_BAD_FIELD_ERROR' || (err.message && err.message.includes('numero'))) {
                return;
            }
            throw err;
        }
    }

    /**
     * Create invoice with details (transactional)
     * @param {Object} facturaData - Invoice data
     * @param {number} facturaData.cliente_id - Client ID
     * @param {number} facturaData.total - Total amount
     * @param {string} facturaData.forma_pago - Payment method
     * @param {Array<Object>} facturaData.productos - Array of products
     * @returns {Promise<Object>} Created invoice with insertId
     */
    static async createWithDetails(tenantId, facturaData) {
        const connection = await db.getConnection();
        try {
            await connection.beginTransaction();

            await FacturaRepository.acomodarNumeracionSiFalta(connection, tenantId);

            const evento_id = facturaData.evento_id || null;
            const [rowsNum] = await connection.query(
                'SELECT COALESCE(MAX(numero), 0) + 1 AS siguiente FROM facturas WHERE tenant_id = ?',
                [tenantId]
            );
            const numero = (rowsNum && rowsNum[0] && rowsNum[0].siguiente) || 1;
            const fechaEmisionUtc = new Date().toISOString().slice(0, 19).replace('T', ' ');

            // Buscar sesión de caja abierta para vincular la venta
            const [sesiones] = await connection.query(
                'SELECT id FROM caja_sesiones WHERE tenant_id = ? AND estado = "abierta" LIMIT 1',
                [tenantId]
            );
            const cajaSesionId = sesiones.length > 0 ? sesiones[0].id : null;

            const [result] = await connection.query(
                'INSERT INTO facturas (tenant_id, numero, cliente_id, total, forma_pago, evento_id, fecha, caja_sesion_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                [
                    tenantId,
                    numero,
                    facturaData.cliente_id,
                    facturaData.total,
                    facturaData.forma_pago,
                    evento_id,
                    fechaEmisionUtc,
                    cajaSesionId
                ]
            );

            const factura_id = result.insertId;

            // Desglose de impuestos por línea (Fase 1 - Factus): precios de catálogo
            // se tratan como "impuesto incluido", el desglose se calcula hacia atrás.
            const productoIds = facturaData.productos
                .filter(p => !p.es_servicio && p.producto_id)
                .map(p => p.producto_id);
            const { tasas, defaultTasa } = await TaxService.getTasasPorProducto(tenantId, productoIds, connection);

            let subtotalFactura = 0;
            let impuestosFactura = 0;
            let descuentoFactura = 0;

            // Insert invoice details (incl. descuento_porcentaje y precio_original para mostrar en factura impresa)
            const detallesValues = facturaData.productos.map(p => {
                const tasa = p.es_servicio ? defaultTasa : (tasas.get(p.producto_id) ?? defaultTasa);
                const { base_gravable, valor_impuesto } = TaxService.desglosarLinea(p.subtotal, tasa);
                subtotalFactura += base_gravable;
                impuestosFactura += valor_impuesto;
                const precioOriginal = p.precio_original || p.precio;
                if (precioOriginal > p.precio) {
                    descuentoFactura += Math.round((precioOriginal - p.precio) * p.cantidad * 100) / 100;
                }

                return [
                    factura_id,
                    p.producto_id || null,
                    p.servicio_id || null,
                    p.es_servicio ? 1 : 0,
                    p.cantidad,
                    p.precio,
                    precioOriginal, // Guardar precio original (catálogo)
                    p.unidad || (p.es_servicio ? 'SERV' : 'UND'),
                    p.subtotal,
                    p.descuento_porcentaje !== null &&
                    p.descuento_porcentaje !== undefined &&
                    p.descuento_porcentaje > 0
                        ? p.descuento_porcentaje
                        : null,
                    base_gravable,
                    tasa,
                    valor_impuesto
                ];
            });

            await connection.query(
                'INSERT INTO detalle_factura (factura_id, producto_id, servicio_id, es_servicio, cantidad, precio_unitario, precio_original, unidad_medida, subtotal, descuento_porcentaje, base_gravable, tasa_impuesto, valor_impuesto) VALUES ?',
                [detallesValues]
            );

            await connection.query(
                'UPDATE facturas SET subtotal = ?, descuento = ?, total_impuestos = ? WHERE id = ?',
                [
                    Math.round(subtotalFactura * 100) / 100,
                    Math.round(descuentoFactura * 100) / 100,
                    Math.round(impuestosFactura * 100) / 100,
                    factura_id
                ]
            );

            await connection.commit();
            connection.release();

            return { insertId: factura_id, numero };
        } catch (error) {
            await connection.rollback();
            connection.release();
            throw error;
        }
    }

    /**
     * Find invoice by ID with client data
     * @param {number} id - Invoice ID
     * @returns {Promise<Object|null>} Invoice object or null
     */
    static async findByIdWithClient(id, tenantId) {
        const [facturas] = await db.query(
            `
            SELECT f.id, f.tenant_id, f.numero, f.cliente_id, f.total, f.forma_pago, f.propina, f.evento_id,
                   f.subtotal, f.descuento, f.total_impuestos,
                   DATE_FORMAT(f.fecha, '%Y-%m-%d %H:%i:%s') AS fecha,
                   c.nombre AS cliente_nombre, c.direccion, c.telefono,
                   e.nombre AS evento_nombre
            FROM facturas f
            JOIN clientes c ON f.cliente_id = c.id
            LEFT JOIN eventos e ON f.evento_id = e.id
            WHERE f.id = ? AND f.tenant_id = ?
        `,
            [id, tenantId]
        );
        return facturas[0] || null;
    }

    /**
     * Get invoice details by invoice ID
     * @param {number} facturaId - Invoice ID
     * @returns {Promise<Array>} Array of invoice details
     */
    static async getDetailsByFacturaId(facturaId) {
        const [detalles] = await db.query(
            `
            SELECT d.*, 
                   COALESCE(p.nombre, s.nombre) as producto_nombre
            FROM detalle_factura d
            LEFT JOIN productos p ON d.producto_id = p.id
            LEFT JOIN servicios s ON d.servicio_id = s.id
            WHERE d.factura_id = ?
        `,
            [facturaId]
        );
        return detalles;
    }

    /**
     * Get invoice details for API response
     * @param {number} id - Invoice ID
     * @returns {Promise<Object>} Invoice details object
     */
    static async getDetailsForAPI(id, tenantId) {
        const [facturas] = await db.query(
            `
            SELECT f.id, f.tenant_id, f.numero, f.cliente_id, f.total, f.forma_pago, f.propina, f.evento_id,
                   f.subtotal, f.descuento, f.total_impuestos,
                   DATE_FORMAT(f.fecha, '%Y-%m-%d %H:%i:%s') AS fecha,
                   c.nombre AS cliente_nombre, c.direccion, c.telefono
            FROM facturas f
            JOIN clientes c ON f.cliente_id = c.id
            WHERE f.id = ? AND f.tenant_id = ?
        `,
            [id, tenantId]
        );

        if (facturas.length === 0) {
            return null;
        }

        const factura = facturas[0];
        const [productos] = await db.query(
            `
            SELECT d.cantidad, d.precio_unitario, d.unidad_medida, d.subtotal,
                   d.base_gravable, d.tasa_impuesto, d.valor_impuesto,
                   COALESCE(p.nombre, s.nombre) as nombre,
                   d.es_servicio
            FROM detalle_factura d
            LEFT JOIN productos p ON d.producto_id = p.id
            LEFT JOIN servicios s ON d.servicio_id = s.id
            WHERE d.factura_id = ?
        `,
            [id]
        );

        return {
            factura: {
                id: factura.id,
                numero: factura.numero !== null && factura.numero !== undefined ? factura.numero : factura.id,
                fecha: factura.fecha,
                fechaISO: toFechaISOUtc(factura.fecha),
                total: parseFloat(factura.total || 0),
                subtotal: parseFloat(factura.subtotal || 0),
                descuento: parseFloat(factura.descuento || 0),
                total_impuestos: parseFloat(factura.total_impuestos || 0),
                forma_pago: factura.forma_pago,
                propina: parseFloat(factura.propina || 0)
            },
            cliente: {
                nombre: factura.cliente_nombre || '',
                direccion: factura.direccion || '',
                telefono: factura.telefono || ''
            },
            productos: productos.map(p => ({
                nombre: p.nombre || '',
                cantidad: parseFloat(p.cantidad || 0),
                unidad: p.unidad_medida || (p.es_servicio ? 'SVG' : ''),
                precio: parseFloat(p.precio_unitario || 0),
                subtotal: parseFloat(p.subtotal || 0),
                base_gravable: parseFloat(p.base_gravable || 0),
                tasa_impuesto: parseFloat(p.tasa_impuesto || 0),
                valor_impuesto: parseFloat(p.valor_impuesto || 0),
                es_servicio: !!p.es_servicio
            }))
        };
    }

    /**
     * Delete invoice and its details by id (used by superadmin only).
     * @param {number} facturaId - Invoice ID
     * @returns {Promise<{ deleted: boolean }>}
     */
    static async deleteById(facturaId) {
        const connection = await db.getConnection();
        try {
            await connection.query('DELETE FROM detalle_factura WHERE factura_id = ?', [facturaId]);
            const [result] = await connection.query('DELETE FROM facturas WHERE id = ?', [facturaId]);
            return { deleted: result.affectedRows > 0 };
        } finally {
            connection.release();
        }
    }
}

module.exports = FacturaRepository;
