-- 133_tema_temporada.sql
-- Tema visual de temporada (Navidad) por restaurante: se muestra en la pagina publica de reservas y en el menu QR.
-- Se activa con el interruptor y, si hay fechas, solo dentro de la ventana (desde y hasta son dias de Colombia, inclusive).
-- animaciones = 0 deja el tema sin movimiento (nieve, parpadeo, confeti).

CREATE TABLE IF NOT EXISTS tema_temporada (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tenant_id INT NOT NULL,
    tema VARCHAR(20) NOT NULL DEFAULT 'navidad',
    activo TINYINT(1) NOT NULL DEFAULT 0,
    desde DATE NULL,
    hasta DATE NULL,
    mensaje VARCHAR(160) NULL,
    animaciones TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_tema_temporada_tenant (tenant_id),
    CONSTRAINT fk_tema_temporada_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);
