-- Descuento por línea expresado en pesos (monto fijo), alternativa a
-- descuento_porcentaje. Una línea usa uno u otro, nunca ambos:
--   descuento_porcentaje NOT NULL  -> descuento en %
--   descuento_valor      NOT NULL  -> descuento en $ (monto fijo sobre la línea)
--   ambos NULL                     -> sin descuento
-- precio_unitario y subtotal siguen guardando el valor YA con descuento;
-- precio_original guarda el precio de catálogo antes del descuento.
ALTER TABLE detalle_factura
ADD COLUMN descuento_valor DECIMAL(12,2) NULL DEFAULT NULL
COMMENT 'Descuento en pesos aplicado a esta línea (monto fijo). Excluyente con descuento_porcentaje.'
AFTER descuento_porcentaje;
