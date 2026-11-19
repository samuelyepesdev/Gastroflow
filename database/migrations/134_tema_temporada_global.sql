-- 134_tema_temporada_global.sql
-- Look de temporada activado por el superadmin: una configuracion global (para todos los restaurantes)
-- y una decision opcional por restaurante.
-- tema_temporada.activo pasa a admitir NULL = "sin decidir": el restaurante hereda lo global.
-- 1 = activado y 0 = apagado a proposito (lo decide el restaurante o lo fuerza el superadmin) y siempre prevalece sobre lo global.

CREATE TABLE IF NOT EXISTS tema_temporada_global (
    id TINYINT NOT NULL PRIMARY KEY,
    tema VARCHAR(20) NOT NULL DEFAULT 'navidad',
    activo TINYINT(1) NOT NULL DEFAULT 0,
    desde DATE NULL,
    hasta DATE NULL,
    mensaje VARCHAR(160) NULL,
    animaciones TINYINT(1) NOT NULL DEFAULT 1,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

INSERT IGNORE INTO tema_temporada_global (id) VALUES (1);

ALTER TABLE tema_temporada MODIFY COLUMN activo TINYINT(1) NULL DEFAULT NULL;
