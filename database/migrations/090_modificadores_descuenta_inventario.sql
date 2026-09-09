-- 090_modificadores_descuenta_inventario.sql
-- Permite que un grupo de modificadores/toppings descuente inventario al vender.
-- Es opt-in por grupo (columna descuenta_inventario): quien use modificadores sin
-- inventario no ve ningun cambio. Cada opcion ya podia enlazarse a un insumo
-- (migracion 077: opciones_modificador.insumo_id / cantidad_insumo / unidad_insumo);
-- aqui se agrega el flag del grupo y las columnas de SNAPSHOT del insumo en las
-- lineas de venta, para que el descuento y el historico de consumo no dependan de
-- que la opcion del catalogo siga existiendo o sin cambios.

USE restaurante;

ALTER TABLE grupos_modificadores ADD COLUMN descuenta_inventario TINYINT(1) NOT NULL DEFAULT 0 AFTER obligatorio;

ALTER TABLE pedido_item_modificadores ADD COLUMN insumo_id INT DEFAULT NULL AFTER opcion_modificador_id;
ALTER TABLE pedido_item_modificadores ADD COLUMN cantidad_insumo DECIMAL(10,4) DEFAULT NULL AFTER insumo_id;
ALTER TABLE pedido_item_modificadores ADD COLUMN unidad_insumo VARCHAR(20) DEFAULT NULL AFTER cantidad_insumo;

ALTER TABLE detalle_factura_modificadores ADD COLUMN insumo_id INT DEFAULT NULL AFTER opcion_modificador_id;
ALTER TABLE detalle_factura_modificadores ADD COLUMN cantidad_insumo DECIMAL(10,4) DEFAULT NULL AFTER insumo_id;
ALTER TABLE detalle_factura_modificadores ADD COLUMN unidad_insumo VARCHAR(20) DEFAULT NULL AFTER cantidad_insumo;
