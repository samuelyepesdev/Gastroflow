# 20. Asistente "Chef"

Asistente conversacional que toma pedidos y responde consultas del restaurante usando un modelo de Groq,
por texto o por voz desde un panel flotante. Especificación y decisiones: `odd/tasks/asistente-chef-fase1.md`
(backend) y `odd/tasks/asistente-chef-fase3.md` (interfaz).

## Quién lo puede usar

Se necesitan las tres condiciones a la vez (`middleware/asistente.js`, en este orden):

1. El restaurante tiene el add-on `asistente` en `tenant_addons` (se lee directo: los planes Premium y
   Definitivo incluyen todos los módulos, pero el add-on igual se exige).
2. El usuario tiene el permiso `asistente.usar` (catálogo en `utils/permisosCatalogo.js`; ningún rol lo
   trae por defecto, el superadmin lo concede por usuario).
3. El servidor tiene `GROQ_API_KEY` (si falta, 503, y solo se le muestra a quien ya tiene acceso).

> Los usuarios con rol `admin` de un restaurante con el add-on lo reciben automáticamente, porque su plan
> se calcula en vivo. Para dejarlo en una sola persona hay que denegarlo por usuario.

## Interfaz (panel flotante)

Un botón circular en la esquina inferior derecha de todas las páginas con navbar abre un panel de chat. Solo
existe en el HTML si `nav.can.asistente` (`middleware/navbarLocals.js`): add-on, permiso `asistente.usar` y
clave del proveedor, las mismas capas que la API.

- **Chat:** burbujas de usuario y asistente, estado "Pensando…", Enter envía, máximo 500 caracteres. El texto
  que falla vuelve al campo para reintentar. `Esc` cierra y devuelve el foco al botón. En teléfono el panel
  ocupa todo el ancho.
- **Confirmación:** cuando el asistente propone una escritura aparecen **Confirmar** y **Cancelar**; al
  pulsar uno se deshabilitan ambos y se muestra el resultado. Cada petición lleva su `Idempotency-Key`.
- **Seguridad:** todo texto del servidor entra con `textContent` (puede traer nombres de productos o notas de
  clientes), nunca como HTML.
- **Voz (opcional):** el micrófono graba hasta 20 segundos con `MediaRecorder`, el servidor transcribe el
  audio con Whisper de Groq y el texto se envía como un comando normal. Funciona en cualquier navegador
  (Brave, Firefox, Safari, móviles). Si el navegador no puede grabar, usa de respaldo el reconocimiento de voz
  del propio navegador (en Brave ese siempre falla). Si el dictado falla, el chat explica el motivo. El altavoz
  (apagado por defecto, se recuerda en el navegador) lee las respuestas con la síntesis del navegador, eligiendo la
  voz en español menos robótica que haya: prefiere las neuronales en línea ("Natural" en Edge, voces de Google) y el
  español latino. La calidad depende de las voces que tenga instaladas el dispositivo.
- **Archivos:** `views/partials/_asistente.ejs`, `public/css/core/asistente.css`,
  `public/js/core/asistente-api.js` (HTTP), `asistente.js` (panel), `asistente-dictado.js` (micrófono) y
  `asistente-voz.js` (altavoz).

## Administración (superadmin)

`/admin/asistente` (menú "Usuarios y accesos" > "Asistente Chef"), solo superadmin. Una sola pantalla para ver y
gestionar el asistente en todos los restaurantes:

- **Estado del servidor:** si `GROQ_API_KEY` está configurada y qué modelo se usa (nunca se muestra la clave).
- **Tabla por restaurante:** add-on activado o no, nombre del asistente, usuarios con acceso y uso de los
  últimos 30 días (comandos, errores y tokens, calculados desde `tenant_audit`). El texto que escriben los
  usuarios no se muestra.
- **Add-on:** el interruptor reutiliza `AddonService` (invalida la caché y deja auditoría). Si el add-on no
  existe en el catálogo avisa que falta correr la migración 128.
- **Nombre:** de 1 a 24 caracteres (letras, números, espacio, `.`, `'`, `-`). Un nombre inválido se rechaza,
  no se corrige en silencio. Queda auditado (`asistente.admin_nombre`).
- **Usuarios:** por restaurante muestra quién tiene acceso a `asistente.usar` y de dónde viene (rol y plan,
  concedido o denegado). Cada usuario se puede dejar en **Estándar**, **Conceder** o **Denegar**; solo cambia
  la excepción del asistente y conserva el resto de las del usuario. Un usuario de otro restaurante responde
  404. Los admins de planes Premium y Definitivo aparecen marcados: sus excepciones no se aplican. Auditado
  (`asistente.admin_acceso`).
