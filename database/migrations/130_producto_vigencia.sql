-- 130_producto_vigencia.sql
-- Vigencia por fechas de un producto o combo (menu de temporada: aparece en una fecha y se retira en otra).
-- No cambia como se lee el catalogo: un proceso diario (y al guardar) pone productos.disponible en 1 o 0 solo
-- cuando el estado calculado cambia respecto de estado_aplicado, asi un "agotado" manual dentro de la
-- ventana no se deshace al dia siguiente. desde y hasta son dias de Colombia (DATE), ambos inclusive.

CREATE TABLE IF NOT EXISTS producto_vigencia (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tenant_id INT NOT NULL,
    producto_id INT NOT NULL,
    desde DATE NULL,
    hasta DATE NULL,
    estado_aplicado TINYINT(1) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_producto_vigencia_producto (producto_id),
    KEY idx_producto_vigencia_tenant (tenant_id),
    CONSTRAINT fk_producto_vigencia_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT fk_producto_vigencia_producto FOREIGN KEY (producto_id) REFERENCES productos(id) ON DELETE CASCADE
);
