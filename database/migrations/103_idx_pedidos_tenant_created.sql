-- 103_idx_pedidos_tenant_created.sql
-- Numeración diaria de pedidos (AbrirPedidoService, POSRepository, PedidoQRService):
-- SELECT MAX(numero) ... WHERE tenant_id = ? AND created_at >= <inicio del día Colombia>.
-- Sin este índice, MySQL recorre todos los pedidos históricos del tenant en cada
-- mesa/pedido abierto; y en POS (SELECT ... FOR UPDATE) bloqueaba ese rango completo.
ALTER TABLE pedidos ADD INDEX idx_pedidos_tenant_created (tenant_id, created_at);