- **Archivos:** `routes/admin/asistente.js`, `app/Http/Controllers/Admin/AsistenteController.js`,
  `services/Admin/AsistenteAdminService.js`, `repositories/Admin/AsistenteAdminRepository.js`,
  `views/admin/asistente/index.ejs`, `public/js/admin/asistente.js`.

## Asistente del sistema (superadmin)

Un segundo asistente, solo para el superadmin, para **consultar la plataforma** por texto o voz. Aparece como el
mismo botón flotante en todas las páginas del panel de superadmin, con el título "Asistente del sistema", y solo
si el servidor tiene `GROQ_API_KEY`. Es de **solo lectura**: no cambia nada ni tiene confirmaciones; si le piden
modificar algo, explica que eso se hace en el panel.

- **Herramientas (cerradas):** `resumen_plataforma` (restaurantes activos, suspendidos por pago, pendientes de
  aprobación, sucursales, usuarios), `ventas_plataforma`, `ventas_restaurante`, `productos_mas_vendidos`,
  `buscar_restaurante` (plan, estado, cobro, add-ons, usuarios), `soporte_abierto`, `cola_trabajos`,
  `planes_y_addons` y `uso_asistente`.
- **Ventas por periodo:** `ventas_plataforma` responde "cuánto se ha vendido" y "qué restaurante vende más"
  (total, facturas, ticket promedio, restaurante líder y su participación, ranking de 10, mezcla de formas de
  pago y comparación con el periodo anterior). `ventas_restaurante` hace lo mismo para uno, con su mejor día y
  sus 5 productos más vendidos. `productos_mas_vendidos` da el top 10 de la plataforma o de un restaurante. El
  periodo es `hoy`, `ayer`, `ultimos_7_dias`, `este_mes`, `mes_pasado`, `este_anio`, `historico` o dos fechas
  `AAAA-MM-DD` (máximo 400 días). Las fechas se resuelven y validan en el servidor, en hora de Colombia: el modelo
  nunca escribe SQL. Las ventas de eventos aparte se informan por separado, como en el dashboard.
- **Datos de terceros:** los nombres de restaurantes, los textos de los tickets y los errores de los trabajos
  los escriben otras personas y llegan al modelo. Por eso los resultados son solo agregados y campos de sistema:
  nunca se devuelve la descripción de un ticket ni la respuesta del admin, y los nombres y errores se limpian
  (sin caracteres de control, largo acotado). Además el prompt indica que los resultados son datos, no
  instrucciones; y como no hay herramientas de escritura, una instrucción inyectada no puede cambiar nada.
- **API** (detrás de `requireSuperadmin`, sin restaurante): `GET /admin/asistente/api/chat/estado`,
  `POST /admin/asistente/api/chat/comando` y `POST /admin/asistente/api/chat/transcribir` (audio crudo, igual que
  el de los restaurantes). Límites por superadmin: 20 consultas/min y 20 dictados/min (`ASISTENTE_LIMITE_SISTEMA_MIN`,
  `ASISTENTE_LIMITE_SISTEMA_VOZ_MIN`).
- **Auditoría:** `asistente.admin_consulta` y `asistente.admin_transcribir` en `tenant_audit` (sin restaurante):
  quién, la pregunta (300 caracteres), herramientas y tokens, o solo el tamaño del audio.
- **Archivos:** `services/Admin/AsistenteSistema/*` (herramientas, prompt y servicio),
  `repositories/Admin/AsistenteSistemaRepository.js`, `app/Http/Controllers/Admin/AsistenteSistemaController.js`,
  rutas en `routes/admin/asistente.js`. El panel es el mismo parcial (`views/partials/_asistente.ejs`) con la API
  indicada en `data-api`; se incluye desde `views/admin/_shell/_close.ejs`.

## API

| Ruta | Cuerpo | Respuesta |
|---|---|---|
| `GET /api/asistente/estado` | — | `{ nombre }` (nombre del asistente del restaurante, "Chef" por defecto) |
| `POST /api/asistente/transcribir` | audio crudo (`Content-Type: audio/webm`, `ogg`, `mp4`, `mpeg`, `wav`...), máx. 1 MB | `{ tipo: 'transcripcion', texto }` |
| `POST /api/asistente/comando` | `{ texto, historial? }` | `{ tipo: 'respuesta' \| 'confirmacion' \| 'aclaracion' \| 'error', ... }` |
| `POST /api/asistente/confirmar` | `{ confirmationId, aceptar }` | resultado de la acción o error |

