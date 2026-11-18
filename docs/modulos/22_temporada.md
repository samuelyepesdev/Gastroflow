# ❄️ Módulo 22: Temporada (fin de año)

### 1. Descripción Funcional
Página `/temporada` con dos herramientas para campañas de fin de año (reutilizables en otras temporadas):

* **Plantillas de promoción:** Noche de Velitas, Novena de Aguinaldos, Navidad y Fin de año. Cada una crea una promoción con las fechas de la temporada (el año se resuelve solo: si la ventana ya pasó, usa la del año siguiente) y un porcentaje editable. **Nace desactivada** y para todo el catálogo: se revisa y se activa en Promociones, donde también puede acotarse a categorías o productos.
* **Menú de temporada por fechas:** se eligen productos o combos y una fecha «desde» y/o «hasta». Quedan disponibles desde el inicio y se retiran solos después del fin (Mesas, POS y menú QR).

Atajos a Reservas, Combos y Promociones. Permiso: `temporada.gestionar` (admin). Sin dependencia de plan.

### 2. Componentes del Código
* [TemporadaService.js](../../services/Tenant/TemporadaService.js) (plantillas y reglas) · [TemporadaRepository.js](../../repositories/Tenant/TemporadaRepository.js)
* `app/Http/Controllers/Tenant/TemporadaController.js` · `routes/tenant/temporada.js` (`/temporada`)
* `views/temporada/`, `public/js/modulos/temporada.js`, `public/css/modulos/temporada.css` (solo tokens de `brand.css`)
* Proceso diario en `config/bootstrap.js`: 00:05 hora Colombia y al arrancar el servidor.

### 3. Tablas
* `producto_vigencia` (`producto_id` único, `desde`, `hasta` en días de Colombia, `estado_aplicado`).

### 4. Notas de implementación
* **No toca el catálogo.** La vigencia solo mueve `productos.disponible` (el mismo interruptor «No disponible» de Productos), así que Mesas, POS y QR no cambiaron.
* **Solo en transiciones.** `estado_aplicado` guarda lo último aplicado: el proceso modifica `disponible` únicamente cuando el estado calculado cambia. Un «agotado» manual dentro de la ventana no se deshace a la medianoche.
* **Quitar las fechas** deja el producto con el estado que tenga en ese momento.
* El proceso diario recorre todos los restaurantes con una sola sentencia `UPDATE ... JOIN`; guardar fechas desde la página lo aplica de inmediato solo para ese restaurante.
