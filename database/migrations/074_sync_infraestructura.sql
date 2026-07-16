-- Infraestructura para sincronización desktop (Electron, offline) <-> producción.
-- clientes es la única tabla de catálogo sincronizable que no tenía updated_at
-- (usuarios, mesas, productos, categorias y servicios ya lo tenían).
ALTER TABLE clientes ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;

-- Idempotencia del push: si el desktop reintenta subir una operación porque no
-- vio la respuesta (ej. se cayó la conexión justo después de aplicarse), el
-- client_uuid ya registrado evita procesarla dos veces.
-- `action` identifica qué Service.execute() se ejecutó (ej. "pedido_items.agregar"),
-- no una tabla cruda: el push reusa los mismos *Service ya existentes.
CREATE TABLE IF NOT EXISTS sync_operations_log (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tenant_id INT NOT NULL,
    client_uuid CHAR(36) NOT NULL,
    action VARCHAR(100) NOT NULL,
    server_entity_id INT NULL,
    status ENUM('applied', 'conflict', 'error') NOT NULL,
    applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_tenant_client_uuid (tenant_id, client_uuid),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

-- Cola local de cambios pendientes de subir. Solo tiene sentido en la BD local
-- del desktop (en producción queda creada pero vacía y sin uso); se crea vía
-- la misma migración compartida para no mantener dos esquemas distintos.
CREATE TABLE IF NOT EXISTS sync_outbox (
    id INT AUTO_INCREMENT PRIMARY KEY,
    client_uuid CHAR(36) NOT NULL UNIQUE,
    action VARCHAR(100) NOT NULL,
    params JSON NOT NULL,
    status ENUM('pending', 'syncing', 'synced', 'conflict', 'error') DEFAULT 'pending',
    attempts INT DEFAULT 0,
    last_error TEXT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    synced_at TIMESTAMP NULL
);

-- Cursor de la última sincronización exitosa (una sola fila; el desktop es de
-- un solo tenant). Igual que sync_outbox, solo se usa en el local.
CREATE TABLE IF NOT EXISTS sync_meta (
    id INT PRIMARY KEY DEFAULT 1,
    last_pull_at TIMESTAMP NULL,
    last_push_at TIMESTAMP NULL
);
