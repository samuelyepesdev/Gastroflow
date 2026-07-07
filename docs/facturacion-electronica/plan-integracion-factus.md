# GastroFlow — Plan de integración de Facturación Electrónica con Factus

> Creado el 2026-07-06. Proveedor elegido: **Factus** (Halltec) — API REST, OAuth2,
> sandbox gratuito e ilimitado para desarrollo, emisión de facturas de venta y notas
> crédito con PDF/XML. Docs: https://developers.factus.com.co/

## Contexto actual del sistema (auditado)

| Pieza | Estado |
|-------|--------|
| Numeración interna por tenant | ✅ `facturas.numero` secuencial + unique (mig. 026) — se conserva como número interno |
| Datos fiscales del tenant | ✅ NIT, dirección, ciudad, régimen fiscal (mig. 031) |
| Datos fiscales del cliente | ✅ `tipo_documento`, `numero_documento`, `email` (mig. 030) |
| Desglose de impuestos | ❌ No existe — `facturas` solo guarda `total` + `propina`; los detalles solo subtotal por línea |
| Impuesto por producto | ❌ No existe |
| Resolución/rangos DIAN | ❌ No existe |
| Integración proveedor tecnológico | ❌ No existe |
| Notas crédito / anulaciones fiscales | ❌ No existe |
| Sistema de addons de pago | ✅ (mig. 028) — la FE se puede vender como addon |

## Modelo de operación (decisión de arquitectura)

La factura electrónica se emite **a nombre del NIT de cada restaurante**, por lo que
**cada tenant necesita su propia cuenta/habilitación en Factus** (emisor = restaurante).
GastroFlow actúa como orquestador: guarda las credenciales API de Factus de cada tenant
(cifradas), emite en su nombre y almacena CUFE/QR/XML/PDF.

Flujo de emisión: **asíncrono**. El POS/mesas cobra y cierra la venta como hoy (sin
bloquear al cajero); un worker toma la factura, la mapea al payload de Factus, la
valida ante DIAN y guarda el resultado. Si falla, queda en estado `error` con
reintentos y alerta visible en el módulo de ventas.

```
POS / Mesas / Eventos
        │ (venta cerrada — flujo actual intacto)
        ▼
facturas (interna) ──► cola de emisión ──► FactusClient (OAuth2)
                                │                 │
                                ▼                 ▼
                    facturas_electronicas    API Factus → DIAN
                    (cufe, qr, xml, pdf,
                     estado, errores)
```

---

## Fase 0 — Preparación (sin código) · ~2-3 días

1. Crear cuenta **sandbox** en Factus y obtener credenciales de prueba
   (`client_id`, `client_secret`, usuario, contraseña — OAuth2 password grant).
2. Importar la colección Postman/Bruno de Factus y probar a mano: token, crear y
   validar factura básica, descargar PDF/XML, rangos de numeración, catálogos
   (municipios, tributos, unidades de medida). Confirmar el payload exacto.
3. Decisiones de negocio:
   - FE como **addon de pago** en el sistema de addons existente.
   - Alcance inicial: **factura electrónica de venta**. El documento equivalente
     POS electrónico (Res. 000165/2023) queda como fase posterior — misma
     infraestructura, otro tipo de documento.

## Fase 1 — Modelo de impuestos (prerequisito de todo) · ~1-1.5 semanas

La fase más grande. Sin desglose de impuestos no hay factura válida ante DIAN.

**Base de datos (nueva migración):**
- `productos`: `tributo` ENUM/código (IVA 19, IVA 5, Impoconsumo 8, Exento 0,
  Excluido) + `tasa_impuesto` DECIMAL. Default por tenant según su régimen
  (restaurante estándar → impoconsumo 8%; franquicia → IVA 19%; no responsable → excluido).
- `facturas`: `subtotal`, `descuento`, `total_impuestos` (el `total` existente se
  mantiene). La `propina` ya está separada — **no hace parte de la base gravable** ✅.
- `factura_detalles`: `base_gravable`, `tasa_impuesto`, `valor_impuesto` por línea.

**Backend:** cálculo del desglose en `FacturaService.create()` y en el flujo de
mesas (`FacturarPedidoService`) y eventos. Precios actuales se tratan como
**impuesto incluido** (precio de carta) — el desglose se calcula hacia atrás.

