-- 059_permisos_finanzas.sql
-- Registra el permiso de finanzas y lo asigna a administradores

USE restaurante;

-- 1. Crear el permiso
INSERT INTO permisos (nombre, descripcion) VALUES
('finanzas.ver', 'Ver dashboard de gastos y ganancias')
ON DUPLICATE KEY UPDATE descripcion = VALUES(descripcion);

-- 2. Asignar permiso a roles admin y superadmin
INSERT INTO rol_permisos (rol_id, permiso_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permisos p
WHERE r.nombre IN ('admin','superadmin') AND p.nombre = 'finanzas.ver'
ON DUPLICATE KEY UPDATE rol_id = rol_id;
