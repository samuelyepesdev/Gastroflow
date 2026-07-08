# 🔄 Diagrama de Actividad Completo

Este documento describe la secuencia lógica de actividades operativas y administrativas de GastroFlow, abarcando desde la preparación de la caja hasta la facturación final y auditoría del inventario.

---

## 1. Diagrama de Actividad Operativa (UML / Mermaid)

El siguiente diagrama detalla los hilos de ejecución paralelos y secuenciales de Caja, Salón/Mesas, Cocina e Inventario.

```mermaid
graph TD
    %% Inicio y Caja
    Start([Apertura de Caja]) --> OpenRegister[Registrar Monto Inicial]
    OpenRegister --> CheckVenta{¿Tipo de Venta?}

    %% Flujo 1: Mesa / Salón
    CheckVenta -->|Mesa / Salón| OpenTable[Abrir Mesa y Crear Pedido]
    OpenTable --> TakeOrder{¿Toma de Orden?}
    TakeOrder -->|Mesero| WaiterOrder[Mesero toma orden desde Tablet]
    TakeOrder -->|Menú QR| CustomerOrder[Cliente ordena escaneando el QR]
    WaiterOrder & CustomerOrder --> SendKitchen[Enviar Comanda a Cocina]
    
    %% Cocina
    SendKitchen --> ChefView[Cocinero ve la comanda por SSE]
    ChefView --> PrepFood[Preparar Alimentos]
    PrepFood --> MarkReady[Marcar Plato como Listo]
    MarkReady --> ServeTable[Servir a la Mesa]
    
    %% Facturación Mesa
    ServeTable --> RequestBill[Cliente pide prefactura]
    RequestBill --> ProcessPayment[Cajero procesa Pago]

    %% Flujo 2: POS Mostrador
    CheckVenta -->|Venta POS Directa| SelectItems[Seleccionar productos en pantalla]
    SelectItems --> ProcessPayment

    %% Acciones Post-Pago (Comunes)
    ProcessPayment --> CreateInvoice[Registrar Factura en BD]
    
    %% Ejecución en paralelo
    CreateInvoice --> fork_actions{Acciones en Paralelo}
    fork_actions --> DeductInventory[Deducir Stock por Insumos de Receta]
    fork_actions --> RegisterIncome[Registrar Dinero en Finanzas]
    fork_actions --> SendWhatsApp[WhatsApp Bot: Enviar PDF de Factura]
    
    DeductInventory & RegisterIncome & SendWhatsApp --> join_actions{Unión de Flujos}
    
    %% Cierre de Caja
    join_actions --> DayEnded{¿Fin de Turno?}
    DayEnded -->|No| CheckVenta
    DayEnded -->|Sí| CloseRegister[Arqueo Físico de Caja]
    CloseRegister --> AuditDiff[Calcular Faltantes / Sobrantes]
    AuditDiff --> EndState([Turno Cerrado])
```

---

## 2. Descripción de Puntos de Control y Bifurcación

### A. Bifurcación de Tipo de Venta
El cajero u operador decide si la transacción se maneja como comanda de mesa (salón) o venta directa (POS). La venta de salón habilita estados en cocina y servicio en mesas; la venta POS procesa el pago inmediatamente, optimizando tiempos de fila.

### B. Notificaciones de Cocina (SSE)
Cuando se envía una comanda a cocina, el backend no obliga a recargar la página. Usa conexiones abiertas mediante **Server-Sent Events (SSE)**. Si la conexión falla, se utiliza un fallback de sondeo corto (short polling) para garantizar la consistencia en el estado de la cola táctil.

### C. Post-procesamiento Asíncrono de Facturas
Al cerrar un pago con éxito, se ejecutan de manera inmediata tres subprocesos:
1. **Deducción de Stock:** Se consulta la ficha técnica del producto. Si posee ingredientes asociados, se restan las cantidades correspondientes a cada insumo en base al factor de desperdicio configurado.
2. **Registro de Flujo de Caja:** Se suma el valor al arqueo total teórico esperado de la caja del turno activo.
3. **Notificación Digital:** El bot de WhatsApp toma el PDF autogenerado de la factura y lo despacha al móvil del cliente.
