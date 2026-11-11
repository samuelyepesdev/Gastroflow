-- 128_asistente_chef.sql
-- Asistente "Chef" (fase 1): add-on por restaurante y configuracion del nombre.
-- Ojo: el runner parte el archivo por punto y coma, no lo uses dentro de comentarios ni textos.

-- 1. Add-on del catalogo. El precio queda en 0 y el superadmin lo ajusta desde /admin/planes.
INSERT IGNORE INTO addons (slug, nombre, descripcion, precio) VALUES
('asistente', 'Asistente Chef', 'Asistente de voz y texto para tomar pedidos y consultar mesas, menu y ventas', 0);

-- 2. Configuracion por restaurante (una fila por tenant).
CREATE TABLE IF NOT EXISTS asistente_config (
    tenant_id  INT NOT NULL PRIMARY KEY,
    nombre     VARCHAR(40) NOT NULL DEFAULT 'Chef',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_asistente_config_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);
