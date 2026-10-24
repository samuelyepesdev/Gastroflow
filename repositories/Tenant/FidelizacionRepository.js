/**
 * FidelizacionRepository - Acceso a datos del programa de sellos, las tarjetas de los
 * clientes y su historial de movimientos. Todo va acotado por tenant_id.
 * Los métodos aceptan una `connection` opcional para participar en una transacción.
 */
const db = require('../../config/database');

const ejecutar = (connection, sql, params) => (connection || db).query(sql, params);

class FidelizacionRepository {
    // ---- Programa ----------------------------------------------------------

    static async obtenerPrograma(tenantId, connection) {
        const [rows] = await ejecutar(
            connection,
            `SELECT fp.*, p.nombre AS producto_nombre
             FROM fidelizacion_programas fp
             LEFT JOIN productos p ON p.id = fp.producto_id AND p.tenant_id = fp.tenant_id
             WHERE fp.tenant_id = ?`,
            [tenantId]
        );
        return rows[0] || null;
    }

    /** Productos activos de la carta para elegir el que da el sello. */
    static async listarProductos(tenantId) {
        const [rows] = await db.query(
            'SELECT id, nombre FROM productos WHERE tenant_id = ? AND activo = 1 ORDER BY nombre',
            [tenantId]
        );
        return rows;
    }

    /** ¿La factura (de este restaurante) incluye el producto? */
    static async facturaTieneProducto(tenantId, facturaId, productoId) {
        const [rows] = await db.query(
            `SELECT 1 FROM detalle_factura df
             JOIN facturas f ON f.id = df.factura_id
             WHERE f.tenant_id = ? AND df.factura_id = ? AND df.producto_id = ? AND df.cantidad > 0
             LIMIT 1`,
            [tenantId, facturaId, productoId]
        );
        return rows.length > 0;
    }

    static async guardarPrograma(
        tenantId,
        {
            nombre,
            sellosRequeridos,
            montoMinimo,
            modoSello,
            productoId,
            premio,
            activo,
            diseno,
            color,
            lema,
            logoUrl,
            mostrarLogo
        }
    ) {
        await db.query(
            `INSERT INTO fidelizacion_programas
                (tenant_id, nombre, sellos_requeridos, monto_minimo, modo_sello, producto_id, premio, activo, diseno, color, lema, logo_url, mostrar_logo)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE nombre = VALUES(nombre), sellos_requeridos = VALUES(sellos_requeridos),
                monto_minimo = VALUES(monto_minimo), modo_sello = VALUES(modo_sello), producto_id = VALUES(producto_id),
                premio = VALUES(premio), activo = VALUES(activo),
                diseno = VALUES(diseno), color = VALUES(color), lema = VALUES(lema),
                logo_url = VALUES(logo_url), mostrar_logo = VALUES(mostrar_logo)`,
            [
                tenantId,
                nombre,
                sellosRequeridos,
                montoMinimo,
                modoSello,
                productoId,
                premio,
                activo ? 1 : 0,
                diseno,
                color,
                lema,
                logoUrl,
                mostrarLogo ? 1 : 0
            ]
        );
        return FidelizacionRepository.obtenerPrograma(tenantId);
    }

    /** Caché { firma, urls: { "<sellos>": url } } de las imágenes del pase de Wallet. */
    static async guardarImagenesWallet(tenantId, imagenes) {
        await db.query('UPDATE fidelizacion_programas SET wallet_imagenes = ? WHERE tenant_id = ?', [
            JSON.stringify(imagenes),
            tenantId
        ]);
    }

    static async obtenerProgramaPorTokenInscripcion(token) {
        const [rows] = await db.query('SELECT * FROM fidelizacion_programas WHERE token_inscripcion = ?', [token]);
        return rows[0] || null;
    }

    static async guardarTokenInscripcion(tenantId, token) {
        await db.query('UPDATE fidelizacion_programas SET token_inscripcion = ? WHERE tenant_id = ?', [
            token,
            tenantId
        ]);
    }

    /** Cliente del restaurante por teléfono (compara los últimos 10 dígitos, ignora espacios y +57). */
    static async buscarClientePorTelefono(tenantId, telefono10) {
        const [rows] = await db.query(
            `SELECT id, nombre FROM clientes
             WHERE tenant_id = ? AND telefono IS NOT NULL
               AND RIGHT(REGEXP_REPLACE(telefono, '[^0-9]', ''), 10) = ?
             ORDER BY id LIMIT 1`,
            [tenantId, telefono10]
        );
        return rows[0] || null;
    }

