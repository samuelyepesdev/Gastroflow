-- 124_fidelizacion_sello_por_producto.sql
-- El programa de sellos puede ganar el sello de dos maneras (se elige al configurarlo):
--   'monto'    -> cualquier venta con cliente cuyo total llegue al monto mínimo (comportamiento de siempre).
--   'producto' -> solo las ventas que incluyan el producto elegido de la carta.
-- Si ese producto se elimina, producto_id queda NULL y el programa deja de sellar hasta elegir otro.

ALTER TABLE fidelizacion_programas ADD COLUMN modo_sello ENUM('monto', 'producto') NOT NULL DEFAULT 'monto' AFTER monto_minimo;
ALTER TABLE fidelizacion_programas ADD COLUMN producto_id INT NULL AFTER modo_sello;
ALTER TABLE fidelizacion_programas ADD CONSTRAINT fk_fid_programa_producto FOREIGN KEY (producto_id) REFERENCES productos(id) ON DELETE SET NULL;
