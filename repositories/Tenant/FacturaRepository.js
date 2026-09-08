/**
 * FacturaRepository - Data access layer for invoices
 * Handles all SQL queries related to invoices and invoice details
 * Related to: routes/facturas.js, services/FacturaService.js
 */

const db = require('../../config/database');
const { toFechaISOUtc } = require('../../utils/dateHelpers');
const TaxService = require('../../services/Shared/TaxService');
const CajaRepository = require('./CajaRepository');

class FacturaRepository {
    /**
     * Si las facturas de ESTE tenant tienen numero NULL o no empiezan en 1 (p. ej. migración
     * que puso numero = id), las acomoda a 1, 2, 3... (orden por id). Usa la misma connection
     * (dentro de transacción).
     *
     * Antes esto corría un `COUNT(*) FROM facturas WHERE numero IS NULL` SIN filtro de tenant
     * (full scan cross-tenant en cada venta de cualquier tenant) y, si encontraba cualquier
     * NULL en cualquier tenant, renumeraba TODOS los tenants como efecto secundario. Ahora está
     * acotado al tenant actual: 2 queries indexadas por tenant_id en el camino feliz, y el loop
     * de renumeración solo corre si hay algo realmente inconsistente en este tenant.
     * @param {import('mysql2/promise').PoolConnection} connection
     * @param {number} tenantId - Tenant actual
     */
    static async acomodarNumeracionSiFalta(connection, tenantId) {
        try {
            const [rows] = await connection.query(
                'SELECT COUNT(*) AS total FROM facturas WHERE tenant_id = ? AND numero IS NULL',
                [tenantId]
            );
            const totalNulos = (rows && rows[0] && rows[0].total) || 0;

            const [minRows] = await connection.query(
                'SELECT MIN(numero) AS min_num FROM facturas WHERE tenant_id = ?',
                [tenantId]
            );
            const minNum =
                minRows && minRows[0] && minRows[0].min_num !== null && minRows[0].min_num !== undefined
                    ? Number(minRows[0].min_num)
                    : null;

            // Camino feliz: sin nulos y ya empieza en 1 (o no hay facturas aún) -> nada que corregir.
            if (totalNulos === 0 && (minNum === null || minNum === 1)) {
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
                'SELECT id, usuario_id FROM caja_sesiones WHERE tenant_id = ? AND estado = "abierta" LIMIT 1',
                [tenantId]
            );
            const cajaSesionId = sesiones.length > 0 ? sesiones[0].id : null;
            const cajaSesionUsuarioId = sesiones.length > 0 ? sesiones[0].usuario_id : null;

            // Desglose efectivo/transferencia para el arqueo de caja. El POS/eventos
            // envían un solo forma_pago (sin split), así que el total va íntegro al
            // método usado; 'mixto' u otros quedan en 0/0 (no rompe: la caja usa 0).
            const totalNum = Number.parseFloat(facturaData.total) || 0;
            const montoEfectivo = facturaData.forma_pago === 'efectivo' ? totalNum : 0;
            const montoTransferencia = facturaData.forma_pago === 'transferencia' ? totalNum : 0;

            // Efectivo recibido: solo informativo (Recibido/Cambio en ticket y caja).
            // Se guarda únicamente si es un pago en efectivo y cubre el total.
            const efectivoRecibidoNum = Number.parseFloat(facturaData.efectivo_recibido) || 0;
            const efectivoRecibido =
                facturaData.forma_pago === 'efectivo' && efectivoRecibidoNum >= totalNum ? efectivoRecibidoNum : null;

            const [result] = await connection.query(
                'INSERT INTO facturas (tenant_id, numero, cliente_id, total, forma_pago, evento_id, fecha, caja_sesion_id, monto_efectivo, monto_transferencia, efectivo_recibido) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [
                    tenantId,
                    numero,
                    facturaData.cliente_id,
                    facturaData.total,
                    facturaData.forma_pago,
                    evento_id,
                    fechaEmisionUtc,
                    cajaSesionId,
                    montoEfectivo,
                    montoTransferencia,
                    efectivoRecibido
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

                const descuentoValorLinea =
                    p.descuento_valor !== null && p.descuento_valor !== undefined && p.descuento_valor > 0
                        ? p.descuento_valor
                        : null;
                const descuentoPorcentajeLinea =
                    descuentoValorLinea === null &&
                    p.descuento_porcentaje !== null &&
                    p.descuento_porcentaje !== undefined &&
                    p.descuento_porcentaje > 0
                        ? p.descuento_porcentaje
                        : null;

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
                    descuentoPorcentajeLinea,
                    descuentoValorLinea,
                    base_gravable,
                    tasa,
                    valor_impuesto
                ];
            });