    // ---- Tarjetas ----------------------------------------------------------

    static async crearTarjeta({ tenantId, clienteId, numero, tokenPublico, origen = 'caja', ip = null }) {
        const [r] = await db.query(
            `INSERT INTO fidelizacion_tarjetas
                (tenant_id, cliente_id, numero, token_publico, consentimiento_origen, consentimiento_ip)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [tenantId, clienteId, numero, tokenPublico, origen, ip]
        );
        return r.insertId;
    }

    static async obtenerTarjetaPorId(tenantId, id, connection, bloquear = false) {
        const [rows] = await ejecutar(
            connection,
            `SELECT t.*, c.nombre AS cliente_nombre, c.telefono AS cliente_telefono
             FROM fidelizacion_tarjetas t JOIN clientes c ON c.id = t.cliente_id
             WHERE t.tenant_id = ? AND t.id = ? ${bloquear ? 'FOR UPDATE' : ''}`,
            [tenantId, id]
        );
        return rows[0] || null;
    }

    static async obtenerTarjetaPorCliente(tenantId, clienteId, connection, bloquear = false) {
        const [rows] = await ejecutar(
            connection,
            `SELECT t.*, c.nombre AS cliente_nombre, c.telefono AS cliente_telefono
             FROM fidelizacion_tarjetas t JOIN clientes c ON c.id = t.cliente_id
             WHERE t.tenant_id = ? AND t.cliente_id = ? ${bloquear ? 'FOR UPDATE' : ''}`,
            [tenantId, clienteId]
        );
        return rows[0] || null;
    }

    static async obtenerTarjetaPorToken(token) {
        const [rows] = await db.query(
            `SELECT t.*, c.nombre AS cliente_nombre
             FROM fidelizacion_tarjetas t JOIN clientes c ON c.id = t.cliente_id
             WHERE t.token_publico = ? AND t.estado = 'activa'`,
            [token]
        );
        return rows[0] || null;
    }

    static async listarTarjetas(tenantId, { q } = {}) {
        const params = [tenantId];
        let filtro = '';
        if (q) {
            filtro = 'AND (c.nombre LIKE ? OR c.telefono LIKE ? OR t.numero LIKE ?)';
            const like = `%${q}%`;
            params.push(like, like, like);
        }
        const [rows] = await db.query(
            `SELECT t.*, c.nombre AS cliente_nombre, c.telefono AS cliente_telefono
             FROM fidelizacion_tarjetas t JOIN clientes c ON c.id = t.cliente_id
             WHERE t.tenant_id = ? ${filtro}
             ORDER BY t.updated_at DESC LIMIT 200`,
            params
        );
        return rows;
    }

    static async actualizarContadores(
        connection,
        tarjetaId,
        { sellos, sellosHistoricos, premiosDisponibles, premiosCanjeados }
    ) {
        await ejecutar(
            connection,
            `UPDATE fidelizacion_tarjetas
             SET sellos = ?, sellos_historicos = ?, premios_disponibles = ?, premios_canjeados = ?
             WHERE id = ?`,
            [sellos, sellosHistoricos, premiosDisponibles, premiosCanjeados, tarjetaId]
        );
    }

    static async marcarSincronizada(tarjetaId) {
        await db.query('UPDATE fidelizacion_tarjetas SET wallet_sincronizada_at = NOW() WHERE id = ?', [tarjetaId]);
    }

    // ---- Movimientos ---------------------------------------------------------

    /** Devuelve true si insertó; false si ya existía (misma factura ya sellada). */
    static async registrarMovimiento(
        connection,
        { tenantId, tarjetaId, tipo, cantidad = 1, facturaId = null, usuarioId = null }
    ) {
        try {
            await ejecutar(
                connection,
                `INSERT INTO fidelizacion_movimientos (tenant_id, tarjeta_id, tipo, cantidad, factura_id, usuario_id)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [tenantId, tarjetaId, tipo, cantidad, facturaId, usuarioId]
            );
            return true;
        } catch (error) {
            if (error.code === 'ER_DUP_ENTRY') {
                return false;
            }
            throw error;
        }
    }

    static async listarMovimientos(tenantId, tarjetaId, limite = 50) {
        const [rows] = await db.query(
            `SELECT id, tipo, cantidad, factura_id, usuario_id, created_at
             FROM fidelizacion_movimientos WHERE tenant_id = ? AND tarjeta_id = ?
             ORDER BY id DESC LIMIT ?`,
            [tenantId, tarjetaId, limite]
        );
        return rows;
    }
}

module.exports = FidelizacionRepository;
