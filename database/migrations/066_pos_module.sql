-- Módulo POS: permisos y tabla de órdenes guardadas
USE restaurante;

-- Permisos del módulo POS
INSERT IGNORE INTO permisos (nombre, descripcion) VALUES
('pos.ver',    'Ver y usar el terminal POS'),
('pos.vender', 'Realizar ventas en el terminal POS');

-- Asignar pos.ver y pos.vender al rol cajero (usando IDs)
INSERT IGNORE INTO rol_permisos (rol_id, permiso_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permisos p
WHERE r.nombre IN ('cajero', 'admin', 'superadmin')
  AND p.nombre IN ('pos.ver', 'pos.vender');

-- Tabla para órdenes guardadas/aparcadas en POS
CREATE TABLE IF NOT EXISTS pos_borradores (
    id             INT           PRIMARY KEY AUTO_INCREMENT,
    tenant_id      INT           NOT NULL,
    usuario_id     INT           NOT NULL,
    cliente_id     INT           DEFAULT NULL,
    nombre_cliente VARCHAR(255)  DEFAULT NULL,
    items          JSON          NOT NULL,
    total          DECIMAL(12,2) DEFAULT 0,
    notas          TEXT          DEFAULT NULL,
    created_at     TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
    updated_at     TIMESTAMP     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_pos_borradores_tenant_user (tenant_id, usuario_id)
);
