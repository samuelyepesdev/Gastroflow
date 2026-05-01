-- Migration 064: Add Product Description Field
ALTER TABLE productos ADD COLUMN descripcion TEXT NULL;
