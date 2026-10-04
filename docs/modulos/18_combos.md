# 📦 Módulo 18: Combos

### 1. Descripción Funcional
Combo **fijo a precio fijo**: un conjunto de productos (ej. hamburguesa + papas + gaseosa) que se vende como **una sola línea** en Mesas, POS y Menú QR. Sin elecciones por parte del cliente (no hay "elige tu bebida"; eso sería una fase futura).

Un combo **es un producto** (`productos.es_combo = 1`) con su propio precio, categoría e impuesto, así que hereda todo lo que ya hace un producto sin tocar esas piezas:
* **Cocina (KDS):** llega **completo a una sola estación**, la de la categoría del combo (`categoria → estación`), y su estado (pendiente/preparando/listo) es el del combo entero.
* **Promociones:** pueden aplicarle como a cualquier producto (por producto, categoría o todo el catálogo).
* **QR, favoritos, buscador, factura y factura electrónica:** una línea "Combo X" al precio del combo.

Lo único que sabe del combo es el **inventario**: al facturar descuenta la receta de **cada producto componente** × su cantidad × la cantidad de combos vendidos.

No está ligado a ningún plan; permisos `combos.ver` / `combos.gestionar` (admin/superadmin por defecto).

---

### 2. Componentes del Código
* **Controlador:** [CombosController.js](file:///c:/laragon/www/Gastroflow/app/Http/Controllers/Tenant/CombosController.js)
* **Servicio:** [ComboService.js](file:///c:/laragon/www/Gastroflow/services/Tenant/ComboService.js) — valida (nombre, precio > 0, categoría, ≥ 1 componente, sin repetidos, solo productos simples del tenant) y crea/edita el producto vía `ProductService` (queda auditado).
* **Repositorio:** [ComboRepository.js](file:///c:/laragon/www/Gastroflow/repositories/Tenant/ComboRepository.js)
* **Inventario:** `InventarioService.descontarPorReceta` y `checkStockParaProducto` expanden el combo a sus componentes (`_descontarRecetaProducto` / `_checkStockReceta` son la lógica original por receta).
* **Rutas:** `/combos` (vista + `GET|POST`) · `GET|PUT|DELETE /combos/:id`. **UI:** `views/combos/index.ejs` + `public/js/modulos/combos.js`.

---

### 3. Tablas de Base de Datos (migración 110)
* `productos.es_combo` (TINYINT, 0 por defecto).
* `combo_componentes (combo_id, producto_id, cantidad)`: PK compuesta, `ON DELETE CASCADE` en ambos lados.

---

### 4. Notas de implementación
* **Código del producto:** se crea con uno provisional y se reemplaza por `CMB-<id>` (único por tenant sin contador).
* **Sin combos anidados:** un componente no puede ser otro combo (se valida al guardar; evita recursión en inventario).
* **El descuento usa la composición vigente al facturar**, igual que las recetas hoy. Si se edita un combo con pedidos abiertos, se descuenta con la composición nueva.
* **Stock insuficiente:** solo avisa (warn) y permite negativo, igual que recetas y modificadores.
* **Eliminar** un combo es borrado lógico del producto: las ventas históricas no cambian.
* **Impuesto:** el combo toma el impuesto por defecto del tenant (como cualquier producto nuevo); se puede ajustar desde `/productos`.

### 5. Pendiente (futuras fases)
* Combos con elección ("elige tu bebida") y recargos.
* Costo/margen del combo en Costeo (suma de las recetas de sus componentes).
* Reportes por componente ("cuántas hamburguesas se vendieron", incluyendo las de combos).
