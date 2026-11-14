# Unificar los motores de facturación

Objetivo: reducir la duplicación entre `FacturaService` + `FacturaRepository.createWithDetails` (POS / facturación directa)
y `FacturarPedidoService` (cobro de mesas). Rama de trabajo: `refactor/unificar-facturacion-*`, un paso por rama.
Estrategia: pasos pequeños, cada uno con tests de caracterización antes y suite verde después. Sin cambios de esquema.
Test runner: `npx jest`.

## Specs

- S1. "sigue con el de unificar los motores de facturacion" (petición del usuario, 2026-11-14).
- S2. Ningún cambio de comportamiento observable: mismas facturas, mismos totales, mismos efectos (finanzas, inventario,
  fidelización, factura electrónica, caché, SSE). Un paso que cambie una cifra no se acepta.
- S3. Los efectos de dinero siguen DENTRO de la transacción de la factura y usan SU conexión (ver CLAUDE.md,
  "Efectos de una venta = misma transacción"); nunca otra conexión del pool.
- S4. Lo que difiere por naturaleza (propina, abonos de mesa, descuentos por ítem de mesa, eventos, servicios externos,
  ciclo de vida de la mesa) NO se fuerza a un solo flujo: se comparte lo idéntico y se deja lo específico.

## Mapa de duplicación (leído en el código)

| Pieza | FacturaService/Repository | FacturarPedidoService | Idéntico |
| :-- | :-- | :-- | :-- |
| Ingreso en finanzas + detección de cerámica | `_registrarEfectosEnTransaccion` (lote de 2 consultas) | `_verificarSiTieneCeramica` (1 consulta por línea) | sí en intención |
| Descuento de inventario (recetas, combos, toppings) | `_registrarEfectosEnTransaccion` | `_registrarEfectosEnTransaccion` | sí |
| Factura electrónica + sello de fidelización + caché | post-commit en `create` | `_ejecutarEfectosSecundariosPostVenta` | sí |
| Número de factura + turno de caja | inline en `createWithDetails` | `_obtenerNumeroYCajaSesion` | casi (el turno se toma con LOCK IN SHARE MODE solo en el primero) |
| Redención de bono | `BonoService.validarParaRedimir` + `BonoRepository.redimir` | igual | sí |
| Salida de caja por servicio externo | `CajaRepository.registrarSalidaServicioExterno` | igual | sí |
| Desglose de impuestos por línea (`TaxService`) | inline | `_procesarLineasFactura` | casi |
| Reparto efectivo/transferencia/bono + forma de pago final | inline (abonos POS) | `_calcularTotalesYFormaPago` (abonos de mesa + propina) | NO: reglas distintas |
| INSERT de `detalle_factura` | incluye `precio_original` | NO incluye `precio_original` | NO |

## Tasks

- T1 (S2, S3) Servicio común `services/Tenant/Facturacion/PostVentaService.js` con los efectos en transacción
  (finanzas + inventario + detección de cerámica) y los efectos tras el commit (factura electrónica, sello de
  fidelización, caché); ambos motores lo usan. Route: inline. Estado: HECHA (rama refactor/unificar-facturacion-paso1;
  los tests de caracterización existentes de ambos motores pasan sin modificar + 11 tests nuevos del servicio).
- T2 Número de factura + turno de caja en un único helper (`NucleoFacturaRepository.obtenerNumeroYTurno`). HECHA.
  Cambio intencional: Mesas ahora lee el turno con LOCK IN SHARE MODE como el POS (antes no lo bloqueaba y podía
  colarse una factura entre el cálculo del teórico y el cierre de caja).
- T3 Redención de bono y salida de caja por servicio externo comunes (`redimirBono`, `compensarServiciosExternos`). HECHA.
- T4 Carga de tasas y desglose de impuesto por línea comunes (`cargarTasas`, `desglosarLinea`). HECHA.
- T5 Decidir con el usuario si `detalle_factura.precio_original` debe guardarse también en facturas de mesa. Pendiente
  (decisión de producto: hoy las facturas de mesa no lo guardan).

## Log

- L1 (2026-11-14, usuario): "sigue con el de unificar los motores de facturacion"
- L2 (2026-11-14): T1 elegida primero porque es lo más idéntico y ya tiene tests de ambos motores (FacturaService,
  FacturaServiceCombo, FacturarPedidoService, FacturaRepositoryAbonos).
- L3 (2026-11-14, usuario): "Seguir T2 a T4". Hechas en refactor/unificar-facturacion-paso2: los tests de caracterización de ambos
  motores pasan sin modificar; +13 tests de NucleoFacturaRepository y 1 de Mesas (lock del turno).
