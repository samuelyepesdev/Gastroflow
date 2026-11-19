# 26. Carta desde foto

En **Productos → Carta desde foto** el dueño fotografía su carta y GastroFlow crea los productos (nombre, categoría y
precio). Es el atajo para empezar: en lugar de digitar 80 platos, se revisa un borrador.

## 1. Flujo (dos pasos, nada se guarda sin revisión)

1. **Analizar** — `POST /productos/importar-carta/analizar` (multipart, campo `imagen`). Un modelo de visión lee la foto y
   devuelve un **borrador**. No toca la base de datos.
2. **Revisar** — el dueño corrige nombres, categorías y precios, y desmarca lo que no quiere. Las filas con precio
   dudoso (vacío, menor a $ 500 o mayor a $ 1.000.000) se marcan en coral y **no se pueden importar sin precio**.
3. **Confirmar** — `POST /productos/importar-carta/confirmar` crea los productos revisados con `ProductService.create`
   (misma validación y auditoría que crear uno a mano). Una fila con error no detiene a las demás.

La foto se reduce en el navegador (lado mayor 1.600 px, JPEG) antes de enviarse, viaja a Groq y **no se guarda** en
ningún sitio (multer en memoria, sin R2 ni disco).

## 2. Reglas del servidor (`services/Tenant/CartaFotoService.js`)

- **Imagen:** máximo 5 MB; el tipo se detecta por los bytes (JPEG, PNG, WebP), no por lo que declare el navegador.
- **Lo que devuelve la IA es texto no confiable:** se limpia (control, invisibles, espacios), se acota (nombre 100,
  categoría 60, descripción 200), se quitan repetidos y se limita a 200 productos. El prompt indica que el texto de la
  carta son datos y nunca instrucciones; además la IA **no tiene herramientas**: lo único que produce es un borrador.
- **Al confirmar todo se revalida** (el cliente puede enviar cualquier cosa): precio entero de 0 a $ 10.000.000, el
  restaurante sale siempre de la sesión y se ignora cualquier `tenant_id` del cuerpo.
- **Duplicados:** un producto cuyo nombre ya existe (sin importar tildes, mayúsculas ni signos) se omite y se informa.
- **Códigos:** `CARTA-001`, `CARTA-002`… continuando el mayor existente; si otro proceso toma el código se prueba con el
  siguiente (hasta 5 intentos).
- **Categorías:** se usa la existente (sin importar mayúsculas) o se crea; máximo 30 categorías nuevas por importación,
  el resto va a «General».
- **Precios:** entiende `12.500`, `$ 12,500`, `12k` y números limpios. «12,5» se interpreta como 13 pesos y se marca
  dudoso: la IA debería devolverlo ya convertido a 12.500.

## 3. Proveedor de IA y costo

- Cliente: `services/Tenant/Asistente/llm/GroqVision.js` (crear con `crearLectorImagenes()`), misma `GROQ_API_KEY` del
  Asistente Chef. Un restaurante sin clave configurada no ve el botón y el endpoint responde 503.
- Modelo por defecto `qwen/qwen3.8-27b`, fijable con `GROQ_VISION_MODEL`. **Está en vista previa en Groq y puede
  retirarse con poco aviso**: si la función empieza a fallar con «no disponible», confirma el modelo vigente en
  console.groq.com/docs/vision y cámbialo en el entorno, sin tocar código.
- Costo aproximado (precios de la documentación de Groq): cada imagen cuenta como 2.048 tokens de entrada, más la
  respuesta; del orden de 1 centavo de dólar por foto. Verifícalo en la consola de Groq.
- Límite de uso: 8 lecturas por hora por usuario (`routes/tenant/productos.js`), no por IP.

## 4. Permisos y plan

Usa `productos.crear` y el módulo de plan `productos`; no hay permiso nuevo. Para ofrecer la función solo a un plan o
como complemento de pago, habría que crear el permiso en `utils/permisosCatalogo.js`.

## 5. Archivos

- Servicio: `services/Tenant/CartaFotoService.js`. Controlador: `app/Http/Controllers/Tenant/CartaFotoController.js`
  (convierte `LlmError` en 429 / 502 / 503 / 504 con mensajes seguros). Rutas: `routes/tenant/productos.js`.
- Vista y front: `views/productos/_modal_carta_foto.ejs`, `public/js/modulos/productos/carta_foto.js`,
  `public/css/modulos/carta_foto.css` (en celular cada producto es una tarjeta).
- Pruebas: `tests/unit/services/CartaFotoService.test.js`, `tests/unit/services/GroqVision.test.js`.

## 6. Pendiente

- **No se ha probado contra el modelo real**: el desarrollo local no tenía `GROQ_API_KEY`. Las pruebas simulan la
  respuesta del modelo. Antes de ofrecerlo a clientes, probar con 3 o 4 cartas reales (letra decorativa, fotos
  inclinadas, cartas largas) y ajustar el prompt de `CartaFotoService` si hace falta.
- Cartas de varias páginas (hoy una foto a la vez), importar la imagen del plato, y modificadores o combos.
