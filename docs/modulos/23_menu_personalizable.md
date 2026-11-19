# 🧭 Módulo 23: Menú personalizable (ocultar enlaces de la barra)

### 1. Descripción Funcional
Cada usuario puede **ocultar enlaces de su barra de navegación** para tener un menú más corto (útil con muchos permisos o módulos del plan). En el menú de usuario (arriba a la derecha) → **Personalizar menú**: una ventana con todos los enlaces a los que el usuario *tiene acceso*, agrupados como en la barra (Operación, Comercial y gestión, Catálogo y clientes, Más), con un interruptor por enlace, «Mostrar todos / Ocultar todos» y «Restablecer».

* **Es solo visual.** Ocultar un enlace **no quita el permiso ni cambia el plan**: la ruta sigue funcionando si se entra por su dirección o desde otra pantalla, y se puede volver a mostrar cuando se quiera.
* **Por usuario:** cada persona del restaurante elige el suyo; no afecta a los demás. No requiere ningún permiso especial.
* **Siempre visibles:** Configuración y el menú de usuario (así nadie pierde cómo restablecer).
* El superadmin no lo usa (su barra es distinta).

### 2. Componentes del Código
* **Catálogo y reglas puras:** [navbarCatalogo.js](../../utils/navbarCatalogo.js) — qué enlaces se pueden ocultar (`GRUPOS`), `normalizarOcultos`, `menuVisible`, `hayMas`, `catalogoParaUsuario`.
* **Servicio:** [MenuPersonalService.js](../../services/Shared/MenuPersonalService.js) — guarda/lee/restablece; invalida la caché del usuario (`user:ctx:<id>`).
* **API:** `GET | PUT | DELETE /api/menu-personal` (`routes/tenant/menuPersonal.js`), solo sobre el propio usuario autenticado.
* **Barra:** `middleware/navbarLocals.js` calcula `nav.canMenu` (lo que se dibuja) a partir de `nav.can` (acceso real, que otras partes consultan: alertas, asistente, perfil...) y `nav.catalogoMenu` para la ventana. `views/partials/_navbar_links.ejs` dibuja con `nav.canMenu`.
* **Ventana:** `views/partials/_menu_personal.ejs`, `public/js/core/menu-personal.js`, `public/css/core/menu-personal.css` (marca "Cloche").

### 3. Datos
* `usuarios.nav_oculto` (TEXT, JSON con las claves ocultas; `NULL` = todo visible). `AuthService.getUserById` lo devuelve como `nav_oculto` y `middleware/tenant.js` lo copia a `req.user`.

### 4. Notas
* Algunas claves cubren varios enlaces: `cocina` incluye «Estaciones de Cocina» y `proveedores` incluye «Órdenes de Compra».
* Si se oculta *Proveedores* y *Recetas*, «Inventario» pasa a mostrarse como enlace directo (así lo decide la barra) en vez de ir dentro de «Más».
* Si se oculta *Dashboard*, el primer enlace pasa a ser «Inicio».
* Las claves desconocidas se descartan al guardar, así que no se puede ocultar Configuración ni inventar claves.
