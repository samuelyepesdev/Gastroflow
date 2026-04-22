-- 058_ajuste_caja_para_finanzas.sql
-- Registro de temas y parámetros para el módulo financiero

USE restaurante;

-- Las columnas e índices ya existen. Solo insertamos la configuración inicial.
INSERT INTO temas (tenant_id, name, status) 
SELECT 1, 'CATEGORIAS DE FINANZAS', 1
WHERE NOT EXISTS (SELECT 1 FROM temas WHERE name = 'CATEGORIAS DE FINANZAS' AND tenant_id = 1);
