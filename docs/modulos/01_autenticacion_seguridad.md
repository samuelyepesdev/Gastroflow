# 🔑 Módulo 1: Autenticación, Seguridad y Autorización

### 1. Descripción Funcional
Maneja el registro de sesiones de los usuarios, validación de credenciales encriptadas, control de acceso basado en JSON Web Tokens (JWT) y el sistema jerárquico de planes de suscripción y permisos por rol o usuario.

---

### 2. Componentes del Código
* **Controlador:** [AuthController.js](file:///c:/laragon/www/Sistema-Restaurante-Node/app/Http/Controllers/AuthController.js)
* **Servicio:** [AuthService.js](file:///c:/laragon/www/Sistema-Restaurante-Node/services/Shared/AuthService.js)
* **Middlewares:**
  * [auth.js](file:///c:/laragon/www/Sistema-Restaurante-Node/middleware/auth.js) (`requireAuth`, `requireRole`, `requirePermission`)
  * [tenant.js](file:///c:/laragon/www/Sistema-Restaurante-Node/middleware/tenant.js) (`attachTenantContext`)
  * [planFeature.js](file:///c:/laragon/www/Sistema-Restaurante-Node/middleware/planFeature.js) (`requirePlanFeature`)
* **Utilidades:** [planPermissions.js](file:///c:/laragon/www/Sistema-Restaurante-Node/utils/planPermissions.js)

---

### 3. Tablas de Base de Datos Relacionadas
* `usuarios`: Datos del usuario (nombre, email, username, contraseña encriptada en bcrypt, rol y su `tenant_id`).
* `roles`: Roles disponibles (`admin`, `mesero`, `cocinero`, `cajero`, `superadmin`).
* `permisos`: Lista global de permisos (ej. `productos.ver`, `costeo.editar`).
* `rol_permisos`: Permisos asignados por defecto a cada rol de restaurante.
* `user_permisos`: Anulaciones o permisos extra específicos de un usuario (administrados por el Superadmin).

---

### 4. Diagrama de Flujo de Autorización (JWT + Rol + Plan)
```mermaid
sequenceDiagram
    autonumber
    Client->>Middleware (requireAuth): Petición con Token en Cabecera / Cookie
    Middleware (requireAuth)->>Service (AuthService): verifyToken(token)
    Service (AuthService)-->>Middleware (requireAuth): Retorna datos de usuario
    Middleware (requireAuth)->>Middleware (attachTenantContext): Pasa control
    Middleware (attachTenantContext)->>Service (AuthService): getUserById(userId)
    Note over Middleware (attachTenantContext), Service (AuthService): Refresca permisos desde BD en tiempo real
    Service (AuthService)-->>Middleware (attachTenantContext): Permisos frescos del usuario
    Middleware (attachTenantContext)->>Middleware (requirePlanFeature): Pasa control con req.tenant
    Middleware (requirePlanFeature)->>Util (planPermissions): planHasModule() o usuario tiene permiso
    Util (planPermissions)-->>Middleware (requirePlanFeature): true / false
    alt Permitido
        Middleware (requirePlanFeature)->>Controller: Acceso concedido
    else Denegado
        Middleware (requirePlanFeature)-->>Client: Error 403 (No autorizado / Plan insuficiente)
    end
```
