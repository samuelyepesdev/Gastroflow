# Informe de rendimiento y verificación defensiva — noviembre 2026

Entorno: Node 24, MySQL 8.4, base aislada `gastroflow_stress` (60.000 facturas, 12.000 pedidos, 3.000 clientes,
150 productos, 40 mesas), servidor local en el puerto 3100, plan Premium. Todo se ejecutó contra localhost; las
herramientas se niegan a correr si la base no contiene "stress" en el nombre.

Herramientas: `stress-tests/gf-suite.js` (carga), `seed-stress-data.js`, `seed-second-tenant.js`,
`security-checks.js`. Pasos de uso en `stress-tests/README.md`. Los JSON de cada corrida quedan en
`stress-tests/reports/` (ignorado por git).

## 1. Resultados de rendimiento

Se hicieron 4 corridas (línea base, rampas de 50 y 100 conexiones, pico de 250 y 30–60 s de resistencia).
Ninguna produjo errores ni timeouts.

| Ruta | Antes | Después | Causa y arreglo |
|---|---|---|---|
| `/analitica/datos` | 20 req/s, p50 ~0,9 s | 2.149 req/s, p50 7 ms | Caché de 120 s con single-flight |
| `/ventas?page=1` | 2–3 req/s, p50 ~4,8 s | 19 req/s, p50 ~0,9 s | Paginar ids antes del JOIN y de las subconsultas |
| `/api/cocina/cola` | 175 req/s, p50 89 ms | 680 req/s, p50 24 ms | Índice en `pedidos` e `IN` en lugar de `NOT IN` |
| `/api/dashboard/stats` en frío | 0 req/s (estampida de caché) | 681 req/s | `CacheService.remember` (una sola ejecución en vuelo) |
| Consulta SUM efectivo/transferencia | 423 ms | 24 ms | Índice `idx_facturas_tenant_aparte_fecha` |
| Planes activos | ~166.000 consultas en una corrida | 1 por minuto | Caché de 60 s (se consultaba en cada petición autenticada) |

Cambios: migración `127_indices_rendimiento.sql` (3 índices compuestos), `CacheService.remember`,
`PlanService.getAll` con caché, `StatsService`, `AnaliticaService`, `VentaRepository.getAllWithFilters`,
`CocinaRepository` y `MesaDashboardController`. Commit `ddcb610`.

**Carga mixta (pesos reales de uso):** el techo ronda los 65 req/s con 50, 100 o 250 conexiones; lo que crece es la
latencia (p50 745 ms con 50 conexiones, 3,6 s con 250). El proceso Node llegó a ~534 MB y MySQL a 22 conexiones
(el pool es de 20). Mi lectura es que el límite lo ponen las rutas con respuestas grandes y renderizado EJS en un
solo hilo; es una inferencia, no hay perfil de CPU que la confirme.

## 2. Qué consume la base de datos

- Lo que más pesaba eran la lista de ventas (subconsultas correlacionadas sobre 60k filas), la consulta de planes
  repetida por petición y las sumas de facturas sin índice adecuado. Todo eso está corregido arriba.
- Quedan sin tocar: la consulta de uso de insumos (`SUM(df.cantidad)…`, ~63 millones de filas examinadas), las
  agregaciones del listado de ventas del superadmin (`getPaginaAdmin`, recorren todos los tenants) y `/api/mesas`
  (~13.000 filas examinadas por petición).

## 3. Riesgos de caída identificados

1. **Pool de 20 conexiones:** con 250 conexiones simultáneas se satura y la latencia crece de forma lineal. No cae,
   pero degrada.
2. **Respuestas sin paginar:** `/api/clientes` devuelve ~9,8 MB con 3.000 clientes (p50 ~1,6 s bajo carga);
   `/api/productos` y `/productos` ~546 KB (~700 ms). Con más datos empeoran de forma proporcional.
3. **Realtime y caché en memoria:** SSE y `CacheService` viven en el proceso; no escalan a varias instancias.
4. **Memoria:** ~534 MB de pico en la prueba; conviene vigilarla si crece el volumen.

## 4. Verificación defensiva

Resultado de `security-checks.js`: 26 de 28 en la última pasada completa; las 2 diferencias eran expectaciones del
script que se ajustaron al corregir los hallazgos (no se volvió a ejecutar completo).

**Correcto:**
- Rutas protegidas responden 401 sin sesión; un JWT inválido y uno con `alg=none` también.
- Payloads SQL/HTML en `?q=` no rompen la consulta ni se reflejan; la tabla `clientes` queda intacta.
- Aislamiento entre tenants (tenant 1 contra tenant 3): lectura, edición y borrado de recursos ajenos dan 404; el
  dueño sí los ve; la cabecera `X-Tenant-Id` y `?tenant_id=` se ignoran.
- El límite de login corta con 429 y no se evade rotando `cf-connecting-ip` (el limitador usa la IP real).

**Hallazgos corregidos (commit `61e2fb0`):**
1. JSON malformado respondía 500; ahora 400 (`middleware/errorHandler.js`).
2. `username` sin tope de largo se escribía entero en el log de auditoría; ahora máximo 100 (y 200 para la
   contraseña).
3. `/api/clientes/abc` respondía 500; ahora 400.

## 5. Pendiente

- **Límite global de peticiones (verificado):** la clave del limitador es `getClientIp` (`utils/clientIp.js`,
  `app.js:266`), que acepta `cf-connecting-ip` si es una IP válida. Quien llegue directo al servidor, sin pasar por
  Cloudflare, puede rotar esa cabecera y no acumula peticiones: la suite de carga lo hizo y no recibió ningún 429.
  Es un riesgo solo si el origen es alcanzable sin Cloudflare. Mitigación: aceptar la cabecera únicamente cuando la
  conexión venga de los rangos de Cloudflare, o bloquear el acceso directo al origen. Requiere decisión.
- **Migración 127:** aplicada solo en `gastroflow_stress`; falta aplicarla en desarrollo y producción.
- **`/api/clientes`:** paginar cambia el contrato de la API y la interfaz; requiere decisión.
- **`/api/productos`, `/api/mesas`, insumos y `getPaginaAdmin`:** sin optimizar.
- **Otros controladores:** repiten `parseInt(req.params.id)` sin validar; solo se corrigió clientes.
- **Saturación bajo ataque:** no se simuló aparte; el comportamiento bajo 250 conexiones está en la suite de carga.
- **Clasificación de tráfico:** el middleware de baneo de escáneres sigue sin aplicar bloqueo (incidente CGNAT).
