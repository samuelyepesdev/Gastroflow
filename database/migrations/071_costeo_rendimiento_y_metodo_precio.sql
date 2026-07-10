-- 071_costeo_rendimiento_y_metodo_precio.sql
-- Fase 2 de la corrección de Costeo: rendimiento real por insumo (merma de limpieza/cocción)
-- y desacople del método de fijación de precio respecto al método de costo indirecto.
-- Antes: metodo_indirectos ENUM('porcentaje','costo_fijo','factor') se usaba para dos
-- decisiones distintas (cómo calcular el costo indirecto Y cómo fijar el precio), lo que
-- causaba que 'factor' no tuviera manejo en el cálculo de costo indirecto (bug real).

USE restaurante;

-- Rendimiento neto del insumo (% utilizable tras limpiar/pelar/cocinar). 100 = sin merma.
ALTER TABLE insumos ADD COLUMN rendimiento_pct DECIMAL(5,2) NOT NULL DEFAULT 100
    COMMENT 'Rendimiento neto: % del insumo comprado que queda utilizable (peso neto / peso bruto x 100)'
    AFTER unidad_base;

-- Método de fijación de precio, independiente del método de costeo indirecto.
ALTER TABLE configuracion_costeo ADD COLUMN metodo_precio ENUM('margen','factor') NOT NULL DEFAULT 'margen'
    AFTER metodo_indirectos;

-- Migrar configuraciones existentes que usaban 'factor' como metodo_indirectos (donde el
-- costo indirecto quedaba silenciosamente en 0): pasan su método de precio a 'factor' y
-- su método de costo indirecto vuelve al default 'porcentaje'.
UPDATE configuracion_costeo
SET metodo_precio = 'factor', metodo_indirectos = 'porcentaje'
WHERE metodo_indirectos = 'factor';
