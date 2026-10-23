-- 123_user_permisos_excepciones.sql
-- user_permisos deja de ser una foto completa de los permisos del usuario y pasa a guardar solo
-- excepciones sobre su rol: conceder (suma un permiso) o denegar (quita uno del rol).
-- Permisos efectivos = permisos de sus roles + concedidos - denegados. Así un permiso nuevo
-- agregado al rol llega a todos los usuarios, salvo a quien lo tenga denegado a propósito.
--
-- Las fotos actuales se convierten sin cambiar lo que cada usuario puede hacer hoy.
-- Concedidos = lo que tenía y su rol no da. Denegados = lo que su rol da y no tenía.
-- Copia de seguridad de las fotos originales en user_permisos_respaldo_123.

CREATE TABLE IF NOT EXISTS user_permisos_respaldo_123 LIKE user_permisos;

INSERT IGNORE INTO user_permisos_respaldo_123 (user_id, permiso_id) SELECT user_id, permiso_id FROM user_permisos;

ALTER TABLE user_permisos ADD COLUMN efecto ENUM('conceder', 'denegar') NOT NULL DEFAULT 'conceder' AFTER permiso_id;

DELETE FROM user_permisos;

INSERT INTO user_permisos (user_id, permiso_id, efecto)
SELECT s.user_id, s.permiso_id, 'conceder'
FROM user_permisos_respaldo_123 s
WHERE NOT EXISTS (
    SELECT 1
    FROM (SELECT id AS user_id, rol_id FROM usuarios UNION SELECT user_id, rol_id FROM usuario_roles) ur
    INNER JOIN rol_permisos rp ON rp.rol_id = ur.rol_id
    WHERE ur.user_id = s.user_id AND rp.permiso_id = s.permiso_id
);

INSERT INTO user_permisos (user_id, permiso_id, efecto)
SELECT DISTINCT ur.user_id, rp.permiso_id, 'denegar'
FROM (SELECT id AS user_id, rol_id FROM usuarios UNION SELECT user_id, rol_id FROM usuario_roles) ur
INNER JOIN rol_permisos rp ON rp.rol_id = ur.rol_id
WHERE ur.user_id IN (SELECT user_id FROM user_permisos_respaldo_123)
  AND NOT EXISTS (
    SELECT 1 FROM user_permisos_respaldo_123 s WHERE s.user_id = ur.user_id AND s.permiso_id = rp.permiso_id
  );
