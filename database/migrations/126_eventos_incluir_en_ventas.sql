-- Eventos: opción de incluir sus ventas en las ventas normales (ingresos, ganancias y estadísticas).
ALTER TABLE eventos ADD COLUMN incluir_en_ventas TINYINT(1) NOT NULL DEFAULT 0 COMMENT '1 = las ventas del evento cuentan como ventas normales. 0 = quedan aparte';
ALTER TABLE facturas ADD COLUMN evento_aparte TINYINT(1) NOT NULL DEFAULT 0 COMMENT '1 = factura de un evento que va aparte de las ventas normales (se mantiene al día con eventos.incluir_en_ventas)';
UPDATE facturas SET evento_aparte = 1 WHERE evento_id IS NOT NULL;
