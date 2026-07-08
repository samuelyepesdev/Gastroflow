# 🎭 Diagrama y Matriz de Casos de Uso Exhaustivo

Este documento detalla exhaustivamente todos los casos de uso del sistema GastroFlow, organizados por actor y módulo funcional.

---

## 1. Diagrama de Casos de Uso Completo (Mermaid)

```mermaid
graph TD
    %% Actores
    SA[Superadmin]
    AL[Admin Local]
    CA[Cajero]
    ME[Mesero]
    CO[Cocinero]
    CL[Cliente / Comensal]

    %% Casos de Uso de Superadmin
    subgraph Módulo Global SaaS (Superadmin)
        UC_T[Gestionar Inquilinos / Tenants]
        UC_Pl[Gestionar Planes y Precios]
        UC_O[Override de Permisos Individuales]
        UC_Tk[Responder Tickets de Soporte]
        UC_Met[Ver Métricas Globales del SaaS]
    end
    SA --> UC_T
    SA --> UC_Pl
    SA --> UC_O
    SA --> UC_Tk
    SA --> UC_Met

    %% Casos de Uso de Admin Local
    subgraph Configuración y Administración (Admin Local)
        UC_Emp[Gestionar Empleados y Roles]
        UC_Rec[Crear y Configurar Recetas]
        UC_CF[Gestionar Costos Fijos]
        UC_Param[Configurar Temas y Parámetros]
        UC_WA[Configurar WhatsApp Bot y Plantillas]
        UC_Sl[Disposición de Sala y Mesas]
        UC_Ser[Gestionar Catálogo de Servicios]
        UC_Fin[Ver Panel de Finanzas e Informes]
        UC_ML[Ejecutar Modelo Predictivo]
    end
    AL --> UC_Emp
    AL --> UC_Rec
    AL --> UC_CF
    AL --> UC_Param
    AL --> UC_WA
    AL --> UC_Sl
    AL --> UC_Ser
    AL --> UC_Fin
    AL --> UC_ML

    %% Casos de Uso de Cajero
    subgraph Caja y POS (Cajero)
        UC_Apert[Apertura de Turno de Caja]
        UC_Mov[Registrar Entradas / Salidas Manuales]
        UC_POS[Venta Directa POS]
        UC_Borr[Aparcar / Reanudar Borradores POS]
        UC_Cob[Cobrar Cuenta de Mesa / Pagos Divididos]
        UC_Arq[Ejecutar Arqueo y Cierre de Turno]
    end
    CA --> UC_Apert
    CA --> UC_Mov
    CA --> UC_POS
    CA --> UC_Borr
    CA --> UC_Cob
    CA --> UC_Arq

    %% Casos de Uso de Mesero
    subgraph Operación de Salón (Mesero)
        UC_Ped[Abrir Pedido en Mesa]
        UC_Itm[Adicionar Ítems y Servicios]
        UC_Not[Agregar Notas de Preparación]
        UC_Trans[Transferir Ítems / Cuentas entre Mesas]
        UC_Pref[Solicitar Prefactura / Cuenta]
    end
    ME --> UC_Ped
    ME --> UC_Itm
    ME --> UC_Not
    ME --> UC_Trans
    ME --> UC_Pref

    %% Casos de Uso de Cocinero
    subgraph Cola de Cocina (Cocinero)
        UC_Coc[Ver Cola de Comandas en SSE]
        UC_Prep[Marcar Ítem en Preparación]
        UC_Ready[Marcar Ítem como Listo]
    end
    CO --> UC_Coc
    CO --> UC_Prep
    CO --> UC_Ready

    %% Casos de Uso de Cliente
    subgraph Autoconsumo (Cliente)
        UC_Scan[Escanear QR de Mesa]
        UC_Menu[Ver Carta Interactiva]
        UC_Ord[Enviar Pedido Directo]
        UC_WAP[Recibir Factura por WhatsApp]
    end
    CL --> UC_Scan
    CL --> UC_Menu
    CL --> UC_Ord
    CL --> UC_WAP
```

---

## 2. Catálogo Completo de Casos de Uso (Todos los Módulos)

### Módulo: Autenticación y Seguridad
* **UC-SEC-01: Iniciar Sesión:** Validación de credenciales del personal contra BD aislada del tenant.
* **UC-SEC-02: Cerrar Sesión:** Destrucción de cookies JWT y tokens de sesión.
* **UC-SEC-03: Editar Perfil:** Modificación de datos básicos por parte del usuario.
* **UC-SEC-04: Auditar Operaciones:** Registro en `tenant_audit` de acciones críticas de seguridad.

