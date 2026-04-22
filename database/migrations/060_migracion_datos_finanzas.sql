-- 060_migracion_datos_finanzas.sql
-- Migra datos históricos y ajusta sesion_id para permitir movimientos sin sesión abierta

USE restaurante;

-- 1. Ajustar sesion_id para permitir NULL (Importante para movimientos manuales o históricos)
ALTER TABLE caja_movimientos MODIFY COLUMN sesion_id INT NULL;

-- 2. Migrar Facturas Antiguas (Ingresos)
INSERT INTO caja_movimientos (tenant_id, usuario_id, tipo, monto, motivo, categoria_gasto, referencia_tipo, referencia_id, created_at)
SELECT 
    f.tenant_id, 
    1, 
    'entrada', 
    f.total, 
    CONCAT('Sincronización: Factura #', f.id),
    'Venta General',
    'venta',
    f.id,
    f.fecha
FROM facturas f
WHERE NOT EXISTS (
    SELECT 1 FROM caja_movimientos cm 
    WHERE cm.referencia_tipo = 'venta' AND cm.referencia_id = f.id
);

-- 3. Migrar Compras de Inventario Antiguas (Egresos)
INSERT INTO caja_movimientos (tenant_id, usuario_id, tipo, monto, motivo, categoria_gasto, referencia_tipo, referencia_id, created_at)
SELECT 
    m.tenant_id, 
    1, 
    'salida', 
    (m.cantidad * m.costo_unitario), 
    CONCAT('Sincronización: Compra Insumo ID ', m.insumo_id),
    'Inventario',
    'compra_inventario',
    m.id,
    m.created_at
FROM movimientos_inventario m
WHERE m.tipo = 'entrada' 
AND m.costo_unitario > 0
AND NOT EXISTS (
    SELECT 1 FROM caja_movimientos cm 
    WHERE cm.referencia_tipo = 'compra_inventario' AND cm.referencia_id = m.id
);
