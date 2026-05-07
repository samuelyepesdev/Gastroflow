/**
 * FinanzasService - Lógica de negocio para el control de gastos y ganancias.
 */

const FinanzasRepository = require('../../repositories/Tenant/FinanzasRepository');
const CajaRepository = require('../../repositories/Tenant/CajaRepository');
const db = require('../../config/database');

class FinanzasService {
    /**
     * Registra un ingreso por venta (automático)
     */
    static async registrarIngresoVenta(tenantId, { monto, factura_id, detalle, esCeramica = false, usuario_id }) {
        // Intentar obtener sesión de caja abierta
        const sesion = await CajaRepository.getSesionAbierta(tenantId);
        
        // Prioridad de usuario: 1. El que viene en la req, 2. El de la sesión de caja, 3. Usuario 1 (admin)
        const finalUsuarioId = usuario_id || (sesion ? sesion.usuario_id : 1);

        return await FinanzasRepository.createMovimiento(tenantId, {
            sesion_id: sesion ? sesion.id : null,
            usuario_id: finalUsuarioId,
            tipo: 'entrada',
            monto: parseFloat(monto) || 0,
            motivo: detalle || `Venta Factura #${factura_id}`,
            categoria_gasto: esCeramica ? 'Venta Cerámica' : 'Venta General',
            referencia_tipo: 'venta',
            referencia_id: factura_id
        });
    }

    /**
     * Registra un egreso por compra de inventario (automático)
     */
    static async registrarGastoInventario(tenantId, { monto, insumo_nombre, mov_id, categoria_nombre }) {
        const sesion = await CajaRepository.getSesionAbierta(tenantId);

        return await FinanzasRepository.createMovimiento(tenantId, {
            sesion_id: sesion ? sesion.id : null,
            usuario_id: 1,
            tipo: 'salida',
            monto: monto,
            motivo: `Compra de insumo: ${insumo_nombre}`,
            categoria_gasto: categoria_nombre === 'Cerámicas' ? 'Inventario Cerámica' : 'Insumos Generales',
            referencia_tipo: 'compra_inventario',
            referencia_id: mov_id
        });
    }

    /**
     * Obtiene el resumen para el dashboard financiero
     */
    static async getDashboardData(tenantId, dias = 30) {
        const hoy = new Date();
        const inicio = new Date();
        inicio.setDate(hoy.getDate() - dias);

        const resumen = await FinanzasRepository.getResumenPeriodo(tenantId, inicio, hoy);
        const porCategoria = await FinanzasRepository.getPorCategoria(tenantId, 'salida', inicio, hoy);
        const historico = await FinanzasRepository.getHistoricoDiario(tenantId, inicio, hoy);

        // También obtener los últimos 10 movimientos para el "Libro Diario"
        const [movimientos] = await db.query(
            `SELECT * FROM caja_movimientos 
            WHERE tenant_id = ? 
            ORDER BY created_at DESC LIMIT 10`,
            [tenantId]
        );

        const ingresos = parseFloat((resumen || []).find(r => r.tipo === 'entrada')?.total) || 0;
        const egresos = parseFloat((resumen || []).find(r => r.tipo === 'salida')?.total) || 0;

        return {
            ingresos,
            egresos,
            utilidad: ingresos - egresos,
            gastosPorCategoria: porCategoria,
            historico,
            movimientos
        };
    }
}

module.exports = FinanzasService;
