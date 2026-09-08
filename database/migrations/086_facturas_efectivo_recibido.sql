-- Efectivo con el que el cliente pagó, para mostrar "Recibido / Cambio" en el
-- ticket y en la caja. Es SOLO informativo: no entra en el arqueo, que sigue
-- usando monto_efectivo = valor de la venta. El vuelto = efectivo_recibido - total.
ALTER TABLE facturas
ADD COLUMN efectivo_recibido DECIMAL(12,2) NULL DEFAULT NULL
COMMENT 'Efectivo entregado por el cliente al pagar. Informativo. Cambio = efectivo_recibido menos total.'
AFTER monto_transferencia;