**UI:** selector de tributo en el modal de producto + configuración default en
`/configuracion`; desglose en ticket de impresión y en detalle de venta.

## Fase 2 — Configuración fiscal por tenant · ~3-5 días

- Nueva migración `tenant_facturacion_electronica`: credenciales Factus (cifradas
  con clave del servidor), ambiente (sandbox/producción), estado (deshabilitado/
  pruebas/activo), código de municipio DANE, tipo de organización, y el
  **rango de numeración** activo (id del rango en Factus, prefijo, rango, vigencia —
  sincronizado vía `GET numbering-ranges`).
- Extender el tab **Fiscal** del admin de tenants: formulario de conexión Factus,
  botón "probar conexión", selección de rango de numeración.
- Gate por addon: middleware que verifica addon FE activo para exponer la función.

## Fase 3 — Servicio de integración y emisión · ~1-1.5 semanas

- `services/Integrations/Factus/FactusClient.js`: OAuth2 (token + refresh, cache
  por tenant), reintentos con backoff, respeto de rate limits, log Winston.
- `services/Tenant/FacturacionElectronicaService.js`: mapeo factura interna →
  payload Factus (cliente → consumidor final si no hay documento; items con
  unidad de medida, tributo y tasa; forma/medio de pago).
- Nueva tabla `facturas_electronicas`: `factura_id`, `numero_fe` (prefijo+consecutivo
  Factus), `cufe`, `qr_data`, `xml_url/blob`, `pdf_url/blob`, `estado`
  (pendiente/emitida/rechazada/error), `errores`, `intentos`, timestamps.
- **Worker de emisión**: cola en BD procesada por intervalo (mismo patrón simple del
  sistema), disparada al crear factura si el tenant tiene FE activa. Nunca bloquea
  la venta.
- UI en `/ventas` y detalle de factura: badge de estado FE, botón reintentar,
  descargar PDF/XML.

## Fase 4 — Representación gráfica y notas crédito · ~1 semana

- Ticket de impresión (`facturas/impresion.ejs`) con: número FE, CUFE, QR,
  datos de resolución — solo cuando la factura fue emitida.
- **Notas crédito**: flujo de anulación de venta que emite nota crédito en Factus
  referenciando la factura; tabla `notas_credito` espejo de `facturas_electronicas`.
- Envío de la factura por email al cliente (si capturó email).

## Fase 5 — Pruebas y producción · ~1 semana

- Suite de pruebas contra sandbox: consumidor final, cliente con NIT, cliente con CC,
  impoconsumo 8%, IVA 19%, productos excluidos, con propina, con descuento,
  anulación con nota crédito, fallo de red (reintento), rango vencido.
- Tests unitarios del mapper (payload) y del cálculo de impuestos — es el corazón.
- Piloto: un restaurante real en ambiente de habilitación DIAN → set de pruebas de
  habilitación → paso a producción con rango real.

---

## Resumen de esfuerzo

| Fase | Estimado |
|------|----------|
| 0 · Preparación y sandbox | 2-3 días |
| 1 · Modelo de impuestos | 1-1.5 semanas |
| 2 · Config fiscal por tenant | 3-5 días |
| 3 · Integración y emisión | 1-1.5 semanas |
| 4 · Representación + notas crédito | 1 semana |
| 5 · Pruebas y producción | 1 semana |
| **Total** | **~5-6 semanas** |

## Riesgos / puntos de atención

1. **Precios con impuesto incluido**: el cálculo hacia atrás debe cuadrar al centavo
   con lo que Factus/DIAN validan (redondeos). Resolver en Fase 0 con pruebas reales.
2. **Credenciales por tenant**: cifrado en reposo obligatorio; nunca en logs.
3. **Documento equivalente POS**: la normativa empuja a que el tiquete POS también
   sea electrónico — la arquitectura de Fase 3 debe dejar el "tipo de documento"
   parametrizable para agregarlo sin reescribir.
4. **Ventas sin cliente** (mostrador): mapear a "consumidor final" (documento 222222222222)
   según convención DIAN.
5. **Insumos espejo y servicios** (IDs virtuales ≥1M, `es_servicio`): el mapper debe
   cubrirlos — todo lo facturable necesita tributo y unidad de medida.
