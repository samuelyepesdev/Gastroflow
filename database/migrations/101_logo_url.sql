-- 101_logo_url.sql
-- Los logos (perfil del tenant y configuración de impresión de facturas) se
-- guardaban como BLOB directo en MySQL (ver 035_tenants_logo_blob.sql), lo que
-- infla la base de datos y obliga a re-codificar a base64 en cada carga de
-- página. A partir de ahora se suben a Cloudflare R2 (carpeta 'logos/', ver
-- R2StorageService) y solo se guarda la URL pública. Las columnas *_data/*_tipo
-- se dejan intactas (fuente para scripts/migrate-logos-to-r2.js) hasta migrar
-- los logos ya existentes; una vez migrados quedan en NULL para ese tenant.
USE restaurante;

ALTER TABLE tenants
ADD COLUMN logo_url VARCHAR(500) NULL AFTER logo_tipo;

ALTER TABLE configuracion_impresion
ADD COLUMN logo_url VARCHAR(500) NULL AFTER logo_tipo;
