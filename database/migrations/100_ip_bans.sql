-- 100_ip_bans.sql
-- Baneos de IP por escaneo malicioso (patrones de vulnerabilidad: .env, .git,
-- wp-admin, etc. -- ver middleware en app.js e incidente 2026-09-20). Se
-- persiste aquí para sobrevivir a los redeploys de Railway: el bloqueo en
-- caliente vive en CacheService (memoria), y esta tabla es la fuente de
-- verdad que se recarga a memoria en cada arranque del proceso
-- (IpBanService.loadActiveBans, llamado desde app.js).
-- No es tenant-scoped: el baneo aplica a toda la plataforma, antes de
-- resolver tenant/usuario.
USE restaurante;

CREATE TABLE IF NOT EXISTS ip_bans (
    id INT AUTO_INCREMENT PRIMARY KEY,
    ip VARCHAR(45) NOT NULL,
    reason VARCHAR(255) NULL,
    hits INT NOT NULL DEFAULT 1,
    banned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL,
    UNIQUE KEY unique_ip_bans_ip (ip),
    INDEX idx_ip_bans_expires (expires_at)
);
