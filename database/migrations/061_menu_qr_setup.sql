-- Migration 061: Menu QR Setup

-- Añadir qr_token a mesas (debe ser único globalmente o por tenant, pero global es más seguro para URLs cortas)
ALTER TABLE mesas
ADD COLUMN qr_token VARCHAR(64) NULL UNIQUE;

-- Añadir origen y sesión a pedidos
ALTER TABLE pedidos
ADD COLUMN origen ENUM('mesero', 'qr', 'caja') DEFAULT 'mesero',
ADD COLUMN sesion_cliente VARCHAR(64) NULL;

-- Añadir campos para frontend en productos
ALTER TABLE productos
ADD COLUMN mostrar_en_qr BOOLEAN DEFAULT TRUE,
ADD COLUMN imagen_url VARCHAR(255) NULL,
ADD COLUMN descripcion_corta VARCHAR(255) NULL;
