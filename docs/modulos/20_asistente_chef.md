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
- **Voz (opcional):** el micrófono dicta en `es-CO` y envía el texto reconocido; el altavoz (apagado por
  defecto, se recuerda en el navegador) lee las respuestas. Usan el reconocimiento y la síntesis del propio
  navegador: si no existen, los botones no aparecen. Reconocimiento de voz funciona bien en Chrome y Edge, y
  en Safari/Firefox puede faltar.
- **Archivos:** `views/partials/_asistente.ejs`, `public/css/core/asistente.css`,
  `public/js/core/asistente-api.js` (HTTP), `asistente.js` (panel) y `asistente-voz.js` (voz).

## API

| Ruta | Cuerpo | Respuesta |
|---|---|---|
| `GET /api/asistente/estado` | — | `{ nombre }` (nombre del asistente del restaurante, "Chef" por defecto) |
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
`consultar_mesa`, `mesas_libres`, `consultar_menu`, `ventas_hoy` (permiso `ventas.ver`).

El modelo nunca ve ni envía `tenant_id`, ni genera SQL. Mesa y producto se resuelven en el servidor por
número, descripción (alias) y coincidencia aproximada, siempre dentro del tenant de la sesión
(`utils/asistente/*`, `AsistenteResolverService`). "Domicilio" se resuelve a las mesas virtuales.

## Controles

- **Límites** (`middleware/asistenteLimites.js`, por restaurante y usuario, no por IP): 15 comandos/min
  por usuario, 60/min por restaurante, 60 confirmaciones/min por usuario. Configurables con
  `ASISTENTE_LIMITE_USUARIO_MIN`, `ASISTENTE_LIMITE_TENANT_MIN`, `ASISTENTE_LIMITE_CONFIRMAR_MIN`.
  Van después del control de acceso para que quien no tiene permiso no gaste la cuota.
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
correr la migración 128 en una BD real. Quedan para fases siguientes: edición del nombre desde el superadmin, cuota mensual por restaurante y almacén compartido de
confirmaciones para varios procesos.
