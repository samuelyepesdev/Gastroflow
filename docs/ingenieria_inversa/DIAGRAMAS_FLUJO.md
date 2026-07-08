# 📈 Diagramas de Flujo Algorítmicos

Este documento desglosa a nivel algorítmico y de flujo lógico los tres procesos más importantes del sistema GastroFlow: el descuento de stock automático, el costeo e ingeniería de menú, y el middleware de resolución multi-tenant.

---

## 1. Algoritmo de Deducción Automática de Stock (Recetas en Cascada)

Este algoritmo se dispara al momento de registrarse una factura de venta (POS o mesa). Busca restar del inventario los insumos exactos requeridos, contemplando porcentajes de merma o desperdicio.

```mermaid
flowchart TD
    A[Inicio: Registrar Factura] --> B[Obtener lista de ítems vendidos]
    B --> C[Seleccionar primer ítem]
    C --> D{¿Producto tiene receta configurada?}
    
    D -- No --> E[Registrar salida del producto terminado directamente]
    D -- Sí --> F[Consultar receta_detalles para el producto]
    
    F --> G[Obtener ingredientes: insumo_id, cantidad_base, merma]
    G --> H[Seleccionar primer ingrediente de la receta]
    
    H --> I["Calcular deducción:
    Cantidad = cantidad_vendida * cantidad_base * (1 + merma/100)"]
    
    I --> J["Actualizar Tabla insumos:
    stock_actual = stock_actual - Cantidad"]
    
    J --> K["Registrar fila en movimientos_inventario:
    tipo = 'salida', motivo = 'Venta Factura #ID'"]
    
    K --> L{¿Hay más ingredientes en la receta?}
    L -- Sí --> H
    L -- No --> M{¿Hay más productos en la factura?}
    
    M -- Sí --> C
    M -- No --> N[Fin: Actualización de stock completada]
```

---

## 2. Algoritmo de Costeo de Platos e Ingeniería de Menú

Determina el costo real de preparación de un plato y alerta si el precio de venta actual genera pérdidas o márgenes inferiores a los objetivos comerciales definidos por el restaurante.

```mermaid
flowchart TD
    A[Inicio: Solicitar costeo de Producto] --> B[Consultar receta vinculada al producto]
    B --> C["Inicializar Costo Insumos = 0"]
    C --> D[Obtener ingredientes y proporciones de receta_detalles]
    
    D --> E[Seleccionar primer ingrediente]
    E --> F["Consultar costo_unitario en tabla insumos"]
    F --> G["Costo ingrediente = cantidad * (1 + merma/100) * costo_unitario"]
    G --> H["Costo Insumos = Costo Insumos + Costo ingrediente"]
    
    H --> I{¿Hay más ingredientes?}
    I -- Sí --> E
    
    I -- No --> J["Consultar Costos Fijos Indirectos del local (tabla costos_fijos)
    y dividir por volumen promedio mensual de ventas"]
    
    J --> K["Costo Total Plato = Costo Insumos + Costo Fijo Prorrateado"]
    K --> L["Consultar Margen de Ganancia Deseado (%) en configuracion_costeo"]
    
    L --> M["Calcular Precio Venta Sugerido:
    Precio = Costo Total Plato / (1 - Margen Deseado / 100)"]
    
    M --> N["Consultar precio_unidad actual en tabla productos"]
    
    N --> O{¿Precio actual < Precio Sugerido?}
    O -- Sí --> P[Activar Indicador Rojo: Alerta de Margen Insuficiente]
    O -- No --> Q[Activar Indicador Verde: Margen Comercial Saludable]
    
    P & Q --> R[Fin: Renderizar resultado en vista Costeo]
```

---

## 3. Middleware de Contexto Multi-Tenant (`attachTenantContext`)

Garantiza que ningún usuario de un restaurante pueda consultar, modificar o eliminar datos pertenecientes a otro restaurante. Actúa como el cortafuegos lógico primario en la capa HTTP.

```mermaid
flowchart TD
    A[Llegada de Petición HTTP] --> B{¿Es ruta global / Superadmin?}
    
    B -- Sí --> C[Saltar resolución tenant ➔ Validar rol Superadmin]
    B -- No --> D["Obtener identificador del tenant
    (desde subdominio, ruta, cabecera o cookie de sesión)"]
    
    D --> E{¿Identificador encontrado?}
    E -- No --> F[Retornar Error 400: Local no especificado]
    
    E -- Sí --> G["Consultar tabla tenants donde slug = identificador"]
    G --> H{¿Existe el tenant en BD?}
    
    H -- No --> I[Retornar Error 404: Restaurante no registrado]
    H -- Sí --> J{¿tenant.activo == true?}
    
    J -- No --> K[Retornar Error 403: Suscripción Suspendida]
    J -- Sí --> L["Inyectar contexto en objeto de solicitud:
    req.tenant = tenant_db"]
    
    L --> M["Modificar consultas SQL subsiguientes:
    Agregar cláusula WHERE tenant_id = req.tenant.id"]
    
    M --> N[Pasar control al Controlador (next)]
```
