# GastroFlow — Inventario de vistas y design tokens para exportar a Figma

> Generado el 2026-07-06. Uso: checklist para importar cada pantalla con **html.to.design**
> (extensión de navegador, capturando con sesión iniciada) y base para crear los
> estilos/variables en Figma.

Base local: `http://localhost:3000` (ajustar puerto si Laragon usa otro).

---

## 1. Inventario de vistas (pantallas a importar)

### A. Públicas (sin login) — 6 pantallas

| # | URL | Vista | CSS propio |
|---|-----|-------|-----------|
| 1 | `/` | Landing page | `landing.css` |
| 2 | `/legal/privacidad` | Política de privacidad | (landing) |
| 3 | `/legal/terminos` | Términos y condiciones | (landing) |
| 4 | `/auth/login` | Login | `auth/login.css` |
| 5 | `/auth/cambiar-password` | Cambio de contraseña forzado | `auth/cambiar-password.css` |
| 6 | `/qr/:tenantSlug/:qrToken` | Menú QR público (cliente en mesa) | `modulos/menu-qr.css` |

### B. App del restaurante (login como usuario tenant) — 22 pantallas

| # | URL | Vista | CSS propio |
|---|-----|-------|-----------|
| 7 | `/dashboard` | Dashboard principal (widgets + analytics + focus) | `modulos/dashboard.css` |
| 8 | `/pos` | Terminal POS split-screen | `modulos/pos.css` |
| 9 | `/facturas/facturar` | Flujo facturar evento (POS eventos, wizard por pasos) | `modulos/pos-eventos.css` |
| 10 | `/mesas` | Grid de mesas | `modulos/mesas.css` |
| 11 | `/mesas/qrs` | Generador de QRs por mesa | `modulos/mesas.css` |
| 12 | `/cocina` | Panel de cocina (tabs de comandas) | `modulos/cocina.css` |
| 13 | `/caja` | Caja (apertura/cierre) | `modulos/caja.css` |
| 14 | `/caja/historial` | Historial de cierres de caja | `modulos/caja.css` |
| 15 | `/ventas` | Ventas (filtros, resumen, tabla agrupada) | `modulos/ventas.css` |
| 16 | `/facturas/:id/imprimir` | Factura para impresión (ticket) | `core/factura.css` |
| 17 | `/productos` | Productos (filtro por categoría, modal costeo) | `modulos/productos.css` |
| 18 | `/inventario` | Inventario (tabla + modales) | `modulos/inventario.css` |
| 19 | `/proveedores` | Proveedores (tabla, facturas, historial) | `modulos/proveedores.css` |
| 20 | `/recetas` | Recetas | `modulos/recetas.css` |
| 21 | `/costeo` | Costeo (tabs: insumos, recetas, rentabilidad, alertas, config) | `modulos/costeo.css` |
| 22 | `/analitica` | Analítica BI (charts Chart.js) | `modulos/analitica.css` |
| 23 | `/finanzas` | Finanzas | — (Bootstrap) |
| 24 | `/eventos` | Eventos (tabla + modal) | `modulos/eventos.css` |
| 25 | `/servicios` | Servicios | `modulos/servicios.css` |
| 26 | `/clientes` | Clientes (tabla + modal) | `modulos/clientes.css` |
| 27 | `/configuracion` | Configuración del restaurante | — (Bootstrap) |
| 28 | `/whatsapp` | Configuración WhatsApp | — (Bootstrap) |

Extras del bloque B: `/perfil` (perfil de usuario, resumen + config) y `/soporte`
(tickets del tenant) → **24 pantallas** en total con login tenant.

> Vistas con **tabs internos** (importar cada tab como frame aparte en Figma):
> costeo (5 tabs), cocina, dashboard (paneles), ventas (estados de filtro).
> Vistas con **modales** relevantes: productos, inventario, clientes, proveedores,
> eventos, mesas, pos, recetas, ventas, dashboard — abrir el modal antes de capturar
> si se quiere la versión con modal.

### C. Superadmin (login como superadmin) — 9 pantallas

| # | URL | Vista | CSS propio |
|---|-----|-------|-----------|
| 31 | `/admin/dashboard` | Dashboard superadmin | `admin/dashboard.css` |
| 32 | `/admin/tenants` | Gestión de restaurantes (sidebar + tabs) | `admin/tenants-modern.css` |
| 33 | `/admin/planes` | Planes y addons (tabs) | `admin/planes.css` |
| 34 | `/admin/permisos` | Matriz de permisos | `admin/permisos.css` |
| 35 | `/admin/ventas` | Ventas globales | `admin/ventas.css` |
| 36 | `/admin/sistema` | Parámetros y temas del sistema | `admin/sistema.css` |
| 37 | `/admin/soporte` | Soporte (tickets) | — |
| 38 | `/admin/reportes` | Reportes (mensual/PDF) | `admin/reportes.css` |
| 39 | `/admin/landing` | Editor de landing | — |

