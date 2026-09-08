-- Permiso para CONFIGURAR el check "pedir nota para cocina" en cada producto
-- (columna productos.pide_nota, toggle de la lista de Productos).
--
-- Antes esta accion se gateaba con 'productos.editar'; ahora tiene su propio
-- permiso para poder darlo o quitarlo por rol sin tocar la edicion de productos.
--
-- Compatibilidad: hasta ahora cualquier usuario con 'productos.editar' podia
-- activarlo, asi que el permiso se asigna a TODOS los roles existentes para no
-- quitarle la funcion a nadie. Cada restaurante lo revoca por rol desde el
-- panel de Permisos cuando quiera limitarlo.
USE restaurante;

INSERT INTO permisos (nombre, descripcion) VALUES
('productos.pide_nota', 'Activar/desactivar "pedir nota para cocina" en cada producto')
ON DUPLICATE KEY UPDATE descripcion = VALUES(descripcion);

INSERT INTO rol_permisos (rol_id, permiso_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permisos p
WHERE p.nombre = 'productos.pide_nota'
ON DUPLICATE KEY UPDATE rol_id = rol_id;
