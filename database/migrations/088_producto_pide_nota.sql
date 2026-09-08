-- Marca por producto: al pedirlo en Mesas (o POS) se abre el modal de "Nota
-- para cocina" antes de agregarlo. Reemplaza el chequeo fijo por categoria
-- "Comidas" por una opcion que el restaurante activa producto por producto
-- desde la lista de Productos.
USE restaurante;

ALTER TABLE productos
ADD COLUMN pide_nota TINYINT(1) NOT NULL DEFAULT 0
COMMENT 'Si es 1, al pedir el producto se solicita una nota para cocina.'
AFTER es_favorito;

-- Sembrado: los productos que hoy ya piden nota por estar en la categoria
-- "Comidas" quedan con el check activado, para no cambiar el comportamiento.
UPDATE productos p
JOIN categorias c ON c.id = p.categoria_id
SET p.pide_nota = 1
WHERE LOWER(TRIM(c.nombre)) = 'comidas';
