# 🗂️ Índice de Módulos de GastroFlow

Este directorio contiene la documentación lógica y operativa detallada por cada módulo del sistema. Haz clic en cualquiera de los enlaces a continuación para acceder al documento específico de cada funcionalidad:

## 🔑 Autenticación y Seguridad
* **[01. Autenticación, Seguridad y Autorización](01_autenticacion_seguridad.md):** Control de acceso, sesiones basadas en cookies y JWT, roles de usuario, permisos y overrides del superadmin.

## 🍽️ Operación de Salón y POS
* **[02. POS (Punto de Venta)](02_pos.md):** Facturación directa y cobro rápido en mostrador sin reserva de mesa.
* **[03. Mesas y Pedidos](03_mesas_pedidos.md):** Control del salón, ciclo de vida del pedido a la mesa, facturación parcial y liberación.
* **[04. Menú QR Público](04_menu_qr.md):** Menú digital de autoconsumo con toppings, nota por producto, seguimiento de estado de la mesa y llamada al mesero (SSE).
* **[05. Cola de Cocina](05_cocina.md):** Interfaz para preparadores y despachadores de platos.
* **[12. Modificadores / Toppings](12_modificadores_toppings.md):** Grupos de opciones por producto, precio adicional y descuento de inventario opt-in.

## 🍳 Inventarios, Recetas y Costos
* **[06. Inventario e Insumos](06_inventario_insumos.md):** Control de materias primas, alertas de stock mínimo, valorización y movimientos de inventario.
* **[07. Recetas y Costeo](07_recetas_costeo.md):** Fórmulas de platos, descuento automático de materias primas e ingeniería de menú con margen de ganancia.

## 💵 Administración y Cierre
* **[08. Caja Diaria y Turnos](08_caja_turnos.md):** Gestión de turnos, arqueo de caja física, movimientos y auditoría de flujo de caja.
* **[09. Finanzas y Analítica](09_finanzas_analitica.md):** Dashboard financiero (ingresos vs egresos) y predicciones de ventas con analítica interactiva.

## 🌐 Integraciones y SaaS Global
* **[11. Panel de Superadmin](11_superadmin.md):** Gestión multi-tenant, planes de suscripción globales, creación y bloqueo de sucursales.
* **[13. Suscripción y Cobro Automático (Wompi)](13_suscripcion_wompi.md):** Cobro mensual de la suscripción de cada tenant vía pasarela Wompi.
* **[10. Integración de WhatsApp Bot](10_whatsapp_bot.md):** ❌ *Eliminado (2026-09).* Se documenta solo como referencia histórica.

> Facturación electrónica (Factus) y su plan de integración: ver `docs/facturacion-electronica/plan-integracion-factus.md`.

---
*Para volver a la documentación técnica general del sistema, haz clic [aquí](../DOCUMENTACION_SISTEMA.md).*
