-- 137_calculadora_leads.sql
-- Contactos que dejan los dueños de restaurantes al usar la calculadora pública de pérdidas.
-- Guarda las cifras que ingresaron y el resultado, más la evidencia del consentimiento
-- (Ley 1581 de 2012: fecha e IP). No pertenece a ningún tenant: son prospectos.

CREATE TABLE IF NOT EXISTS calculadora_leads (
    id INT AUTO_INCREMENT PRIMARY KEY,
    restaurante VARCHAR(80) NOT NULL,
    telefono VARCHAR(16) NOT NULL,
    email VARCHAR(120) NULL,
    entradas JSON NOT NULL,
    perdida_mes BIGINT NOT NULL DEFAULT 0,
    recuperable_mes BIGINT NOT NULL DEFAULT 0,
    consentimiento_at DATETIME NOT NULL,
    consentimiento_ip VARCHAR(45) NULL,
    contactado TINYINT(1) NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_calculadora_leads_created (created_at),
    KEY idx_calculadora_leads_telefono (telefono)
);
