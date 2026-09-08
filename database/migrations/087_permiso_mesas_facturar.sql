-- Permiso para FACTURAR / cobrar un pedido desde el módulo de Mesas.
-- Sin este permiso, el panel del pedido solo muestra "Enviar a Cocina"
-- (se ocultan Facturar, Descuento, Propina y Servicio).
--
-- Compatibilidad: hasta ahora cualquier usuario con acceso a Mesas podía
-- facturar, así que el permiso se asigna a TODOS los roles existentes para no
-- quitarle la función a nadie. Cada restaurante lo revoca por rol desde el
-- panel de Permisos cuando quiera limitarlo (ej. meseros que solo toman el
-- pedido y no cobran).
USE restaurante;

INSERT INTO permisos (nombre, descripcion) VALUES
('mesas.facturar', 'Facturar y cobrar pedidos desde Mesas (además de aplicar descuento, propina y servicio)')
ON DUPLICATE KEY UPDATE descripcion = VALUES(descripcion);

INSERT INTO rol_permisos (rol_id, permiso_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permisos p
WHERE p.nombre = 'mesas.facturar'
ON DUPLICATE KEY UPDATE rol_id = rol_id;
