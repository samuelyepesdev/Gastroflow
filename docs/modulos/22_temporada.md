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

### 5. Look navideño (páginas públicas del restaurante)
* En `/temporada` → «Look navideño»: interruptor, fechas (por defecto 1 de diciembre a 6 de enero), mensaje opcional y opción de animaciones. Tabla `tema_temporada` (un registro por restaurante).
* **Dónde se ve:** la página pública de reservas y el menú QR. Fuera de la ventana de fechas o con el interruptor apagado, las páginas son idénticas a las de siempre (no se carga CSS ni JS del tema).
* **Qué incluye:** tira de luces que parpadean, nieve cayendo, banner «Felices fiestas» con el mensaje del restaurante y brillo, adornos colgantes (solo en reservas) y confeti al enviar una reserva.
* **Marca y paleta:** reservas usa los tokens de `brand.css` (Tinta, Coral, Crema). El menú QR usa la paleta propia de cada restaurante (`--primary-color`) más dorados neutros; no impone colores de GastroFlow.
* **Movimiento:** se apaga con `prefers-reduced-motion` y con la opción «Animaciones» desactivada (`body.tema-navidad-quieto`).
* Archivos: `public/css/core/tema-navidad.css`, `public/js/core/tema-navidad.js`, `views/partials/_tema_navidad.ejs`, `services/Tenant/TemaTemporadaService.js`.
* `TemaTemporadaService.getActivo` nunca lanza: si falla, la página se ve sin tema.

### 6. Activación por el superadmin (global y por restaurante)
* **Panel:** `/admin/temporada` («Look de temporada», en Comunicación). Dos partes: un interruptor **para todos los restaurantes** (con fechas, mensaje general y animaciones) y una tabla **por restaurante** con tres opciones: *Seguir lo global*, *Activado* y *Apagado*.
* **Quién gana:** la decisión explícita de un restaurante (activado o apagado, la tome él o la fuerce el superadmin) **prevalece** sobre lo global. Solo los restaurantes sin decisión (*Seguir lo global*) siguen el interruptor global. Fechas y mensaje: los propios del restaurante si los tiene, si no los globales. Las animaciones quedan apagadas si cualquiera de los dos las apaga.
* **Datos:** `tema_temporada_global` (una fila, `id = 1`) y `tema_temporada.activo` ahora admite `NULL` = sin decidir. Forzar o devolver a «Seguir lo global» solo cambia `activo`; no borra las fechas ni el mensaje del restaurante.
* **Para el restaurante:** en su `/temporada`, si hereda el look global, ve un aviso («GastroFlow activó el look navideño para todos…») y puede apagarlo; al guardar queda como decisión propia.
* Código: `TemaTemporadaService` (`resolver` es la regla de prioridad), `Admin/TemporadaAdminController`, `routes/admin/temporada.js`, `views/admin/temporada/`, `public/js/admin/temporada.js`.