### D. Páginas de error — 3 pantallas

| # | URL | Vista | CSS |
|---|-----|-------|-----|
| 40 | `/cualquier-ruta-inexistente` | 404 | `core/404.css` |
| 41 | (forzar) | Error genérico | `core/error.css` |
| 42 | (forzar) | Error interno 500 | `core/error.css` |

**Total: ~39 pantallas base** (más variantes de tabs/modales si se quieren completas).

---

## 2. Design tokens actuales

### Hallazgo importante

**No existe un archivo global de tokens.** La base es **Bootstrap 5.3.2** (CDN) +
Bootstrap Icons 1.11.1, y cada módulo define su propio `:root` en su CSS. En la
práctica conviven **3 sub-marcas** — esto es exactamente lo que vale la pena
unificar al armar el design system en Figma:

### 2.1 Landing (tema oscuro)

| Token | Valor |
|-------|-------|
| `--primary` | `#FF5E36` (naranja marca) |
| `--primary-hover` | `#E04D27` |
| `--secondary` | `#1E293B` |
| `--background` | `#0B0F19` |
| `--surface` | `rgba(22,30,49,.65)` |
| `--surface-hover` | `rgba(30,41,69,.85)` |
| `--text-main` | `#F8FAFC` |
| `--text-muted` | `#94A3B8` |
| `--border` | `rgba(255,255,255,.06)` |
| `--accent` (éxito) | `#10B981` |
| `--accent-alt` (peligro) | `#EF4444` |
| Fuentes | **Inter** (cuerpo) / **Outfit** (títulos, 700) |

### 2.2 App del restaurante (tema claro, base Bootstrap)

| Token | Valor |
|-------|-------|
| Primario UI | `#6366f1` → `#4f46e5` (indigo, gradiente 135°) |
| Navbar | gradiente `#1e3a5f` → `#0f172a` |
| Fondo body | `#f8fafc` |
| Superficie card | `#ffffff` |
| Texto principal | `#1e293b` |
| Texto muted | `#64748b` |
| Borde | `#f1f5f9` |
| Verde módulo dashboard | `#2e7d46` / oscuro `#1b4d2b` / soft `#eef6f0` |
| POS eventos: paso activo | `#3b82f6`; completado `#10b981`; inactivo `#e2e8f0` |
| Radios | 7px (navbar/botones), 20px (cards premium), 8px (scrollbar) |
| Sombra card premium | `0 10px 25px -5px rgba(0,0,0,.05), 0 8px 10px -6px rgba(0,0,0,.05)` |
| Fuente | del sistema/Bootstrap (Inter en algunos módulos) |

### 2.3 Superadmin (tema claro gris)

| Token | Valor |
|-------|-------|
| Acento dashboard | `#2e7d46` / `#1b4d2b` / soft `#eaf5ed` |
| Acento permisos | `#5b5bd6` / `#3a3ab0` / soft `#f0f0fd` |
| Acento tenants | `#3b82f6` / `#2563eb` sobre primario `#0f172a` |
| Fondo body | `#eef0f4` (dashboard/permisos), `#f8fafc` (tenants) |
| Texto | `#0f172a` / `#475569` / muted `#7a8499`–`#8a94a6` |
| Borde | `#e9ebef` / `#e2e8f0` |
| Fuente | **Plus Jakarta Sans** |

### 2.4 Semánticos (compartidos en todo el sistema)

| Rol | Valor |
|-----|-------|
| Éxito | `#10b981` |
| Advertencia | `#f59e0b` |
| Peligro | `#ef4444` |
| Info | `#3b82f6` |

---

## 3. Sugerencia de estructura en Figma

```
📁 GastroFlow Design System
├── 📄 01 · Fundamentos (colores, tipografía, radios, sombras — sección 2)
├── 📄 02 · Landing & Legal (frames 1–3, tema oscuro)
├── 📄 03 · Auth (frames 4–5)
├── 📄 04 · App Restaurante (frames 7–28 + perfil/soporte)
├── 📄 05 · Menú QR (frame 6, viewport móvil 390px)
├── 📄 06 · Superadmin (frames 31–39)
└── 📄 07 · Errores (frames 40–42)
```

Viewports recomendados al capturar: **1440px** (desktop), y repetir en **390px**
las vistas móviles críticas: menú QR, POS, mesas, cocina, landing.
