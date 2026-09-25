-- 102_bonos_imagen_url.sql
-- Comprobante visual del bono (PDF tipo "gift card" con código, valor y QR,
-- ver BonoComprobanteService), generado al emitirlo y subido a Cloudflare R2
-- (carpeta 'bonos/'). Se guarda la URL para poder reimprimirlo o reenviarlo
-- sin regenerarlo. NULL para bonos emitidos antes de este cambio, o si la
-- generación falló (no bloqueante -- el bono se emite igual).
USE restaurante;

ALTER TABLE bonos
ADD COLUMN imagen_url VARCHAR(500) NULL AFTER nota;