            const [detalleResult] = await connection.query(
                'INSERT INTO detalle_factura (factura_id, producto_id, servicio_id, es_servicio, cantidad, precio_unitario, precio_original, unidad_medida, subtotal, descuento_porcentaje, descuento_valor, base_gravable, tasa_impuesto, valor_impuesto) VALUES ?',
                [detallesValues]
            );

            // Snapshot de toppings/modificadores elegidos (si aplica). Un INSERT ... VALUES
            // multi-fila en una sola sentencia genera ids contiguos a partir de insertId
            // (comportamiento estándar de MySQL/InnoDB para auto_increment en un solo statement),
            // así que el detalle_factura_id de la fila i es insertId + i.
            const primerDetalleId = detalleResult.insertId;
            const modificadoresValues = [];
            facturaData.productos.forEach((p, i) => {
                (p._modificadoresSnapshot || []).forEach(m => {
                    modificadoresValues.push([
                        primerDetalleId + i,
                        m.opcion_modificador_id,
                        m.grupo_nombre,
                        m.opcion_nombre,
                        m.precio_adicional,
                        m.cantidad || 1
                    ]);
                });
            });
            if (modificadoresValues.length > 0) {
                await connection.query(
                    'INSERT INTO detalle_factura_modificadores (detalle_factura_id, opcion_modificador_id, grupo_nombre, opcion_nombre, precio_adicional, cantidad) VALUES ?',
                    [modificadoresValues]
                );
            }

            await connection.query(
                'UPDATE facturas SET subtotal = ?, descuento = ?, total_impuestos = ? WHERE id = ?',
                [
                    Math.round(subtotalFactura * 100) / 100,
                    Math.round(descuentoFactura * 100) / 100,
                    Math.round(impuestosFactura * 100) / 100,
                    factura_id
                ]
            );

