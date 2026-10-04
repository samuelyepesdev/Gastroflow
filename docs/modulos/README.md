# 🗂️ Índice de Módulos de GastroFlow

Este directorio contiene la documentación lógica y operativa detallada por cada módulo del sistema. Haz clic en cualquiera de los enlaces a continuación para acceder al documento específico de cada funcionalidad:

## 🔑 Autenticación y Seguridad
* **[01. Autenticación, Seguridad y Autorización](01_autenticacion_seguridad.md):** Control de acceso, sesiones basadas en cookies y JWT, roles de usuario, permisos y overrides del superadmin.

## 🍽️ Operación de Salón y POS
* **[02. POS (Punto de Venta)](02_pos.md):** Facturación directa y cobro rápido en mostrador sin reserva de mesa.
* **[03. Mesas y Pedidos](03_mesas_pedidos.md):** Control del salón, ciclo de vida del pedido a la mesa, facturación parcial y liberación.
* **[04. Menú QR Público](04_menu_qr.md):** Menú digital de autoconsumo con toppings, nota por producto, seguimiento de estado de la mesa y llamada al mesero (SSE).
* **[05. Cola de Cocina](05_cocina.md):** Interfaz para preparadores y despachadores de platos.
* **[15. KDS por Estación](15_kds_estaciones.md):** Segunda vista de la cola de cocina, agrupada por estación (fría/caliente/bebidas o las que defina el tenant) con alerta de demora.
* **[12. Modificadores / Toppings](12_modificadores_toppings.md):** Grupos de opciones por producto, precio adicional y descuento de inventario opt-in.

## 🍳 Inventarios, Recetas y Costos
* **[06. Inventario e Insumos](06_inventario_insumos.md):** Control de materias primas, alertas de stock mínimo, valorización y movimientos de inventario.
* **[07. Recetas y Costeo](07_recetas_costeo.md):** Fórmulas de platos, descuento automático de materias primas e ingeniería de menú con margen de ganancia.

## 💵 Administración y Cierre
* **[08. Caja Diaria y Turnos](08_caja_turnos.md):** Gestión de turnos, arqueo de caja física, movimientos y auditoría de flujo de caja.
* **[09. Finanzas y Analítica](09_finanzas_analitica.md):** Dashboard financiero (ingresos vs egresos) y predicciones de ventas con analítica interactiva.
* **[14. Órdenes de Compra a Proveedor](14_ordenes_compra.md):** OC → recepción con cantidad editable → entrada de inventario ligada al proveedor.
* **[16. Bonos Redimibles](16_bonos_redimibles.md):** Saldo prepago o regalado, identificado por código, que se redime al facturar en Mesas (se compone con efectivo/transferencia como los abonos libres).
* **[17. Promociones](17_promociones.md):** Descuento automático por día/hora sobre productos, categorías o todo el catálogo — visible en Mesas, POS y Menú QR, sin restricción de plan.
* **[18. Combos](18_combos.md):** Combos fijos a precio fijo (un producto con componentes): una línea en Mesas/POS/QR, llega completo a una estación de cocina y descuenta el inventario de cada componente.

## 🌐 Integraciones y SaaS Global
* **[11. Panel de Superadmin](11_superadmin.md):** Gestión multi-tenant, planes de suscripción globales, creación y bloqueo de sucursales.
* **[13. Suscripción y Cobro Automático (Wompi)](13_suscripcion_wompi.md):** Cobro mensual de la suscripción de cada tenant vía pasarela Wompi.
* **[10. Integración de WhatsApp Bot](10_whatsapp_bot.md):** ❌ *Eliminado (2026-09).* Se documenta solo como referencia histórica.

> Facturación electrónica (Factus) y su plan de integración: ver `docs/facturacion-electronica/plan-integracion-factus.md`.
>
> Integración contable (Alegra/Siigo) — plan y estrategia (aún no implementado): ver `docs/contabilidad/plan-integracion-contable.md`.

---
*Para volver a la documentación técnica general del sistema, haz clic [aquí](../DOCUMENTACION_SISTEMA.md).*
