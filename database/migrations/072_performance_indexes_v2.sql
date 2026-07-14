-- Segunda pasada de índices de performance (audit de queries repositorio por repositorio).
-- movimientos_inventario: tabla de solo-crecimiento consultada en cada chequeo de stock
-- (WHERE tenant_id = ? [AND insumo_id = ?] ORDER BY created_at DESC). Sin este índice
-- compuesto, MySQL solo puede usar el índice single-column implícito de la FK.
ALTER TABLE movimientos_inventario ADD INDEX idx_movinv_tenant_insumo_fecha (tenant_id, insumo_id, created_at);

-- pedido_items: cola de cocina en tiempo real (join con pedidos + filtro por pi.estado).
ALTER TABLE pedido_items ADD INDEX idx_pedido_items_tenant_estado (tenant_id, estado);

-- pedidos: pedidos abiertos por mesa (WHERE mesa_id = ? AND estado NOT IN (...)).
ALTER TABLE pedidos ADD INDEX idx_pedidos_mesa_estado (mesa_id, estado);

-- usuarios: listado de usuarios activos por tenant.
ALTER TABLE usuarios ADD INDEX idx_usuarios_tenant_activo (tenant_id, activo);

-- facturas: estadísticas de ventas filtran por tenant_id + evento_id IS NULL + rango de fecha.
-- Este índice cubre ese patrón mejor que idx_facturas_tenant_fecha (que no incluye evento_id).
ALTER TABLE facturas ADD INDEX idx_facturas_tenant_evento_fecha (tenant_id, evento_id, fecha);

-- Cleanup: índices single-column redundantes de la migración 065, cubiertos por el prefijo
-- de índices únicos ya existentes (unique_producto_tenant_codigo y la FK-implícita de clientes).
ALTER TABLE productos DROP INDEX idx_productos_tenant;
ALTER TABLE clientes DROP INDEX idx_clientes_tenant;
