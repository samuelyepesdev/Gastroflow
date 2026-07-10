/**
 * FacturaElectronicaRepository - Data access layer for the `facturas_electronicas`
 * emission queue/result table. Related to: services/Tenant/FacturacionElectronicaService.js
 */

const db = require('../../config/database');

class FacturaElectronicaRepository {
    /**
     * Encola una factura para emisión (idempotente: si ya existe, no hace nada).
     * @param {number} facturaId
     * @param {number} tenantId
     */
    static async encolar(facturaId, tenantId) {
        await db.query(
            `INSERT IGNORE INTO facturas_electronicas (factura_id, tenant_id, estado) VALUES (?, ?, 'pendiente')`,
            [facturaId, tenantId]
        );
    }

    /**
     * @param {number} facturaId
     * @param {number} tenantId
     * @returns {Promise<Object|null>}
     */
    static async findByFacturaId(facturaId, tenantId) {
        const [rows] = await db.query('SELECT * FROM facturas_electronicas WHERE factura_id = ? AND tenant_id = ?', [
            facturaId,
            tenantId
        ]);
        return rows[0] || null;
    }

    /**
     * Filas pendientes de emisión listas para reintentar (respeta backoff).
     * @param {number} limit
     * @returns {Promise<Array>}
     */
    static async findPendientes(limit = 20) {
        const [rows] = await db.query(
            `SELECT * FROM facturas_electronicas
             WHERE estado = 'pendiente' AND (proximo_intento IS NULL OR proximo_intento <= NOW())
             ORDER BY created_at ASC
             LIMIT ?`,
            [limit]
        );
        return rows;
    }

    /**
     * @param {number} id
     * @param {Object} data - { numero_fe, cufe, qr_data, xml_blob, pdf_blob }
     */
    static async marcarEmitida(id, data) {
        await db.query(
            `UPDATE facturas_electronicas
             SET estado = 'emitida', numero_fe = ?, cufe = ?, qr_data = ?, xml_blob = ?, pdf_blob = ?, errores = NULL
             WHERE id = ?`,
            [
                data.numero_fe || null,
                data.cufe || null,
                data.qr_data || null,
                data.xml_blob || null,
                data.pdf_blob || null,
                id
            ]
        );
    }

    /**
     * Registra un fallo de emisión. Aplica backoff exponencial (2^intentos minutos, tope 60 min).
     * Tras MAX_INTENTOS pasa a estado 'error' definitivo (requiere reintento manual).
     * @param {number} id
     * @param {string} mensaje
     * @param {number} intentosPrevios
     */
    static async registrarFallo(id, mensaje, intentosPrevios) {
        const MAX_INTENTOS = 5;
        const intentos = intentosPrevios + 1;
        const esDefinitivo = intentos >= MAX_INTENTOS;
        const backoffMin = Math.min(60, 2 ** intentos);

        await db.query(
            `UPDATE facturas_electronicas
             SET estado = ?, errores = ?, intentos = ?,
                 proximo_intento = ${esDefinitivo ? 'NULL' : 'DATE_ADD(NOW(), INTERVAL ? MINUTE)'}
             WHERE id = ?`,
            esDefinitivo
                ? [esDefinitivo ? 'error' : 'pendiente', mensaje, intentos, id]
                : ['pendiente', mensaje, intentos, backoffMin, id]
        );
    }

    /**
     * Datos completos de la factura interna necesarios para armar el payload de Factus:
     * cabecera + cliente (con documento fiscal) + emisor (tenant) + líneas con desglose.
     * @param {number} facturaId
     * @param {number} tenantId
     * @returns {Promise<Object|null>}
     */
    static async getFacturaCompletaParaEmision(facturaId, tenantId) {
        const [facturas] = await db.query(
            `SELECT f.id, f.numero, f.total, f.subtotal, f.descuento, f.total_impuestos, f.propina, f.forma_pago,
                    DATE_FORMAT(f.fecha, '%Y-%m-%d %H:%i:%s') AS fecha,
                    c.nombre AS cliente_nombre, c.tipo_documento, c.numero_documento, c.email AS cliente_email,
                    c.direccion AS cliente_direccion, c.telefono AS cliente_telefono,
                    t.nombre AS tenant_nombre, t.nit, t.direccion AS tenant_direccion, t.ciudad, t.regimen_fiscal
             FROM facturas f
             JOIN clientes c ON f.cliente_id = c.id
             JOIN tenants t ON f.tenant_id = t.id
             WHERE f.id = ? AND f.tenant_id = ?`,
            [facturaId, tenantId]
        );
        if (!facturas[0]) {
            return null;
        }

        const [detalles] = await db.query(
            `SELECT d.cantidad, d.precio_unitario, d.unidad_medida, d.subtotal, d.es_servicio,
                    d.base_gravable, d.tasa_impuesto, d.valor_impuesto,
                    COALESCE(p.nombre, s.nombre) AS nombre
             FROM detalle_factura d
             LEFT JOIN productos p ON d.producto_id = p.id
             LEFT JOIN servicios s ON d.servicio_id = s.id
             WHERE d.factura_id = ?`,
            [facturaId]
        );

        return { factura: facturas[0], detalles };
    }

    /**
     * Reintento manual: vuelve la fila a 'pendiente' e inmediata (sin esperar backoff).
     * @param {number} facturaId
     * @param {number} tenantId
     */
    static async reintentar(facturaId, tenantId) {
        const [result] = await db.query(
            `UPDATE facturas_electronicas
             SET estado = 'pendiente', proximo_intento = NULL
             WHERE factura_id = ? AND tenant_id = ?`,
            [facturaId, tenantId]
        );
        return result.affectedRows > 0;
    }
}

module.exports = FacturaElectronicaRepository;
