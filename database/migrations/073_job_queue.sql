-- Cola genérica de trabajos async (PDF pesados, envío de email) que replica el patrón
-- ya probado en facturas_electronicas + node-cron: nunca bloquea el request, un worker
-- por intervalo procesa lo pendiente con reintento y backoff.
CREATE TABLE IF NOT EXISTS job_queue (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tipo VARCHAR(50) NOT NULL,
    tenant_id INT NULL,
    payload JSON NOT NULL,
    estado ENUM('pendiente', 'procesando', 'completado', 'error') NOT NULL DEFAULT 'pendiente',
    intentos INT NOT NULL DEFAULT 0,
    error TEXT NULL,
    resultado_path VARCHAR(255) NULL,
    proximo_intento TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_job_queue_estado (estado, proximo_intento, created_at)
);
