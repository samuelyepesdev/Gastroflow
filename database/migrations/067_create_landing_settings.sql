-- Migration: 067_create_landing_settings.sql
-- Create landing_settings table and seed default config

CREATE TABLE IF NOT EXISTS landing_settings (
    `key` VARCHAR(100) PRIMARY KEY,
    `value` LONGTEXT NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Seed default values
INSERT IGNORE INTO landing_settings (`key`, `value`) VALUES
('color_primary', '#3fc46d'),
('color_primary_hover', '#2e7d46'),
('color_background', '#080b09'),
('color_text', '#e9efea'),
('color_accent', '#c2604f'),
('whatsapp_number', '573173994234'),
('whatsapp_message', 'Hola, me gustaría agendar una demo de GastroFlow'),
('hero_title', 'Deja de adivinar. Empieza a controlar tu margen.'),
('hero_highlight', 'controlar tu margen'),
('hero_subtitle', 'GastroFlow conecta tus ventas, tu inventario y tu cocina en tiempo real. Sabes exactamente cuánto cuesta cada plato y a dónde va cada peso.'),
('privacy_policy', '<h2>1. Responsable del Tratamiento</h2>\n<p>\n  <strong class=\"text-on-surface\">GastroFlow Technologies</strong> (en adelante, \"GastroFlow\", \"nosotros\" o \"la Empresa\") es el responsable del tratamiento de los datos personales recopilados a través de la plataforma <em>gastroflow.app</em> y sus subdominios asociados (en adelante, \"el Servicio\").\n</p>\n<p>Para consultas sobre privacidad puede contactarnos en: <a href=\"mailto:privacidad@gastroflow.app\">privacidad@gastroflow.app</a></p>\n\n<h2>2. Marco Legal Aplicable</h2>\n<p>\n  Esta política se rige principalmente por la legislación colombiana, incluyendo la Ley 1581 de 2012 de Protección de Datos Personales y sus decretos reglamentarios.\n</p>\n\n<h2>3. Datos que Recopilamos</h2>\n<p>\n  Recopilamos datos de registro (nombre, correo, contraseña cifrada), datos operativos del negocio (inventario, platos, recetas, ventas) y datos técnicos de uso (dirección IP, cookies esenciales).\n</p>\n\n<h2>4. Finalidades del Tratamiento</h2>\n<p>\n  Los datos se utilizan para proveer, mantener y mejorar el Servicio, procesar pagos, brindar soporte técnico y cumplir con las obligaciones legales vigentes.\n</p>'),
('terms_conditions', '<h2>1. Descripción del Servicio</h2>\n<p>\n  GastroFlow es una plataforma SaaS (Software como Servicio) multi-tenant que ofrece herramientas de gestión operativa para restaurantes, incluyendo ventas, mesas, inventarios, recetas e integraciones.\n</p>\n\n<h2>2. Registro y Cuenta</h2>\n<p>\n  Para usar el Servicio debe registrarse con información veraz. El Usuario es responsable de mantener la confidencialidad de sus credenciales de acceso.\n</p>\n\n<h2>3. Planes de Suscripción y Pagos</h2>\n<p>\n  GastroFlow ofrece planes con ciclos de pago mensuales o anuales. Las tarifas vigentes se cobran por adelantado. En caso de impago, la cuenta podrá suspenderse después del periodo de gracia de 7 días.\n</p>\n\n<h2>4. Limitación de Responsabilidad</h2>\n<p>\n  GastroFlow no será responsable de daños indirectos ni pérdida de beneficios derivados del uso o imposibilidad de uso del Servicio.\n</p>');
