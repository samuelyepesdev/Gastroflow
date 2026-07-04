const pool = require('../../config/database');

class LandingSettingsService {
    /**
     * Retrieve all landing page settings.
     * Returns an object with the key-value pairs, filling in defaults where missing.
     */
    static async getAll() {
        try {
            const [rows] = await pool.query('SELECT `key`, `value` FROM landing_settings');
            const settings = {};
            rows.forEach(row => {
                settings[row.key] = row.value;
            });

            const defaults = {
                color_primary: '#3fc46d',
                color_primary_hover: '#2e7d46',
                color_background: '#080b09',
                color_text: '#e9efea',
                color_accent: '#c2604f',
                whatsapp_number: '573173994234',
                whatsapp_message: 'Hola, me gustaría agendar una demo de GastroFlow',
                hero_title: 'Deja de adivinar. Empieza a controlar tu margen.',
                hero_highlight: 'controlar tu margen',
                hero_subtitle:
                    'GastroFlow conecta tus ventas, tu inventario y tu cocina en tiempo real. Sabes exactamente cuánto cuesta cada plato y a dónde va cada peso.',
                privacy_policy: `<h2>1. Responsable del Tratamiento</h2>
<p>
  <strong>GastroFlow Technologies</strong> (en adelante, "GastroFlow", "nosotros" o "la Empresa") es el responsable del tratamiento de los datos personales recopilados a través de la plataforma <em>gastroflow.app</em> y sus subdominios asociados (en adelante, "el Servicio").
</p>
<p>Para consultas sobre privacidad puede contactarnos en: <a href="mailto:privacidad@gastroflow.app">privacidad@gastroflow.app</a></p>

<h2>2. Marco Legal Aplicable</h2>
<p>
  Esta política se rige principalmente por la legislación colombiana, incluyendo la Ley 1581 de 2012 de Protección de Datos Personales y sus decretos reglamentarios.
</p>

<h2>3. Datos que Recopilamos</h2>
<p>
  Recopilamos datos de registro (nombre, correo, contraseña cifrada), datos operativos del negocio (inventario, platos, recetas, ventas) y datos técnicos de uso (dirección IP, cookies esenciales).
</p>

<h2>4. Finalidades del Tratamiento</h2>
<p>
  Los datos se utilizan para proveer, mantener y mejorar el Servicio, procesar pagos, brindar soporte técnico y cumplir con las obligaciones legales vigentes.
</p>`,
                terms_conditions: `<h2>1. Descripción del Servicio</h2>
<p>
  GastroFlow es una plataforma SaaS (Software como Servicio) multi-tenant que ofrece herramientas de gestión operativa para restaurantes, incluyendo ventas, mesas, inventarios, recetas e integraciones.
</p>

<h2>2. Registro y Cuenta</h2>
<p>
  Para usar el Servicio debe registrarse con información veraz. El Usuario es responsable de mantener la confidencialidad de sus credenciales de acceso.
</p>

<h2>3. Planes de Suscripción y Pagos</h2>
<p>
  GastroFlow ofrece planes con ciclos de pago mensuales o anuales. Las tarifas vigentes se cobran por adelantado. En caso de impago, la cuenta podrá suspenderse después del periodo de gracia de 7 días.
</p>

<h2>4. Limitación de Responsabilidad</h2>
<p>
  GastroFlow no será responsable de daños indirectos ni pérdida de beneficios derivados del uso o imposibilidad de uso del Servicio.
</p>`,
                // Problemas
                problems_title: 'Sin control, el margen se escapa sin que te des cuenta',
                problems_subtitle: 'Estos son los síntomas que vacían la caja de un restaurante mes tras mes.',
                problem1_title: 'Mermas ocultas',
                problem1_desc: 'Insumos que desaparecen sin registro y destruyen tu utilidad cada cierre de mes.',
                problem2_title: 'Costeo a ciegas',
                problem2_desc: 'Vender platos sin saber cuánto cuestan de verdad: el error número uno del sector.',
                problem3_title: 'Caos en cocina',
                problem3_desc: 'Comandas perdidas y retrasos que terminan en clientes molestos y devoluciones.',
                problem4_title: 'Descuadres de caja',
                problem4_desc: 'Diferencias al cerrar el día que nadie sabe explicar. Cero trazabilidad.',

                // Funciones
                features_title: 'Todo lo que tu restaurante necesita, integrado',
                features_subtitle: 'Una plataforma diseñada con gastrónomos para la operación real del día a día.',
                feature1_title: 'Recetas estándar y costeo',
                feature1_desc:
                    'Fichas técnicas que recalculan el costo de cada plato cuando cambian los precios de tus proveedores.',
                feature2_title: 'KDS de cocina',
                feature2_desc:
                    'Pantallas que reemplazan el papel, ordenan las comandas y reducen los tiempos de servicio.',
                feature3_title: 'Inventario en tiempo real',
                feature3_desc: 'El stock se descuenta con cada venta y te avisa antes de quedarte sin insumos clave.',
                feature4_title: 'Caja blindada',
                feature4_desc: 'Arqueos, flujos de efectivo y auditoría detallada para que cada cierre cuadre.',
                feature5_title: 'Mapa de mesas',
                feature5_desc: 'Gestión visual del salón para una rotación más rápida y mejor servicio.',
                feature6_title: 'Control antifraude',
                feature6_desc: 'Autorizaciones remotas para anulaciones y descuentos. Nada se mueve sin permiso.',

                // Resultados
                results_title: 'Resultados que puedes medir, no promesas',
                results_subtitle: 'Nuestros clientes transforman su operación dentro de los primeros 30 días de uso.',
                result1_metric: '−12%',
                result1_label: 'en mermas',
                result2_metric: '+18%',
                result2_label: 'velocidad',
                result3_metric: '100%',
                result3_label: 'trazabilidad',

                // Planes
                plans_title: 'Escalamos con tu negocio',
                plans_subtitle: 'Un plan para cada etapa de tu restaurante. Agenda una demo y diseñamos el tuyo.',
                plan1_title: 'Operativo',
                plan1_desc: 'Ideal para dark kitchens y locales pequeños.',
                plan1_features: 'Punto de venta (POS)\nVentas y facturación\nApp de meseros (1)\nReportes básicos',
                plan2_title: 'Control Pro',
                plan2_desc: 'Para restaurantes de servicio completo.',
                plan2_features:
                    'Todo lo del plan Operativo\nFichas técnicas y costeo Pro\nGestión de inventarios\nKDS pantalla de cocina\nApp de meseros ilimitada',
                plan3_title: 'Premium',
                plan3_desc: 'Para cadenas y multilocales.',
                plan3_features:
                    'Todo lo del plan Pro\nDashboard multi-sede\nAPI personalizada\nSoporte 24/7 prioritario',

                // Testimonios
                testimonials_title: 'Lo que dicen los restauranteros',
                testimonial1_quote:
                    'GastroFlow nos mostró exactamente por dónde se nos iba el dinero. Bajamos el desperdicio un 15% en solo dos meses.',
                testimonial1_author: 'Carlos Méndez',
                testimonial1_role: 'La Parrilla del Sol',
                testimonial2_quote:
                    'El KDS cambió la dinámica en cocina. Antes era un caos de papeles; ahora todo fluye con una precisión increíble.',
                testimonial2_author: 'Lucía Rivera',
                testimonial2_role: 'Bistró Urbano',
                testimonial3_quote:
                    'Por fin tengo paz mental al cerrar caja. Sé exactamente qué se vendió y qué hay en stock desde mi celular.',
                testimonial3_author: 'Roberto G.',
                testimonial3_role: 'Burger Loft',

                // CTA Final
                cta_title: '¿Listo para tomar el control de tu rentabilidad?',
                cta_subtitle:
                    'Únete a los más de 500 restaurantes que ya operan con GastroFlow. Agenda tu demo gratuita hoy.'
            };

            return { ...defaults, ...settings };
        } catch (error) {
            console.error('Error fetching landing settings:', error);
            throw error;
        }
    }

    /**
     * Save/update multiple settings keys.
     * @param {Object} settings Object containing key-value pairs to update.
     */
    static async update(settings) {
        try {
            for (const [key, value] of Object.entries(settings)) {
                await pool.query(
                    'INSERT INTO landing_settings (`key`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value` = ?',
                    [key, value, value]
                );
            }
            return true;
        } catch (error) {
            console.error('Error updating landing settings:', error);
            throw error;
        }
    }
}

module.exports = LandingSettingsService;