### Módulo: Superadmin (SaaS General)
* **UC-SUP-01: Crear Tenant:** Registro inicial de un restaurante inquilino.
* **UC-SUP-02: Suspender/Activar Tenant:** Bloqueo de acceso de locales morosos.
* **UC-SUP-03: Crear Plan:** Definición de características y asignación en JSON de módulos válidos.
* **UC-SUP-04: Override de Permisos:** Adición de permisos específicos a usuarios saltando rol por defecto.
* **UC-SUP-05: Responder Tickets:** Gestión de peticiones en `soporte_tickets`.

### Módulo: Administración del Local (Admin Local)
* **UC-ADM-01: CRUD de Personal:** Gestión de usuarios de sucursal (`mesero`, `cajero`, `cocinero`).
* **UC-ADM-02: Configurar Sala:** Creación y ordenamiento de `mesas` (físicas y virtuales).
* **UC-ADM-03: Catálogo de Servicios:** Creación de cargos de servicio (`servicios`).
* **UC-ADM-04: Configurar WhatsApp:** Escaneo del código QR para pareo de la instancia del bot.
* **UC-ADM-05: Ejecutar Predicción ML:** Consulta del modelo predictivo para la demanda del fin de semana.

### Módulo: Menú y Productos
* **UC-PRO-01: CRUD de Productos:** Altas, bajas (soft delete) y edición de la carta.
* **UC-PRO-02: Importar/Exportar Excel:** Carga masiva de la lista de precios y códigos.
* **UC-PRO-03: Categorías de Producto:** Crear agrupaciones comerciales para la carta.

### Módulo: Mesas y Pedidos (Salón)
* **UC-SAL-01: Crear Pedido:** Ocupación de mesa y vinculación a un mesero.
* **UC-SAL-02: Modificar Pedido:** Adición de platos, extras y servicios externos.
* **UC-SAL-03: Transferir Mesa:** Mover consumos o cuentas completas a otra mesa física.
* **UC-SAL-04: Pagos Divididos:** Dividir facturación por ítems individuales del pedido.

### Módulo: Punto de Venta (POS Rápido)
* **UC-POS-01: Venta Rápida:** Facturación directa a clientes casuales.
* **UC-POS-02: Pausar Venta (Borrador):** Guardar carrito en `pos_borradores` para atender otra comanda.
* **UC-POS-03: Recuperar Borrador:** Reanudar y cerrar venta pausada.

### Módulo: Cola de Cocina
* **UC-COC-01: Recibir Comanda:** Carga dinámica en tiempo real (SSE) de platos a preparar.
* **UC-COC-02: Flujo de Estado:** Transición de plato de `pendiente` ➔ `preparando` ➔ `listo` ➔ `servido`.

### Módulo: Inventarios y Proveedores
* **UC-INV-01: CRUD de Insumos:** Registro de materias primas y stock mínimo.
* **UC-INV-02: Movimientos de Inventario:** Registro de compras, ajustes manuales y mermas.
* **UC-INV-03: Factura de Proveedor:** Carga de documento de compra en base de datos (`LONGBLOB`).
* **UC-INV-04: Alertas de Stock:** Notificación en panel al cruzar stock mínimo.

### Módulo: Recetas y Costeo
* **UC-REC-01: Crear Ficha Técnica (Receta):** Declaración de composición exacta de platos.
* **UC-REC-02: Configurar Costos Fijos:** Registro de arriendos y salarios fijos mensuales.
* **UC-REC-03: Configurar Margen de Ganancia:** Definición de márgenes comerciales objetivo.
* **UC-REC-04: Alerta de Costeo:** Notificación visual si el costo supera el precio de venta comercial.

### Módulo: Caja Diaria y Arqueo
* **UC-CAJ-01: Apertura de Caja:** Declaración inicial de caja chica.
* **UC-CAJ-02: Movimiento de Caja:** Registro de egresos (pago a proveedores) o ingresos extraordinarios.
* **UC-CAJ-03: Arqueo y Conciliación:** Contraste de dinero en efectivo físico contra saldo esperado del sistema.
* **UC-CAJ-04: Cierre de Caja:** Emisión del comprobante de cuadre de turno.

### Módulo: Clientes y Autoconsumo (Menú QR)
* **UC-CLI-01: Escaneo y Menú QR:** Lectura del catálogo de platos desde la mesa.
* **UC-CLI-02: Auto-pedido QR:** Envío de comanda sin intervención de mesero.
* **UC-CLI-03: Registro Fiscal:** Actualización de NIT y Razón Social del cliente para facturas.
* **UC-CLI-04: Recepción de Ticket:** Notificación interactiva por WhatsApp al concretar el pago.
