-- 110_combos.sql
-- Combos fijos a precio fijo: un combo ES un producto (productos.es_combo = 1)
-- con su propio precio, categoría (que define la estación de cocina) e impuesto,
-- más una lista fija de productos componentes. Se vende como una sola línea de
-- pedido/factura; los componentes solo se usan para descontar inventario
-- (receta de cada componente x cantidad) al facturar.
--
-- Sin permiso de plan (requirePlanFeature): disponible en todos los planes,
-- igual que Promociones/Bonos. Gestionar requiere permiso.
USE restaurante;

ALTER TABLE productos ADD COLUMN es_combo TINYINT(1) NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS combo_componentes (
    combo_id INT NOT NULL,
    producto_id INT NOT NULL,
    cantidad DECIMAL(10, 2) NOT NULL DEFAULT 1,
    PRIMARY KEY (combo_id, producto_id),
    FOREIGN KEY (combo_id) REFERENCES productos(id) ON DELETE CASCADE,
    FOREIGN KEY (producto_id) REFERENCES productos(id) ON DELETE CASCADE
);

INSERT INTO permisos (nombre, descripcion) VALUES
('combos.ver', 'Ver combos configurados'),
('combos.gestionar', 'Crear, editar y eliminar combos')
ON DUPLICATE KEY UPDATE descripcion = VALUES(descripcion);

INSERT INTO rol_permisos (rol_id, permiso_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permisos p
WHERE r.nombre IN ('admin', 'superadmin') AND p.nombre IN ('combos.ver', 'combos.gestionar')
ON DUPLICATE KEY UPDATE rol_id = rol_id;
