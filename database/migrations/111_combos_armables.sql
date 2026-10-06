-- 111_combos_armables.sql
-- Combos como entidad propia ("arma tu combo"), desacoplados de `productos`.
--
--   combos          catálogo: precio base, impuesto y estación de cocina propios
--   combo_grupos    pasos del combo ("Elige tu bebida") con mínimo/máximo de opciones
--   combo_opciones  productos elegibles en cada grupo, con recargo opcional
--
-- Un combo fijo es simplemente un combo cuyos grupos tienen una sola opción
-- obligatoria (minimo = maximo = 1), así no hay dos modelos distintos.
--
-- Lo vendido se guarda como snapshot (nombre/recargo congelados) en
-- *_combo_selecciones, igual que los modificadores (077): editar o borrar el
-- combo después no altera pedidos ni facturas históricas.
--
-- Esta migración NO elimina productos.es_combo ni combo_componentes: el módulo
-- actual sigue funcionando hasta que la venta (Mesas/POS/QR) use el modelo
-- nuevo. Se retiran en la fase de limpieza.
USE restaurante;

CREATE TABLE IF NOT EXISTS combos (
    id                  INT           PRIMARY KEY AUTO_INCREMENT,
    tenant_id           INT           NOT NULL,
    nombre              VARCHAR(150)  NOT NULL,
    descripcion         VARCHAR(255)  DEFAULT NULL,
    imagen_url          VARCHAR(500)  DEFAULT NULL,
    precio_base         DECIMAL(10,2) NOT NULL,
    tributo             ENUM('iva_19', 'iva_5', 'impoconsumo_8', 'exento', 'excluido') DEFAULT NULL
                        COMMENT 'NULL = usa el default del tenant',
    tasa_impuesto       DECIMAL(5,2)  DEFAULT NULL,
    estacion_id         INT           DEFAULT NULL
                        COMMENT 'NULL = cada selección va a la estación de su producto',
    orden               SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    activo              TINYINT(1)    NOT NULL DEFAULT 1,
    legacy_producto_id  INT           DEFAULT NULL
                        COMMENT 'Producto es_combo del que se migró, para enlazar historial. Se retira en la limpieza',
    created_at          TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (estacion_id) REFERENCES estaciones(id) ON DELETE SET NULL,
    INDEX idx_combos_tenant (tenant_id, activo)
);

CREATE TABLE IF NOT EXISTS combo_grupos (
    id        INT          PRIMARY KEY AUTO_INCREMENT,
    combo_id  INT          NOT NULL,
    nombre    VARCHAR(100) NOT NULL,
    minimo    TINYINT UNSIGNED NOT NULL DEFAULT 1 COMMENT '0 = grupo opcional',
    maximo    TINYINT UNSIGNED NOT NULL DEFAULT 1,
    orden     SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    FOREIGN KEY (combo_id) REFERENCES combos(id) ON DELETE CASCADE,
    INDEX idx_combo_grupos_combo (combo_id)
);

CREATE TABLE IF NOT EXISTS combo_opciones (
    id           INT           PRIMARY KEY AUTO_INCREMENT,
    grupo_id     INT           NOT NULL,
    producto_id  INT           NOT NULL,
    cantidad     DECIMAL(10,2) NOT NULL DEFAULT 1 COMMENT 'Unidades del producto que entran al elegir esta opción',
    recargo      DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    es_default   TINYINT(1)    NOT NULL DEFAULT 0,
    activo       TINYINT(1)    NOT NULL DEFAULT 1,
    orden        SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    FOREIGN KEY (grupo_id) REFERENCES combo_grupos(id) ON DELETE CASCADE,
    FOREIGN KEY (producto_id) REFERENCES productos(id) ON DELETE CASCADE,
    UNIQUE KEY uq_combo_opcion (grupo_id, producto_id),
    INDEX idx_combo_opciones_producto (producto_id)
);

