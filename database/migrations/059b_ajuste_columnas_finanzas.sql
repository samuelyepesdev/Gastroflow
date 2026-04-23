-- 059b_ajuste_columnas_finanzas.sql
-- Agrega columnas necesarias para el módulo de finanzas en caja_movimientos
-- Este script soluciona el error de 'Unknown column categoria_gasto'

USE restaurante;

-- 1. Permitir que sesion_id sea NULL (necesario para movimientos automáticos fuera de un turno)
ALTER TABLE caja_movimientos MODIFY COLUMN sesion_id INT NULL;

-- 2. Agregar columnas de categorización y referencia
-- Si ya existen, el script de migraciones ignorará el error ER_DUP_FIELDNAME
ALTER TABLE caja_movimientos ADD COLUMN categoria_gasto VARCHAR(50) NULL AFTER motivo;
ALTER TABLE caja_movimientos ADD COLUMN referencia_tipo VARCHAR(30) NULL AFTER categoria_gasto;
ALTER TABLE caja_movimientos ADD COLUMN referencia_id INT NULL AFTER referencia_tipo;
