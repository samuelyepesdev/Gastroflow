# 25. Reseñas de clientes

Cada restaurante tiene una página pública de opiniones (`/resena/:token`) que sus clientes abren desde un QR o un enlace.
El cliente califica de 1 a 5 estrellas; las calificaciones bajas generan una invitación a contar qué pasó, y el dueño las
ve en un panel interno (`/resenas`) para atenderlas.

## 1. Regla de honestidad con Google (no cambiar sin pensarlo)

El enlace de reseñas de Google se muestra a **todos** los clientes al terminar, sin importar la calificación.
Google prohíbe pedir reseñas solo a los clientes satisfechos («review gating»), y puede eliminar las reseñas o
sancionar el perfil. Lo que sí hacemos con las calificaciones bajas es **añadir** una invitación a contarle el problema
al restaurante antes (y a dejar su contacto), nunca esconder o sustituir el enlace.

El enlace solo se acepta si es `https` y de un dominio de Google (`google.com`, `g.page`, `goo.gl`):
`validarGoogleUrl` en `services/Tenant/ResenaService.js`.

## 2. Flujo del cliente

1. Abre `/resena/:token` y elige las estrellas (botones de al menos 44 px, accesibles como `radiogroup`).
2. Con **3 o menos** ve «Cuéntanos qué pasó» y campos opcionales de nombre y celular. Con **4 o 5** solo un comentario opcional.
3. Si escribe un celular debe aceptar el tratamiento de datos (Ley 1581 de 2012): se guarda fecha e IP del consentimiento.
4. Al enviar ve el agradecimiento (mensaje propio del restaurante o uno por defecto) y, si el restaurante lo configuró,
   el botón «Dejar reseña en Google».

## 3. Panel del restaurante (`/resenas`)

- Resumen de los últimos 30 días (hora Colombia): promedio, total, distribución por estrellas y número de bajas sin atender.
- Lista con filtro «Todas» / «Por atender» (calificación ≤ 3 y estado `nueva`). El celular abre WhatsApp (`wa.me/57…`).
- «Marcar atendida» / «Reabrir» solo en bajas (permiso `resenas.gestionar`).
- **Configurar** (permiso `resenas.configurar`): activar la página, copiar o cambiar el enlace, **QR descargable**, enlace de Google
  y mensaje de agradecimiento. Cambiar el enlace invalida el token y el QR impresos anteriores.

## 4. Permisos y menú

Catálogo `utils/permisosCatalogo.js`, sección «Reseñas»: `resenas.ver`, `resenas.gestionar`, `resenas.configurar`
(rol por defecto: admin). Sin módulo de plan (`modulo: null`): disponible en todos los planes. El enlace «Reseñas» está en el
menú «Comercial y gestión» y se puede ocultar desde «Personalizar menú».

## 5. Datos (migración `138`)

- `resena_config`: una fila por restaurante (`activo`, `token_publico` de 144 bits, `google_url`, `mensaje_gracias`).
- `resenas`: `calificacion` (1 a 5), `comentario`, `nombre`, `telefono`, `estado` (`nueva`/`atendida`), `consentimiento_at`,
  `consentimiento_ip`. Fechas en UTC: se convierten con `rangoUtcColombia`.

## 6. Protecciones

- El restaurante se resuelve **solo por el token**; un `tenant_id` en el cuerpo se ignora. Una página apagada o un
  restaurante inactivo responde 404.
- Límites por IP: 120 consultas / 10 min y 30 envíos / hora (un comedor entero puede compartir red).
- Campo trampa `web` (honeypot): si viene lleno se responde sin guardar.
- Todo texto de clientes se escapa con `GF.escapeHtml` en el panel; el `href` de Google se valida en el servidor.
- `X-Robots-Tag: noindex` y `Cache-Control: no-store` en la página pública.

## 7. Archivos

- Rutas: `routes/resenas_publica.js` (`/resena`), `routes/tenant/resenas.js` (`/resenas`).
- Controladores: `app/Http/Controllers/Public/ResenaPublicaController.js`, `Tenant/ResenasController.js`.
- Servicio y repositorio: `services/Tenant/ResenaService.js`, `repositories/Tenant/ResenaRepository.js`.
- Vistas: `views/resenas/{index,publica,publica_no_disponible}.ejs`. Front: `public/js/modulos/{resenas,resenas-publica}.js`,
  `public/css/modulos/{resenas,resenas-publica}.css`.
- Pruebas: `tests/unit/services/ResenaService.test.js`.

## 8. Ideas pendientes (no implementadas)

Aviso inmediato al dueño cuando entra una baja (SSE o correo), pedir la reseña por WhatsApp tras el cobro, y reseñas
por mesa o por pedido.
