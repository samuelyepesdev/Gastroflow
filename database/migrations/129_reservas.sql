-- 129_reservas.sql
-- Reservas V1 (sin anticipo en línea): configuración por restaurante y reservas.
-- La disponibilidad se calcula por aforo (personas simultáneas), no por mesa: la mesa es opcional.
-- La reserva pública guarda la evidencia del consentimiento (Ley 1581 de 2012: fecha, origen e IP).
-- fecha y hora_inicio son hora de pared de Colombia (DATE / TIME), no UTC.

CREATE TABLE IF NOT EXISTS reserva_config (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tenant_id INT NOT NULL,
    activo TINYINT(1) NOT NULL DEFAULT 0,
    token_publico VARCHAR(48) NULL,
    aforo_maximo INT NOT NULL DEFAULT 40 COMMENT 'Personas simultaneas que caben en el local',
    duracion_min INT NOT NULL DEFAULT 90 COMMENT 'Minutos que ocupa una reserva',
    intervalo_min INT NOT NULL DEFAULT 30 COMMENT 'Separacion entre horarios ofrecidos',
    hora_apertura TIME NOT NULL DEFAULT '12:00:00',
    hora_ultima TIME NOT NULL DEFAULT '21:00:00' COMMENT 'Ultima hora de inicio de una reserva',
    anticipacion_min_horas INT NOT NULL DEFAULT 2,
    dias_max_adelanto INT NOT NULL DEFAULT 60,
    max_personas_reserva INT NOT NULL DEFAULT 12,
    auto_confirmar TINYINT(1) NOT NULL DEFAULT 0,
    mensaje_publico VARCHAR(300) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_reserva_config_tenant (tenant_id),
    UNIQUE KEY uq_reserva_config_token (token_publico),
    CONSTRAINT fk_reserva_config_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS reservas (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tenant_id INT NOT NULL,
    nombre VARCHAR(80) NOT NULL,
    telefono VARCHAR(16) NOT NULL,
    email VARCHAR(120) NULL,
    personas INT NOT NULL,
    fecha DATE NOT NULL,
    hora_inicio TIME NOT NULL,
    duracion_min INT NOT NULL DEFAULT 90,
    estado ENUM('pendiente', 'confirmada', 'sentada', 'cancelada', 'no_show') NOT NULL DEFAULT 'pendiente',
    mesa_id INT NULL,
    notas VARCHAR(300) NULL,
    ocasion VARCHAR(40) NULL,
    origen ENUM('publica', 'interna') NOT NULL DEFAULT 'interna',
    consentimiento_at TIMESTAMP NULL,
    consentimiento_ip VARCHAR(45) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY idx_reservas_tenant_fecha (tenant_id, fecha, hora_inicio),
    KEY idx_reservas_tenant_telefono (tenant_id, telefono),
    CONSTRAINT fk_reservas_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);
