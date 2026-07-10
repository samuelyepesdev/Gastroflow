-- 070_facturas_electronicas.sql
-- Fase 3 del plan de Facturación Electrónica (Factus): resultado de la emisión
-- ante DIAN por factura interna. El worker de emisión procesa esta cola.

CREATE TABLE IF NOT EXISTS facturas_electronicas (
    id                  INT AUTO_INCREMENT PRIMARY KEY,
    factura_id          INT NOT NULL,
    tenant_id           INT NOT NULL,
    numero_fe           VARCHAR(50) DEFAULT NULL,
    cufe                VARCHAR(255) DEFAULT NULL,
    qr_data             TEXT DEFAULT NULL,
    xml_blob            LONGBLOB DEFAULT NULL,
    pdf_blob            LONGBLOB DEFAULT NULL,
    estado              ENUM('pendiente', 'emitida', 'rechazada', 'error') NOT NULL DEFAULT 'pendiente',
    errores             TEXT DEFAULT NULL,
    intentos            INT NOT NULL DEFAULT 0,
    proximo_intento     TIMESTAMP NULL DEFAULT NULL,
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    UNIQUE KEY uk_fe_factura (factura_id),
    KEY idx_fe_estado_intento (estado, proximo_intento),
    CONSTRAINT fk_fe_factura FOREIGN KEY (factura_id) REFERENCES facturas(id) ON DELETE CASCADE,
    CONSTRAINT fk_fe_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);
