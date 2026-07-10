-- 069_facturacion_electronica_fiscal.sql
-- Fase 2 del plan de Facturación Electrónica (Factus): configuración fiscal por tenant.
-- Funcionalidad core del sistema (no depende del catálogo de addons).

CREATE TABLE IF NOT EXISTS tenant_facturacion_electronica (
    id                          INT AUTO_INCREMENT PRIMARY KEY,
    tenant_id                   INT NOT NULL,
    proveedor                   VARCHAR(30) NOT NULL DEFAULT 'factus',
    ambiente                    ENUM('sandbox', 'produccion') NOT NULL DEFAULT 'sandbox',
    estado                      ENUM('deshabilitado', 'pruebas', 'activo') NOT NULL DEFAULT 'deshabilitado',

    -- Credenciales OAuth2 (password grant). Se guardan cifradas con CryptoService (AES-256-GCM).
    client_id                   VARCHAR(255) DEFAULT NULL,
    client_secret_enc           TEXT DEFAULT NULL,
    api_usuario                 VARCHAR(150) DEFAULT NULL,
    api_password_enc            TEXT DEFAULT NULL,

    -- Datos fiscales requeridos por Factus para emitir a nombre del tenant
    codigo_municipio_dane       VARCHAR(10) DEFAULT NULL,
    tipo_organizacion           VARCHAR(50) DEFAULT NULL,

    -- Rango de numeración activo (sincronizado vía GET numbering-ranges de Factus)
    numbering_range_id          VARCHAR(50) DEFAULT NULL,
    numbering_range_prefijo     VARCHAR(10) DEFAULT NULL,
    numbering_range_desde       INT DEFAULT NULL,
    numbering_range_hasta       INT DEFAULT NULL,
    numbering_range_vigencia_hasta DATE DEFAULT NULL,

    ultima_verificacion         TIMESTAMP NULL DEFAULT NULL,
    ultimo_error                TEXT DEFAULT NULL,

    created_at                  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at                  TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    UNIQUE KEY uk_tenant_fe (tenant_id),
    CONSTRAINT fk_tenant_fe_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);
