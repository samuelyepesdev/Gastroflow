-- 131_reservas_elegir_mesa.sql
-- Reservas con mesa elegida por el cliente (opcional por restaurante).
-- mesas.capacidad: personas que caben (NULL = sin definir, la mesa no se ofrece en la pagina publica).
-- reserva_config.elegir_mesa: 1 = la pagina publica pide elegir una mesa libre a esa hora, 0 = reserva por aforo.

ALTER TABLE mesas ADD COLUMN capacidad INT NULL;

ALTER TABLE reserva_config ADD COLUMN elegir_mesa TINYINT(1) NOT NULL DEFAULT 0 AFTER auto_confirmar;
