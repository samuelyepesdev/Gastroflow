-- 138_resenas.sql
-- Reseñas de clientes: configuración por restaurante y calificaciones recibidas desde la página pública.
-- La página pública se abre con un token aleatorio del restaurante (como las reservas).
-- El enlace de Google es opcional y siempre se ofrece a todos los clientes, sin importar la calificación.
-- Si el cliente deja sus datos de contacto se guarda la evidencia del consentimiento (Ley 1581 de 2012).

CREATE TABLE IF NOT EXISTS resena_config (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tenant_id INT NOT NULL,
    activo TINYINT(1) NOT NULL DEFAULT 0,
    token_publico VARCHAR(48) NULL,
    google_url VARCHAR(500) NULL,
    mensaje_gracias VARCHAR(200) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_resena_config_tenant (tenant_id),
    UNIQUE KEY uq_resena_config_token (token_publico),
    CONSTRAINT fk_resena_config_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS resenas (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tenant_id INT NOT NULL,
    calificacion TINYINT NOT NULL,
    comentario VARCHAR(500) NULL,
    nombre VARCHAR(80) NULL,
    telefono VARCHAR(16) NULL,
    estado ENUM('nueva', 'atendida') NOT NULL DEFAULT 'nueva',
    consentimiento_at DATETIME NULL,
    consentimiento_ip VARCHAR(45) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_resenas_tenant_fecha (tenant_id, created_at),
    KEY idx_resenas_tenant_estado (tenant_id, estado),
    CONSTRAINT fk_resenas_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);
