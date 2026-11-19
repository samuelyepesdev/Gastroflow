# 📅 Módulo 21: Reservas (V1, sin anticipo)

### 1. Descripción Funcional
Cada restaurante recibe reservas de dos formas: por una **página pública** (enlace que comparte en Instagram, Google Maps o WhatsApp) y a mano desde el **panel interno** (llamadas, mostrador). La disponibilidad se calcula por **aforo** (personas simultáneas), no por mesa; la mesa se asigna después y es opcional.

* **Pública:** sin login, `/reservar/:token`. El cliente elige personas, fecha y hora (solo ve si hay cupo, no cuántos lugares quedan), deja nombre y celular y **autoriza el tratamiento de datos** (Ley 1581: se guarda fecha e IP). Nace `pendiente` (o `confirmada` si el restaurante activó la confirmación automática).
* **Interna:** `/reservas`. Lista por día, crear reserva, cambiar estado, asignar mesa, enlace de WhatsApp (`wa.me`) para confirmar con el cliente. El personal puede **forzar** una reserva por encima del aforo.
* **Elegir mesa (opcional, `reserva_config.elegir_mesa`):** el administrador define la **capacidad** de cada mesa (`mesas.capacidad`) en Configurar y activa «Que el cliente elija su mesa». La página pública muestra, tras elegir la hora, solo las mesas **libres** a esa hora y con capacidad suficiente (una mesa reservada deja de aparecer); un horario solo está disponible si queda al menos una mesa libre. Sin esta opción la reserva es por aforo y la mesa la asigna el personal. En ambos modos, asignar una mesa que ya tiene otra reserva cruzada se rechaza (el personal puede forzarlo).
* **Estados:** `pendiente → confirmada → sentada` (llegó); `cancelada` y `no_show` son finales.
* **Fuera de V1:** anticipo en línea (requiere que cada restaurante conecte su propio Wompi), recordatorios automáticos y bloqueo de días festivos.

### 2. Componentes del Código
* **Servicio:** [ReservaService.js](../../services/Tenant/ReservaService.js) — validación, cálculo de franjas y aforo (`ocupacionMaxima`), transiciones de estado.
* **Repositorio:** [ReservaRepository.js](../../repositories/Tenant/ReservaRepository.js)
* **Controladores:** `Tenant/ReservasController.js` (panel + API JSON) · `Public/ReservaPublicaController.js`
* **Rutas:** `routes/tenant/reservas.js` (montada en `/reservas`) · `routes/reservas_publica.js` (montada en `/reservar`, con rate limit por IP y campo trampa anti-bots)
* **Vistas/JS/CSS:** `views/reservas/`, `public/js/modulos/reservas*.js`, `public/css/modulos/reservas*.css` — solo tokens de `brand.css` (marca "Cloche").
* **Permisos** (en `utils/permisosCatalogo.js`): `reservas.ver`, `reservas.gestionar` (admin, cajero, mesero) y `reservas.configurar` (admin). No dependen del plan.

### 3. Tablas
* `mesas.capacidad` (NULL = sin definir: la mesa no se ofrece en la página pública). `reserva_config.elegir_mesa`.
* `reserva_config`: una fila por restaurante (aforo, duración, intervalo, horario, anticipación mínima, días máximos de adelanto, máximo por reserva, confirmación automática, mensaje público, `token_publico`).
* `reservas`: `fecha` y `hora_inicio` son **hora de pared de Colombia** (DATE/TIME, no UTC); `estado`, `origen` (`publica`/`interna`), `mesa_id` opcional, evidencia de consentimiento.

### 4. Notas de implementación
* **Sin sobrecupo:** crear una reserva bloquea la fila del tenant (`SELECT ... FOR UPDATE`) y recalcula el aforo dentro de la misma transacción, igual que `NumeracionRepository`. Dos solicitudes simultáneas para el último cupo: una gana, la otra recibe 409 `RESERVA_SIN_CUPO`.
* **Enlace público:** el token tiene 144 bits. «Cambiar enlace» en la configuración invalida el anterior. Un restaurante inactivo o con reservas desactivadas responde con la página "no disponible".
* **Fechas:** `fechaColombia`/`hoyColombia` de `utils/dateHelpers.js`; la hora actual se calcula con el offset fijo de Colombia (-05:00), sin `Intl`.
