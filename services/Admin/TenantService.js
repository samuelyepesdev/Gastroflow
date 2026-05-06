const db = require('../../config/database');

class TenantService {
    static async getAllTenants() {
        const [rows] = await db.query(`
            SELECT t.id, t.nombre, t.email, t.slug, t.activo, t.config, t.plan_id, t.created_at, 
                   t.nit, t.direccion, t.telefono, t.ciudad, t.regimen_fiscal,
                   p.nombre AS plan_nombre, p.slug AS plan_slug
            FROM tenants t
            LEFT JOIN planes p ON t.plan_id = p.id
            ORDER BY t.created_at DESC
        `);
        return (rows || []).map(row => {
            let config = row.config;
            if (config && typeof config === 'string') {
                try { config = JSON.parse(config); } catch (_) { config = {}; }
            }
            return {
                id: row.id,
                nombre: row.nombre,
                email: row.email,
                slug: row.slug,
                activo: row.activo,
                config: config || {},
                plan_id: row.plan_id,
                plan_nombre: row.plan_nombre,
                plan_slug: row.plan_slug,
                nit: row.nit,
                direccion: row.direccion,
                telefono: row.telefono,
                ciudad: row.ciudad,
                regimen_fiscal: row.regimen_fiscal,
                created_at: row.created_at
            };
        });
    }

    static async createTenant(data) {
        const { nombre, email, slug, config = {}, activo = true, plan_id = 1, nit, direccion, telefono, ciudad, regimen_fiscal } = data;
        const [existing] = await db.query('SELECT id FROM tenants WHERE slug = ?', [slug]);
        if (existing.length > 0) {
            throw new Error('El slug ya existe');
        }
        const planId = plan_id != null && plan_id !== '' ? parseInt(plan_id, 10) : 1;
        const [result] = await db.query(
            'INSERT INTO tenants (nombre, email, slug, config, activo, plan_id, nit, direccion, telefono, ciudad, regimen_fiscal) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [
                nombre,
                email || null,
                slug,
                JSON.stringify(config),
                activo ? 1 : 0,
                planId,
                nit || null,
                direccion || null,
                telefono || null,
                ciudad || null,
                regimen_fiscal || 'No responsable de IVA'
            ]
        );
        const tenantId = result.insertId;

        // Seed datos iniciales (Ej: Tipos de Documento)
        try {
            await this.seedInitialData(tenantId);
        } catch (e) {
            console.error(`Error al seedear datos iniciales para tenant ${tenantId}:`, e.message);
        }

