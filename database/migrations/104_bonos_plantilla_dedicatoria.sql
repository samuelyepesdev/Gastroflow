-- 104_bonos_plantilla_dedicatoria.sql
-- Plantillas temáticas del comprobante de bonos (Día del Padre, Amor y Amistad,
-- Navidad, ... ver services/Tenant/BonoPlantillas.js) y dedicatoria opcional
-- impresa en el bono. Se guardan para poder regenerar el comprobante igual.
-- NULL en plantilla = 'clasico' (bonos emitidos antes de este cambio).
USE restaurante;

ALTER TABLE bonos
ADD COLUMN plantilla VARCHAR(30) NULL AFTER nota,
ADD COLUMN destinatario VARCHAR(60) NULL AFTER plantilla,
ADD COLUMN remitente VARCHAR(60) NULL AFTER destinatario,
ADD COLUMN mensaje VARCHAR(160) NULL AFTER remitente;