            // Servicios externos (ej. domicilio de un tercero): el dinero entra con
            // la factura pero se le entrega al proveedor en efectivo, así que se
            // compensa con una salida de caja, sin importar cómo pagó el cliente.
            if (cajaSesionId) {
                const montoExternos = await FacturaRepository._calcularServiciosExternos(
                    connection,
                    tenantId,
                    facturaData.productos
                );
                if (montoExternos > 0) {
                    await CajaRepository.registrarSalidaServicioExterno(
                        {
                            tenantId,
                            sesionId: cajaSesionId,
                            usuarioId: facturaData.usuario_id || cajaSesionUsuarioId,
                            facturaId: factura_id,
                            numeroFactura: numero,
                            monto: montoExternos
                        },
                        connection
                    );
                }
            }

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
     * Suma el subtotal de las líneas que son servicios externos (servicios.es_externo = 1)
     * dentro de un arreglo de productos de factura. Usado para compensar el arqueo de caja.
     * @returns {Promise<number>} monto total de servicios externos (0 si no hay)
     */
    static async _calcularServiciosExternos(connection, tenantId, productos) {
        const servicioIds = [
            ...new Set((productos || []).filter(p => p.es_servicio && p.servicio_id).map(p => Number(p.servicio_id)))
        ];
        if (servicioIds.length === 0) {
            return 0;
        }
        const [rows] = await connection.query(
            'SELECT id FROM servicios WHERE tenant_id = ? AND id IN (?) AND es_externo = 1',
            [tenantId, servicioIds]
        );
        const externos = new Set(rows.map(r => Number(r.id)));
        if (externos.size === 0) {
            return 0;
        }
        const monto = (productos || [])
            .filter(p => p.es_servicio && p.servicio_id && externos.has(Number(p.servicio_id)))
            .reduce((sum, p) => sum + (Number.parseFloat(p.subtotal) || 0), 0);
        return Math.round(monto * 100) / 100;
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
                   f.subtotal, f.descuento, f.total_impuestos, f.monto_efectivo, f.monto_transferencia, f.efectivo_recibido,
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
        if (detalles.length === 0) {
            return detalles;
        }
        const detalleIds = detalles.map(d => d.id);
        const [modificadores] = await db.query(
            'SELECT detalle_factura_id, opcion_nombre, precio_adicional, cantidad FROM detalle_factura_modificadores WHERE detalle_factura_id IN (?)',
            [detalleIds]
        );
        detalles.forEach(d => {
            d.modificadores = modificadores.filter(m => m.detalle_factura_id === d.id);
        });
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

    /**
     * Datos editables de una factura para el modal de "Modificar venta" del superadmin.
     * fecha se formatea directo del valor guardado (sin conversión de zona horaria) para
     * que lo que se ve al abrir el formulario sea exactamente lo que hay en la BD.
     * @param {number} facturaId - Invoice ID
     * @returns {Promise<Object|null>}
     */
    static async getEditableById(facturaId) {
        const [rows] = await db.query(
            `SELECT f.id, f.tenant_id, f.numero, f.cliente_id, f.forma_pago, f.total, f.propina,
                    DATE_FORMAT(f.fecha, '%Y-%m-%dT%H:%i') AS fecha,
                    c.nombre AS cliente_nombre, t.nombre AS tenant_nombre
             FROM facturas f
             JOIN tenants t ON f.tenant_id = t.id
             LEFT JOIN clientes c ON f.cliente_id = c.id
             WHERE f.id = ?`,
            [facturaId]
        );
        return rows[0] || null;
    }

    /**
     * Actualiza campos editables de una factura (uso exclusivo de superadmin, para corregir
     * errores de digitación). No toca las líneas de detalle_factura ni el desglose de
     * impuestos/subtotal -- si hay que corregir productos hay que anular y rehacer la venta.
     * @param {number} facturaId - Invoice ID
     * @param {Object} data
     * @param {string} data.cliente_nombre - Nombre del cliente (se busca o crea en el tenant de la factura)
     * @param {string} data.forma_pago - 'efectivo' | 'transferencia' | 'mixto'
     * @param {number} data.total
     * @param {number} data.propina
     * @param {string} data.fecha - 'YYYY-MM-DD HH:mm:ss'
     * @returns {Promise<{ updated: boolean }>}
     */
    static async updateAdmin(facturaId, data) {
        const [facturas] = await db.query('SELECT tenant_id FROM facturas WHERE id = ?', [facturaId]);
        if (facturas.length === 0) {
            return { updated: false };
        }
        const tenantId = facturas[0].tenant_id;

        let clienteId = null;
        const nombreCliente = (data.cliente_nombre || '').trim();
        if (nombreCliente) {
            const [existing] = await db.query(
                'SELECT id FROM clientes WHERE tenant_id = ? AND LOWER(nombre) = LOWER(?) LIMIT 1',
                [tenantId, nombreCliente]
            );
            clienteId =
                existing.length > 0
                    ? existing[0].id
                    : (
                          await db.query('INSERT INTO clientes (tenant_id, nombre) VALUES (?, ?)', [
                              tenantId,
                              nombreCliente
                          ])
                      )[0].insertId;
        }

        const [result] = await db.query(
            `UPDATE facturas SET cliente_id = COALESCE(?, cliente_id), forma_pago = ?, total = ?, propina = ?, fecha = ? WHERE id = ?`,
            [clienteId, data.forma_pago, data.total, data.propina, data.fecha, facturaId]
        );
        return { updated: result.affectedRows > 0 };
    }
}

module.exports = FacturaRepository;
