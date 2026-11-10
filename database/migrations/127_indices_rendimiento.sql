-- Índices de rendimiento detectados en la prueba de carga (60k facturas / 12k pedidos).
-- pedidos: cocina y mesas filtran por tenant + estado abierto; antes recorrían todo el histórico cerrado.
ALTER TABLE pedidos ADD INDEX idx_pedidos_tenant_estado (tenant_id, estado, mesa_id);
-- facturas: los totales/series de ventas filtran por tenant + evento_aparte + rango de fecha.
ALTER TABLE facturas ADD INDEX idx_facturas_tenant_aparte_fecha (tenant_id, evento_aparte, fecha, total);
-- clientes: el listado y la búsqueda ordenan por nombre dentro del tenant.
ALTER TABLE clientes ADD INDEX idx_clientes_tenant_nombre (tenant_id, nombre);
