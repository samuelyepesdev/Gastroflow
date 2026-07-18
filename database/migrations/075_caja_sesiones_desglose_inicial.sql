-- 075_caja_sesiones_desglose_inicial.sql
-- CajaRepository.abrirSesion/cerrarSesion (repositories/Tenant/CajaRepository.js) leen y
-- escriben monto_inicial_efectivo y monto_inicial_transferencia, pero 048_caja_y_arqueos.sql
-- solo creó la columna agregada monto_inicial. Nunca hubo migración para las columnas
-- desglosadas: abrir turno de caja fallaba con "Unknown column 'monto_inicial_efectivo'".

USE restaurante;

ALTER TABLE caja_sesiones
    ADD COLUMN monto_inicial_efectivo DECIMAL(15, 2) NOT NULL DEFAULT 0 COMMENT 'Base inicial en efectivo' AFTER monto_inicial,
    ADD COLUMN monto_inicial_transferencia DECIMAL(15, 2) NOT NULL DEFAULT 0 COMMENT 'Base inicial en transferencia' AFTER monto_inicial_efectivo;