        return { id: tenantId };
    }

    static async seedInitialData(tenantId) {
        const TemaRepository = require('../../repositories/Shared/TemaRepository');
        const ParametroRepository = require('../../repositories/Shared/ParametroRepository');

        // 1. TIPO_DOCUMENTO
        const temaId = await TemaRepository.create(tenantId, { name: 'TIPO_DOCUMENTO', status: 1 });
        const docs = ['CC', 'NIT', 'CE', 'PA', 'TI', 'PEP'];
        for (const name of docs) {
            const pid = await ParametroRepository.create(tenantId, { name, status: 1 });
            await TemaRepository.addParametroToTema(temaId, pid);
        }

        // 2. CATEGORIAS DE INSUMO (Necesario para Cerámicas y stock)
        const temaCatId = await TemaRepository.create(tenantId, { name: 'CATEGORIAS DE INSUMO', status: 1 });
        const cats = ['Cerámicas', 'Carnes', 'Verduras', 'Abarrotes', 'Líquidos', 'Empaques'];
        for (const name of cats) {
            const pid = await ParametroRepository.create(tenantId, { name, status: 1 });
            await TemaRepository.addParametroToTema(temaCatId, pid);
        }

        // 3. UNIDADES DE COMPRA
        const temaUniId = await TemaRepository.create(tenantId, { name: 'UNIDADES DE COMPRA', status: 1 });
        const unis = ['UND', 'KG', 'G', 'L', 'ML', 'PAQUETE', 'CAJA'];
        for (const name of unis) {
            const pid = await ParametroRepository.create(tenantId, { name, status: 1 });
            await TemaRepository.addParametroToTema(temaUniId, pid);
        }
    }


    static async updateTenant(id, data) {
        const payload = [];
        const parts = [];

        const fields = ['nombre', 'email', 'activo', 'plan_id', 'nit', 'direccion', 'telefono', 'ciudad', 'regimen_fiscal', 'logo_data', 'logo_tipo'];
        fields.forEach(f => {
            if (data[f] !== undefined) {
                parts.push(`${f} = ?`);
                payload.push(f === 'activo' ? (data[f] ? 1 : 0) : data[f]);
            }
        });

        if (data.config !== undefined && data.config !== null) {
            parts.push('config = ?');
            const configStr = typeof data.config === 'string' ? data.config : JSON.stringify(data.config);
            payload.push(configStr);
        }

        if (parts.length === 0) {
            return { affectedRows: 0 };
        }

        const query = `UPDATE tenants SET ${parts.join(', ')} WHERE id = ?`;
        payload.push(id);
        const [result] = await db.query(query, payload);
        return result;
    }

    static async setTenantConfig(id, config) {
        const configStr = typeof config === 'string' ? config : JSON.stringify(config || {});
        const [result] = await db.query(
            'UPDATE tenants SET config = ? WHERE id = ?',
            [configStr, id]
        );
        return result;
    }

    static async changeTenantStatus(id, activo) {
        const [result] = await db.query(
            'UPDATE tenants SET activo = ? WHERE id = ?',
            [activo ? 1 : 0, id]
        );
        return result;
    }

    static async deleteTenant(id) {
        const connection = await db.getConnection();
        try {
            await connection.beginTransaction();

            // Disable FK checks to allow bulk deletion regardless of dependencies
            await connection.query('SET FOREIGN_KEY_CHECKS = 0');

            // Delete non-tenant_id dependencies first
            await connection.query('DELETE FROM user_permisos WHERE user_id IN (SELECT id FROM usuarios WHERE tenant_id = ?)', [id]);
            await connection.query('DELETE FROM detalle_factura WHERE factura_id IN (SELECT id FROM facturas WHERE tenant_id = ?)', [id]);
            await connection.query('DELETE FROM producto_parametro WHERE producto_id IN (SELECT id FROM productos WHERE tenant_id = ?)', [id]);
            await connection.query('DELETE FROM receta_ingredientes WHERE receta_id IN (SELECT id FROM recetas WHERE tenant_id = ?)', [id]);
            await connection.query('DELETE FROM tema_parametro WHERE tema_id IN (SELECT id FROM temas WHERE tenant_id = ?)', [id]);

            // Delete all data associated with the tenant
            const tables = [
                'tenant_audit', 'tenant_addons', 'pedido_items', 'pedidos', 'movimientos_inventario',
                'facturas', 'recetas', 'productos', 'categorias', 'insumos', 'eventos', 'costos_fijos',
                'configuracion_costeo', 'configuracion_impresion', 'mesas', 'clientes', 'usuarios',
                'parametros', 'temas'
            ];

            for (const table of tables) {
                await connection.query(`DELETE FROM ${table} WHERE tenant_id = ?`, [id]);
            }

            // Finally, delete the tenant itself
            await connection.query('DELETE FROM tenants WHERE id = ?', [id]);

            await connection.query('SET FOREIGN_KEY_CHECKS = 1');
            await connection.commit();
        } catch (error) {
            await connection.query('SET FOREIGN_KEY_CHECKS = 1'); // Ensure it's re-enabled
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }

    /**
     * Estadísticas para el dashboard del superadministrador.
     * @returns {Promise<{ totalRestaurantes, restaurantesActivos, restaurantesInactivos, porPlan: Array<{ plan_nombre, plan_slug, cantidad }>, totalUsuarios }>}
     */
    static async getDashboardStats() {
        const [resumen] = await db.query(`
            SELECT
                COUNT(*) AS total,
                SUM(CASE WHEN t.activo = 1 THEN 1 ELSE 0 END) AS activos,
                SUM(CASE WHEN t.activo = 0 OR t.activo IS NULL THEN 1 ELSE 0 END) AS inactivos
            FROM tenants t
        `);
        const [porPlan] = await db.query(`
            SELECT p.nombre AS plan_nombre, p.slug AS plan_slug, p.orden, COUNT(t.id) AS cantidad
            FROM planes p
            LEFT JOIN tenants t ON t.plan_id = p.id
            WHERE p.activo = 1
            GROUP BY p.id, p.nombre, p.slug, p.orden
            ORDER BY p.orden ASC, p.nombre ASC
        `);
        const [sinPlanRow] = await db.query(`SELECT COUNT(*) AS cantidad FROM tenants WHERE plan_id IS NULL`);
        const sinPlanCount = parseInt(sinPlanRow[0]?.cantidad || 0, 10);
        const porPlanList = (porPlan || []).map(row => ({
            plan_nombre: row.plan_nombre || 'Sin plan',
            plan_slug: row.plan_slug || '',
            cantidad: parseInt(row.cantidad || 0, 10)
        }));
        if (sinPlanCount > 0) porPlanList.push({ plan_nombre: 'Sin plan', plan_slug: '', cantidad: sinPlanCount });
        const [usuariosRow] = await db.query(`
            SELECT COUNT(*) AS total FROM usuarios WHERE tenant_id IS NOT NULL
        `);
        const [facturasRows] = await db.query(`SELECT COUNT(*) AS cnt FROM facturas WHERE evento_id IS NULL`);
        const [ventasMontoRows] = await db.query(`SELECT COALESCE(SUM(total), 0) AS total FROM facturas WHERE evento_id IS NULL`);
        
        // Desglose de monto total vendido por método de pago para todos los restaurantes
        const [montoPorFormaPagoRows] = await db.query(`
            SELECT forma_pago, COALESCE(SUM(total), 0) AS total 
            FROM facturas 
            WHERE evento_id IS NULL 
            GROUP BY forma_pago
        `);
        let totalEfectivo = 0;
        let totalTransferencia = 0;
        let totalOtros = 0;
        montoPorFormaPagoRows.forEach(row => {
            const fp = String(row.forma_pago || '').toLowerCase().trim();
            const total = parseFloat(row.total || 0);
            if (fp === 'efectivo') {
                totalEfectivo += total;
            } else if (fp === 'transferencia') {
                totalTransferencia += total;
            } else {
                totalOtros += total;
            }
        });
        const [productosRows] = await db.query(`SELECT COUNT(*) AS cnt FROM productos WHERE tenant_id IS NOT NULL`);
        const [clientesRows] = await db.query(`SELECT COUNT(*) AS cnt FROM clientes WHERE tenant_id IS NOT NULL`);
        const [mesasRows] = await db.query(`SELECT COUNT(*) AS cnt FROM mesas WHERE tenant_id IS NOT NULL`);
        const [recientesRow] = await db.query(`
            SELECT COUNT(*) AS cantidad FROM tenants
            WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
        `);
        const [historicoRows] = await db.query(`
            SELECT DATE_FORMAT(created_at, '%Y-%m') AS mes, COUNT(*) AS cantidad
            FROM tenants
            WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)
            GROUP BY mes
            ORDER BY mes ASC
        `);

        // Ventas del mes actuales diarias (Bogotá UTC-5)
        const bogotaOffset = -5;
        const now = new Date();
        const bogotaDate = new Date(now.getTime() + (bogotaOffset * 3600000));
        const yyyy = bogotaDate.getUTCFullYear();
        const mm = String(bogotaDate.getUTCMonth() + 1).padStart(2, '0');
        const dd = String(bogotaDate.getUTCDate()).padStart(2, '0');

        const hoyColombia = `${yyyy}-${mm}-${dd}`;
        const mesInicioStr = `${yyyy}-${mm}-01`;
        const diaHoy = bogotaDate.getUTCDate(); // Día actual en Bogotá
        const parts = [String(yyyy), mm, dd];

        const [ventasDiaRows] = await db.query(`
            SELECT DATE(CONVERT_TZ(fecha, '+00:00', '-05:00')) AS fecha_colombia, SUM(total) as total
            FROM facturas
            WHERE evento_id IS NULL AND DATE(CONVERT_TZ(fecha, '+00:00', '-05:00')) BETWEEN ? AND ?
            GROUP BY fecha_colombia
            ORDER BY fecha_colombia ASC
        `, [mesInicioStr, hoyColombia]);

        const ventasPorFecha = {};
        ventasDiaRows.forEach(r => {
            const f = (r.fecha_colombia instanceof Date) ? r.fecha_colombia.toISOString().split('T')[0] : String(r.fecha_colombia || '').substring(0, 10);
            ventasPorFecha[f] = parseFloat(r.total || 0);
        });

        const ventasDiariasMes = [];
        for (let i = 1; i <= diaHoy; i++) {
            const fechaStr = `${parts[0]}-${parts[1]}-${String(i).padStart(2, '0')}`;
            ventasDiariasMes.push({
                fecha: fechaStr,
                total: ventasPorFecha[fechaStr] || 0
            });
        }

        const [ventasEventosDiaRows] = await db.query(`
            SELECT DATE(CONVERT_TZ(fecha, '+00:00', '-05:00')) AS fecha_colombia, SUM(total) as total
            FROM facturas
            WHERE evento_id IS NOT NULL AND DATE(CONVERT_TZ(fecha, '+00:00', '-05:00')) BETWEEN ? AND ?
            GROUP BY fecha_colombia
            ORDER BY fecha_colombia ASC
        `, [mesInicioStr, hoyColombia]);

        const ventasEventosPorFecha = {};
        ventasEventosDiaRows.forEach(r => {
            const f = (r.fecha_colombia instanceof Date) ? r.fecha_colombia.toISOString().split('T')[0] : String(r.fecha_colombia || '').substring(0, 10);
            ventasEventosPorFecha[f] = parseFloat(r.total || 0);
        });

        const ventasEventosDiariasMes = [];
        for (let i = 1; i <= diaHoy; i++) {
            const fechaStr = `${parts[0]}-${parts[1]}-${String(i).padStart(2, '0')}`;
            ventasEventosDiariasMes.push({
                fecha: fechaStr,
                total: ventasEventosPorFecha[fechaStr] || 0
            });
        }

        // Ventas del mes anterior diarias
        let mesAnteriorY = parseInt(parts[0], 10);
        let mesAnteriorM = parseInt(parts[1], 10) - 1;
        if (mesAnteriorM === 0) {
            mesAnteriorM = 12;
            mesAnteriorY -= 1;
        }
        const mesAnteriorInicioStr = `${mesAnteriorY}-${String(mesAnteriorM).padStart(2, '0')}-01`;
        const diasEnMesAnterior = new Date(mesAnteriorY, mesAnteriorM, 0).getDate();
        const mesAnteriorFinStr = `${mesAnteriorY}-${String(mesAnteriorM).padStart(2, '0')}-${String(diasEnMesAnterior).padStart(2, '0')}`;

        const [ventasDiaAntRows] = await db.query(`
            SELECT DATE(CONVERT_TZ(fecha, '+00:00', '-05:00')) AS fecha_colombia, SUM(total) as total
            FROM facturas
            WHERE evento_id IS NULL AND DATE(CONVERT_TZ(fecha, '+00:00', '-05:00')) BETWEEN ? AND ?
            GROUP BY fecha_colombia
            ORDER BY fecha_colombia ASC
        `, [mesAnteriorInicioStr, mesAnteriorFinStr]);

        const ventasPorFechaAnt = {};
        ventasDiaAntRows.forEach(r => {
            const f = (r.fecha_colombia instanceof Date) ? r.fecha_colombia.toISOString().split('T')[0] : String(r.fecha_colombia || '').substring(0, 10);
            ventasPorFechaAnt[f] = parseFloat(r.total || 0);
        });

        const ventasDiariasMesAnterior = [];
        for (let i = 1; i <= diasEnMesAnterior; i++) {
            const fechaStr = `${mesAnteriorY}-${String(mesAnteriorM).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
            ventasDiariasMesAnterior.push({
                fecha: fechaStr,
                total: ventasPorFechaAnt[fechaStr] || 0
            });
        }

        // --- NUEVO: Ventas diarias por restaurante (Mes Actual) ---
        // 1. Obtener todos los tenants activos para asegurar que aparezcan en la gráfica aunque tengan 0 ventas
        const [tenantsActivos] = await db.query('SELECT id, nombre FROM tenants WHERE activo = 1');
        const nombresTenants = new Set();
        const ventasPorTenantYFecha = {};

        tenantsActivos.forEach(t => {
            const nombre = t.nombre || 'Desconocido';
            nombresTenants.add(nombre);
            ventasPorTenantYFecha[nombre] = {};
        });

        // 2. Obtener las ventas reales
        const [ventasTenantRows] = await db.query(`
            SELECT t.nombre AS tenant_nombre, DATE(CONVERT_TZ(f.fecha, '+00:00', '-05:00')) AS fecha_colombia, SUM(f.total) as total
            FROM facturas f
            JOIN tenants t ON f.tenant_id = t.id
            WHERE f.evento_id IS NULL AND DATE(CONVERT_TZ(f.fecha, '+00:00', '-05:00')) BETWEEN ? AND ?
            GROUP BY f.tenant_id, fecha_colombia
            ORDER BY fecha_colombia ASC
        `, [mesInicioStr, hoyColombia]);

        ventasTenantRows.forEach(r => {
            const f = (r.fecha_colombia instanceof Date) ? r.fecha_colombia.toISOString().split('T')[0] : String(r.fecha_colombia || '').substring(0, 10);
            const t = r.tenant_nombre || 'Desconocido';
            if (!ventasPorTenantYFecha[t]) {
                ventasPorTenantYFecha[t] = {};
                nombresTenants.add(t);
            }
            ventasPorTenantYFecha[t][f] = parseFloat(r.total || 0);
        });

        const ventasDiariasPorTenant = [];
        // Ya NO usamos el bucle para calcular "hoy" — usamos consulta SQL directa
        Array.from(nombresTenants).forEach(nombre => {
            const dataPuntos = [];
            for (let i = 1; i <= diaHoy; i++) {
                const fechaStr = `${parts[0]}-${parts[1]}-${String(i).padStart(2, '0')}`;
                const totalDia = (ventasPorTenantYFecha[nombre] && ventasPorTenantYFecha[nombre][fechaStr]) || 0;
                dataPuntos.push({ fecha: fechaStr, total: totalDia });
            }
            ventasDiariasPorTenant.push({ nombre, data: dataPuntos });
        });

        // CORRECCIÓN: Ventas de HOY por tenant con consulta directa (sin depender del bucle)
        const [ventasHoyDirectas] = await db.query(`
            SELECT t.nombre AS tenant_nombre, COALESCE(SUM(f.total), 0) AS total, COUNT(f.id) AS facturas
            FROM tenants t
            LEFT JOIN facturas f ON f.tenant_id = t.id
                AND f.evento_id IS NULL
                AND DATE(CONVERT_TZ(f.fecha, '+00:00', '-05:00')) = ?
            WHERE t.activo = 1
            GROUP BY t.id, t.nombre
            ORDER BY total DESC
        `, [hoyColombia]);

        const ventasHoyPorTenant = ventasHoyDirectas.map(r => ({
            nombre: r.tenant_nombre,
            total: parseFloat(r.total || 0),
            facturas: parseInt(r.facturas || 0, 10)
        }));

        // Total global de ventas de hoy (todas los tenants)
        const ventasHoyTotalGlobal = ventasHoyPorTenant.reduce((sum, v) => sum + v.total, 0);

        const r = resumen[0] || {};
        const toNum = (val) => (val === undefined || val === null) ? 0 : (typeof val === 'bigint' ? Number(val) : parseFloat(val) || 0);
        const rowVal = (row) => (row && typeof row === 'object') ? toNum(Object.values(row)[0]) : 0;
        return {
            totalRestaurantes: parseInt(toNum(r.total ?? r.TOTAL) || 0, 10),
            restaurantesActivos: parseInt(toNum(r.activos ?? r.ACTIVOS) || 0, 10),
            restaurantesInactivos: parseInt(toNum(r.inactivos ?? r.INACTIVOS) || 0, 10),
            porPlan: porPlanList,
            totalUsuarios: parseInt(rowVal(usuariosRow?.[0]) || 0, 10),
            totalFacturas: parseInt(rowVal(facturasRows?.[0]) || 0, 10),
            totalVentasMonto: parseFloat(rowVal(ventasMontoRows?.[0]) || 0),
            totalEfectivo: totalEfectivo,
            totalTransferencia: totalTransferencia,
            totalOtros: totalOtros,
            totalProductos: parseInt(rowVal(productosRows?.[0]) || 0, 10),
            totalClientes: parseInt(rowVal(clientesRows?.[0]) || 0, 10),
            totalMesas: parseInt(rowVal(mesasRows?.[0]) || 0, 10),
            restaurantesUltimos30Dias: parseInt(rowVal(recientesRow?.[0]) || 0, 10),
            historicoRegistro: historicoRows || [],
            ventasDiariasMes,
            ventasEventosDiariasMes,
            ventasDiariasMesAnterior,
            ventasDiariasPorTenant,
            ventasHoyPorTenant,
            ventasHoyTotalGlobal
        };
    }

    static async getTenantById(id) {
        const [rows] = await db.query(
            'SELECT t.*, p.nombre AS plan_nombre, p.slug AS plan_slug FROM tenants t LEFT JOIN planes p ON t.plan_id = p.id WHERE t.id = ?',
            [id]
        );
        const row = rows[0] || null;
        if (!row) return null;
        let config = row.config;
        if (config && typeof config === 'string') {
            try { config = JSON.parse(config); } catch (_) { config = {}; }
        }
        return {
            ...row,
            config: config || {},
            plan_nombre: row.plan_nombre,
            plan_slug: row.plan_slug
        };
    }
}

module.exports = TenantService;
