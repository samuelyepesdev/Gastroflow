-- 135_tema_temporada_panel.sql
-- El look de temporada tambien puede verse dentro de los paneles del sistema (panel de cada local y panel del superadmin).
-- panel = 1: se muestra en los paneles. panel = 0: solo en las paginas publicas (reservas y menu QR).
-- Si cualquiera de los dos (restaurante o global) lo apaga, no se ve en el panel de ese restaurante.

ALTER TABLE tema_temporada ADD COLUMN panel TINYINT(1) NOT NULL DEFAULT 1;

ALTER TABLE tema_temporada_global ADD COLUMN panel TINYINT(1) NOT NULL DEFAULT 1;
