-- 068_modelo_impuestos.sql
-- Fase 1 del plan de Facturación Electrónica (Factus): desglose de impuestos.
-- Sin desglose de impuestos no hay factura electrónica válida ante DIAN.

-- 1. Tributo por defecto del tenant (según su régimen fiscal), usado para
--    precargar productos nuevos y como fallback en el cálculo de venta.
ALTER TABLE tenants
ADD COLUMN tributo_default ENUM('iva_19', 'iva_5', 'impoconsumo_8', 'exento', 'excluido')
    NOT NULL DEFAULT 'impoconsumo_8',
ADD COLUMN tasa_impuesto_default DECIMAL(5,2) NOT NULL DEFAULT 8.00;

UPDATE tenants SET tributo_default = 'iva_19', tasa_impuesto_default = 19.00
    WHERE regimen_fiscal = 'Responsable de IVA';
UPDATE tenants SET tributo_default = 'impoconsumo_8', tasa_impuesto_default = 8.00
    WHERE regimen_fiscal = 'Régimen Simple';
UPDATE tenants SET tributo_default = 'excluido', tasa_impuesto_default = 0.00
    WHERE regimen_fiscal = 'No responsable de IVA';

-- 2. Tributo por producto. NULL = usa el default del tenant.
ALTER TABLE productos
ADD COLUMN tributo ENUM('iva_19', 'iva_5', 'impoconsumo_8', 'exento', 'excluido') DEFAULT NULL,
ADD COLUMN tasa_impuesto DECIMAL(5,2) DEFAULT NULL;

-- 3. Desglose a nivel de factura. Los precios de carta se tratan como
--    "impuesto incluido"; subtotal/total_impuestos se calculan hacia atrás
--    a partir de `total` (que ya existía y se conserva).
ALTER TABLE facturas
ADD COLUMN subtotal DECIMAL(12,2) DEFAULT NULL,
ADD COLUMN descuento DECIMAL(12,2) NOT NULL DEFAULT 0.00,
ADD COLUMN total_impuestos DECIMAL(12,2) NOT NULL DEFAULT 0.00;

-- Backfill de facturas históricas: no se conoce el tributo real aplicado en
-- su momento, así que se registran sin impuesto (subtotal = total - propina).
UPDATE facturas SET subtotal = total - propina, total_impuestos = 0.00 WHERE subtotal IS NULL;

-- 4. Desglose por línea.
ALTER TABLE detalle_factura
ADD COLUMN base_gravable DECIMAL(12,2) DEFAULT NULL,
ADD COLUMN tasa_impuesto DECIMAL(5,2) DEFAULT NULL,
ADD COLUMN valor_impuesto DECIMAL(12,2) NOT NULL DEFAULT 0.00;

UPDATE detalle_factura SET base_gravable = subtotal, tasa_impuesto = 0.00 WHERE base_gravable IS NULL;