- `texto`: hasta 500 caracteres. `historial`: solo turnos `user`/`assistant` de texto, últimos 6, 500
  caracteres cada uno; todo lo demás se descarta.
- Una escritura **nunca se ejecuta al pedirla**: el servidor la guarda (una pendiente por usuario, vence a
  los 120 s, ligada a tenant y usuario) y responde `confirmacion` con un resumen. Solo
  `aceptar === true` la ejecuta, una única vez.
- Se propone una sola escritura por comando.

## Herramientas (cerradas)

El modelo solo puede invocar estas, y solo las que el usuario puede usar (permiso Y módulo del plan):
`agregar_items` (hasta 20 líneas, cantidad 1–50), `cancelar_item` (solo `pendiente`), `liberar_mesa`,
`liberar_mesas_vacias` (una sola confirmación para liberar todas las mesas ocupadas sin items activos ni abonos, máx. 30; cada una se revisa de nuevo bajo bloqueo al ejecutar y las que ya tienen productos se omiten),
`consultar_mesa`, `mesas_libres`, `estado_mesas` (total de mesas y cuáles están libres u ocupadas), `consultar_menu`, `ventas_hoy` (permiso `ventas.ver`).

El modelo nunca ve ni envía `tenant_id`, ni genera SQL. Mesa y producto se resuelven en el servidor por
número, descripción (alias) y coincidencia aproximada, siempre dentro del tenant de la sesión
(`utils/asistente/*`, `AsistenteResolverService`). "Domicilio" se resuelve a las mesas virtuales.

## Controles

- **Límites** (`middleware/asistenteLimites.js`, por restaurante y usuario, no por IP): 15 comandos/min
  por usuario, 60/min por restaurante, 60 confirmaciones/min y 20 dictados/min por usuario. Configurables con
  `ASISTENTE_LIMITE_USUARIO_MIN`, `ASISTENTE_LIMITE_TENANT_MIN`, `ASISTENTE_LIMITE_CONFIRMAR_MIN`,
  `ASISTENTE_LIMITE_TRANSCRIBIR_MIN`.
  Van después del control de acceso para que quien no tiene permiso no gaste la cuota.
- **Dictado:** `GROQ_STT_MODEL` (por defecto `whisper-large-v3-turbo`). El audio se procesa en memoria, no se
  guarda ni se registra; la auditoría (`asistente.transcribir`) solo anota el tamaño y el resultado.
- **Proveedor**: `GROQ_API_KEY`, `GROQ_MODEL` (por defecto `llama-3.3-70b-versatile`, verificar contra la
  lista vigente de Groq), `GROQ_TIMEOUT_MS`. Máximo 5 llamadas a herramientas por respuesta y 4 vueltas
  por comando.
- **Auditoría**: cada comando y confirmación escribe en `tenant_audit` (`accion` con prefijo
  `asistente.`): texto, herramientas y tokens; nunca la clave ni la respuesta cruda del proveedor.
- **Inyección de instrucciones**: los resultados de herramientas se recortan y se tratan como datos; el
  nombre del asistente se sanea (24 caracteres); la barrera real es que no existen herramientas fuera
  del alcance, no el prompt.

## Datos

Migración `128_asistente_chef.sql`: add-on `asistente` (precio 0) y tabla `asistente_config`
(`tenant_id`, `nombre`, por defecto "Chef").

## Código

| Capa | Archivos |
|---|---|
| Rutas / controlador | `routes/tenant/asistente.js`, `app/Http/Controllers/Tenant/AsistenteController.js` |
| Middleware | `middleware/asistente.js`, `middleware/asistenteLimites.js` |
| Orquestación | `services/Tenant/Asistente/{AsistenteService,ConfirmacionStore,prompt,conversacion,respuestas,auditoria}.js` |
| Herramientas | `services/Tenant/Asistente/AsistenteToolsService.js`, `tools/*` |
| Proveedor LLM | `services/Tenant/Asistente/llm/*` |
| Repositorio | `repositories/Tenant/AsistenteRepository.js` |

## Pendiente antes de producción

Probar contra Groq real con una clave, confirmar el modelo por defecto y los límites del plan gratuito, y
correr la migración 128 en una BD real. Quedan para fases siguientes: cuota mensual por restaurante y almacén compartido de
confirmaciones para varios procesos.
