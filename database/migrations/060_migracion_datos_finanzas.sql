-- 060_migracion_datos_finanzas.sql
-- Migra datos históricos de facturas e inventario

USE restaurante;

-- 1. Migración de Facturas (Ingresos)
-- Solo insertamos si la factura NO está ya en caja_movimientos
INSERT INTO caja_movimientos (tenant_id, sesion_id, usuario_id, tipo, monto, motivo, categoria_gasto, referencia_tipo, referencia_id, created_at)
SELECT 
    f.tenant_id, 
    f.caja_sesion_id, 
    1, 
    'entrada', 
    f.total, 
    CONCAT('Migración: Venta Factura #', COALESCE(f.numero, f.id)),
    'Venta General',
    'venta',
    f.id,
    f.fecha
FROM facturas f
WHERE NOT EXISTS (
    SELECT 1 FROM caja_movimientos cm 
    WHERE cm.referencia_tipo = 'venta' AND cm.referencia_id = f.id
);

-- 2. Migración de Movimientos de Inventario (Egresos)
-- Solo insertamos si el movimiento de inventario NO está ya en caja_movimientos
INSERT INTO caja_movimientos (tenant_id, sesion_id, usuario_id, tipo, monto, motivo, categoria_gasto, referencia_tipo, referencia_id, created_at)
SELECT 
    m.tenant_id, 
    NULL, 
    1, 
    'salida', 
    (m.cantidad * m.costo_unitario), 
    CONCAT('Migración: Compra ', i.nombre),
    'Inventario',
    'compra_inventario',
    m.id,
    m.created_at
FROM movimientos_inventario m
JOIN insumos i ON m.insumo_id = i.id
WHERE m.tipo = 'entrada' AND m.costo_unitario > 0
AND NOT EXISTS (
    SELECT 1 FROM caja_movimientos cm 
    WHERE cm.referencia_tipo = 'compra_inventario' AND cm.referencia_id = m.id
);
