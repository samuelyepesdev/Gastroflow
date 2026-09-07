# Sistema de Roles y Permisos

## Usuarios de Prueba

Los siguientes usuarios han sido creados para pruebas. **IMPORTANTE**: Cambiar las contraseñas en producción.

| Usuario | Contraseña | Rol | Descripción |
|---------|-----------|-----|-------------|
| `admin` | `admin123` | Admin | Acceso completo al sistema |
| `mesero` | `mesero123` | Mesero | Gestión de mesas y pedidos |
| `cocinero` | `cocinero123` | Cocinero | Gestión de cola de cocina |
| `cajero` | `cajero123` | Cajero | Facturación y ventas |

## Roles y Permisos

### 🔴 Admin (Administrador)
**Permisos:** TODOS los permisos del sistema

- ✅ Ver, crear, editar, eliminar productos
- ✅ Importar productos desde Excel
- ✅ Ver, crear, editar, eliminar clientes
- ✅ Ver y gestionar mesas
- ✅ Ver y gestionar cocina
- ✅ Crear y ver facturas
- ✅ Ver y exportar ventas
- ✅ Ver y editar configuración
- ✅ Ver y gestionar usuarios y roles

### 🟢 Mesero
**Permisos específicos:**
- ✅ Ver productos (`productos.ver`)
- ✅ Ver clientes (`clientes.ver`)
- ✅ Crear clientes (`clientes.crear`)
- ✅ Ver mesas (`mesas.ver`)
- ✅ Gestionar mesas y pedidos (`mesas.gestionar`)
- ✅ Crear facturas (`facturas.crear`)

**NO puede:**
- ❌ Editar/eliminar productos
- ❌ Editar/eliminar clientes
- ❌ Ver/exportar ventas
- ❌ Ver/gestionar cocina
- ❌ Editar configuración
- ❌ Gestionar usuarios

### 🟡 Cocinero
**Permisos específicos:**
- ✅ Ver productos (`productos.ver`)
- ✅ Ver cola de cocina (`cocina.ver`)
- ✅ Gestionar estados de cocina (`cocina.gestionar`)

**NO puede:**
- ❌ Ver/gestionar mesas
- ❌ Crear facturas
- ❌ Ver ventas
- ❌ Ver/gestionar clientes
- ❌ Editar configuración
- ❌ Gestionar usuarios

### 🔵 Cajero
**Permisos específicos:**
- ✅ Ver productos (`productos.ver`)
- ✅ Ver clientes (`clientes.ver`)
- ✅ Crear clientes (`clientes.crear`)
- ✅ Crear facturas (`facturas.crear`)
- ✅ Ver facturas (`facturas.ver`)
- ✅ Ver ventas (`ventas.ver`)
- ✅ Exportar ventas a Excel (`ventas.exportar`)

**NO puede:**
- ❌ Editar/eliminar productos
- ❌ Editar/eliminar clientes
- ❌ Ver/gestionar mesas
- ❌ Ver/gestionar cocina
- ❌ Editar configuración
- ❌ Gestionar usuarios

## Lista Completa de Permisos

| Permiso | Descripción |
|---------|-------------|
| `productos.ver` | Ver lista de productos |
| `productos.crear` | Crear nuevos productos |
| `productos.editar` | Editar productos existentes |
| `productos.eliminar` | Eliminar productos |
| `productos.importar` | Importar productos desde Excel |
| `productos.pide_nota` | Activar/desactivar "pedir nota para cocina" en cada producto |
| `clientes.ver` | Ver lista de clientes |
| `clientes.crear` | Crear nuevos clientes |
| `clientes.editar` | Editar clientes existentes |
| `clientes.eliminar` | Eliminar clientes |
| `mesas.ver` | Ver lista de mesas |
| `mesas.gestionar` | Gestionar mesas y pedidos (abrir, agregar items, enviar a cocina) |
| `cocina.ver` | Ver cola de cocina |
| `cocina.gestionar` | Actualizar estados de items en cocina (preparar, listo, etc.) |
| `facturas.crear` | Crear nuevas facturas |
| `facturas.ver` | Ver facturas existentes |
| `ventas.ver` | Ver historial de ventas |
| `ventas.exportar` | Exportar ventas a Excel |
| `configuracion.ver` | Ver configuración del sistema |
| `configuracion.editar` | Editar configuración del sistema |
| `usuarios.ver` | Ver lista de usuarios |
| `usuarios.gestionar` | Crear, editar, eliminar usuarios y gestionar roles |

## Comandos Útiles

### Crear usuarios de prueba
```bash
npm run create-test-users
```

### Crear usuario administrador
```bash
npm run create-admin
```

### Ejecutar migraciones
```bash
npm run migrate
```

## Notas de Seguridad

⚠️ **IMPORTANTE:**
1. Los usuarios de prueba tienen contraseñas débiles. Cambiar antes de usar en producción.
2. El sistema usa JWT para autenticación. Los tokens expiran en 24 horas (configurable).
3. Todas las rutas están protegidas con `requireAuth`. Las validaciones de permisos específicos deben agregarse según necesidad.
4. Las contraseñas se almacenan usando bcrypt con salt rounds = 10.

## Verificación de Permisos

Para verificar qué permisos tiene un usuario actualmente autenticado, revisar:
- El objeto `req.user` en las rutas contiene `rol` y `permisos`
- Los permisos se cargan desde la tabla `rol_permisos` al autenticar