-- Snapshot de lo elegido en cada línea de venta.
CREATE TABLE IF NOT EXISTS pedido_item_combo_selecciones (
    id               INT           PRIMARY KEY AUTO_INCREMENT,
    pedido_item_id   INT           NOT NULL,
    combo_opcion_id  INT           DEFAULT NULL,
    producto_id      INT           DEFAULT NULL,
    grupo_nombre     VARCHAR(100)  NOT NULL,
    producto_nombre  VARCHAR(150)  NOT NULL,
    cantidad         DECIMAL(10,2) NOT NULL DEFAULT 1,
    recargo          DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    FOREIGN KEY (pedido_item_id) REFERENCES pedido_items(id) ON DELETE CASCADE,
    FOREIGN KEY (combo_opcion_id) REFERENCES combo_opciones(id) ON DELETE SET NULL,
    FOREIGN KEY (producto_id) REFERENCES productos(id) ON DELETE SET NULL,
    INDEX idx_picsel_item (pedido_item_id)
);

CREATE TABLE IF NOT EXISTS detalle_factura_combo_selecciones (
    id                  INT           PRIMARY KEY AUTO_INCREMENT,
    detalle_factura_id  INT           NOT NULL,
    combo_opcion_id     INT           DEFAULT NULL,
    producto_id         INT           DEFAULT NULL,
    grupo_nombre        VARCHAR(100)  NOT NULL,
    producto_nombre     VARCHAR(150)  NOT NULL,
    cantidad            DECIMAL(10,2) NOT NULL DEFAULT 1,
    recargo             DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    FOREIGN KEY (detalle_factura_id) REFERENCES detalle_factura(id) ON DELETE CASCADE,
    FOREIGN KEY (combo_opcion_id) REFERENCES combo_opciones(id) ON DELETE SET NULL,
    FOREIGN KEY (producto_id) REFERENCES productos(id) ON DELETE SET NULL,
    INDEX idx_dfcsel_detalle (detalle_factura_id)
);

-- Referencia al combo vendido en cada línea. Las líneas de combo todavía
-- guardan además su producto_id legado; hacerlo opcional es parte de la fase
-- de venta, cuando se verifique cada consulta que une con productos.
ALTER TABLE pedido_items ADD COLUMN combo_id INT NULL;
ALTER TABLE pedido_items ADD CONSTRAINT fk_pedido_items_combo FOREIGN KEY (combo_id) REFERENCES combos(id) ON DELETE SET NULL;
ALTER TABLE detalle_factura ADD COLUMN combo_id INT NULL;
ALTER TABLE detalle_factura ADD CONSTRAINT fk_detalle_factura_combo FOREIGN KEY (combo_id) REFERENCES combos(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- Conversión de los combos fijos existentes (productos es_combo = 1).
-- ---------------------------------------------------------------------------
INSERT INTO combos (tenant_id, nombre, descripcion, imagen_url, precio_base, tributo, tasa_impuesto,
                    estacion_id, legacy_producto_id)
SELECT p.tenant_id, p.nombre, p.descripcion, p.imagen_url, p.precio_unidad, p.tributo, p.tasa_impuesto,
       c.estacion_id, p.id
FROM productos p
LEFT JOIN categorias c ON c.id = p.categoria_id
WHERE p.es_combo = 1 AND p.activo = 1;

-- Cada componente fijo pasa a ser un grupo obligatorio de una sola opción.
-- Columna temporal para enlazar grupo -> componente sin depender del nombre.
ALTER TABLE combo_grupos ADD COLUMN legacy_componente_id INT NULL;

INSERT INTO combo_grupos (combo_id, nombre, minimo, maximo, legacy_componente_id)
SELECT cb.id, p.nombre, 1, 1, cc.producto_id
FROM combo_componentes cc
JOIN combos cb ON cb.legacy_producto_id = cc.combo_id
JOIN productos p ON p.id = cc.producto_id;

INSERT INTO combo_opciones (grupo_id, producto_id, cantidad, es_default)
SELECT g.id, g.legacy_componente_id, cc.cantidad, 1
FROM combo_grupos g
JOIN combos cb ON cb.id = g.combo_id
JOIN combo_componentes cc ON cc.combo_id = cb.legacy_producto_id AND cc.producto_id = g.legacy_componente_id
WHERE g.legacy_componente_id IS NOT NULL;

ALTER TABLE combo_grupos DROP COLUMN legacy_componente_id;
