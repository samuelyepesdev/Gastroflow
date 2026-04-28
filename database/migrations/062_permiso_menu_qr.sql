-- Migración para añadir el permiso de gestión de Menú QR (mesas.qr)

-- 1. Insertar el permiso si no existe
INSERT IGNORE INTO permisos (nombre, descripcion)
VALUES ('mesas.qr', 'Generar e imprimir códigos QR para las mesas');

-- 2. Asignar el permiso a los roles 'admin' y 'superadmin' por defecto
INSERT IGNORE INTO rol_permisos (rol_id, permiso_id)
SELECT r.id, p.id
FROM roles r
JOIN permisos p ON p.nombre = 'mesas.qr'
WHERE r.nombre IN ('admin', 'superadmin');
