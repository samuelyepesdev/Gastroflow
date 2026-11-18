-- 132_mesas_capacidad_por_defecto.sql
-- Cada mesa nueva queda con capacidad 4 y las mesas existentes sin capacidad pasan a 4.
-- El administrador la ajusta por mesa en Reservas, Configurar. NULL sigue siendo valido: la mesa no se ofrece al publico.

ALTER TABLE mesas MODIFY COLUMN capacidad INT NULL DEFAULT 4;

UPDATE mesas SET capacidad = 4 WHERE capacidad IS NULL;
