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
                color_primary: '#6366f1',
                color_primary_hover: '#4f46e5',
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
  <strong>GastroFlow</strong> (en adelante, "GastroFlow", "nosotros" o "la Empresa") es el responsable del tratamiento de los datos personales recopilados a través de la plataforma <em>gastroflow.digital</em> y sus subdominios asociados (en adelante, el "Servicio"). Domicilio: San José del Guaviare, Colombia. Para consultas sobre privacidad puede contactarnos en: <a href="mailto:gastroflow.digital@gmail.com">gastroflow.digital@gmail.com</a>.
</p>

<h2>2. Marco Legal Aplicable</h2>
<p>
  Esta política se rige principalmente por la legislación colombiana, incluyendo la Ley 1581 de 2012 de Protección de Datos Personales, la Ley 1266 de 2008, el Decreto 1074 de 2015 (que compila el Decreto 1377 de 2013) y demás normas concordantes, así como por las instrucciones de la Superintendencia de Industria y Comercio (SIC).
</p>

<h2>3. Datos que Recopilamos</h2>
<p>GastroFlow es una plataforma multi-tenant: cada restaurante (Tenant) es responsable de los datos que ingresa sobre su propio negocio, sus empleados y sus clientes. Recopilamos las siguientes categorías de datos:</p>
<h3>3.1 Datos de cuenta y acceso</h3>
<p>
  Nombre de usuario, nombre completo, correo electrónico y contraseña (almacenada siempre cifrada, nunca en texto plano) de cada persona que accede al sistema, junto con su rol (administrador, mesero, cocinero, cajero).
</p>
<h3>3.2 Datos del negocio (Tenant)</h3>
<p>
  Razón social o nombre comercial, NIT, dirección, ciudad, régimen fiscal, logo y color de marca del restaurante.
</p>
<h3>3.3 Datos operativos</h3>
<p>
  Productos, recetas, insumos, inventario, mesas, pedidos, ventas y movimientos de caja generados por el uso diario del sistema.
</p>
<h3>3.4 Datos de clientes del restaurante</h3>
<p>
  Cuando un restaurante factura a un cliente identificado (persona natural o jurídica), se guardan los datos necesarios para la factura: nombre, tipo y número de documento, dirección, teléfono y correo. Estos datos son ingresados y controlados por el restaurante, no por el comensal directamente. Respecto de esta información, el restaurante actúa como responsable del tratamiento y GastroFlow como encargado, procesándola únicamente conforme a sus instrucciones y a la ley.
</p>
<h3>3.5 Datos de comensales del Menú QR</h3>
<p>
  El Menú QR es de uso anónimo: no requiere que el comensal cree una cuenta ni se identifique. Sin embargo, las notas de pedido que el comensal escriba libremente (por ejemplo, "sin cebolla" o instrucciones de preparación) quedan guardadas junto al pedido para que cocina las prepare, y son visibles para el personal del restaurante correspondiente.
</p>
<h3>3.6 Datos de pago de la suscripción</h3>
<p>
  GastroFlow no almacena números de tarjeta ni códigos de seguridad. El cobro de la suscripción se procesa a través de la pasarela de pagos Wompi, que nos entrega únicamente una referencia tokenizada del método de pago (no los datos completos de la tarjeta) para poder realizar los cobros recurrentes autorizados.
</p>
<h3>3.7 Datos técnicos</h3>
<p>
  Dirección IP (usada para limitar solicitudes abusivas y bloquear direcciones con actividad sospechosa), tipo de navegador, registros de actividad y cookies — ver el detalle en nuestra <a href="/legal/cookies">Política de Cookies</a>.
</p>

<h2>4. Finalidades del Tratamiento</h2>
<p>Los datos se utilizan para: proveer, mantener y mejorar el Servicio y sus distintos módulos; gestionar el registro y la cuenta; procesar pagos y suscripciones; emitir facturación POS y electrónica en nombre del restaurante cuando este lo solicite; brindar soporte técnico y atención al cliente; enviar comunicaciones operativas y, cuando exista autorización, comerciales; prevenir fraude, abuso y accesos no autorizados; cumplir con las obligaciones legales vigentes; y, con su consentimiento explícito, medir el uso de nuestras páginas públicas mediante analítica web.</p>

<h2>5. Autorización del Titular</h2>
<p>
  El tratamiento de los datos personales requiere la autorización previa, expresa e informada del titular. Dicha autorización se obtiene, entre otros medios, al aceptar esta política durante el proceso de registro o al continuar utilizando el Servicio. El titular puede revocar su autorización en cualquier momento, en los términos previstos en esta política y en la ley.
</p>

<h2>6. Derechos del Titular</h2>
<p>
  De conformidad con la Ley 1581 de 2012, el titular de los datos personales tiene derecho a:
</p>
<ul>
  <li>Conocer, actualizar y rectificar sus datos personales frente a GastroFlow.</li>
  <li>Solicitar prueba de la autorización otorgada para el tratamiento.</li>
  <li>Ser informado sobre el uso que se ha dado a sus datos personales.</li>
  <li>Presentar quejas ante la Superintendencia de Industria y Comercio por infracciones a la ley.</li>
  <li>Revocar la autorización y/o solicitar la supresión de sus datos cuando no exista un deber legal o contractual de conservarlos.</li>
  <li>Acceder de forma gratuita a sus datos personales que hayan sido objeto de tratamiento.</li>
</ul>

<h2>7. Procedimiento para Ejercer sus Derechos</h2>
<p>
  El titular o sus causahabientes pueden ejercer sus derechos enviando una solicitud (consulta o reclamo) al correo <a href="mailto:gastroflow.digital@gmail.com">gastroflow.digital@gmail.com</a>, indicando su identificación, el motivo de la solicitud y los datos de contacto.
</p>
<p>
  Las consultas serán atendidas en un término máximo de diez (10) días hábiles contados a partir de su recibo; cuando no sea posible atenderlas dentro de dicho plazo, se informará al interesado y el término no superará cinco (5) días hábiles adicionales. Los reclamos se atenderán en un término máximo de quince (15) días hábiles; si no fuere posible, se informará al interesado y el plazo no superará ocho (8) días hábiles adicionales.
</p>

<h2>8. Transmisión y Transferencia a Terceros</h2>
<p>GastroFlow comparte datos personales con proveedores que actúan como encargados del tratamiento y que le apoyan en la prestación del Servicio, únicamente para el fin que se indica. Ninguno de ellos está autorizado a usar sus datos para fines comerciales propios ni GastroFlow vende los datos personales de los titulares.</p>
<table>
  <thead><tr><th>Proveedor</th><th>Finalidad</th><th>Datos involucrados</th></tr></thead>
  <tbody>
    <tr><td>Wompi</td><td>Procesamiento del cobro de la suscripción</td><td>Referencia tokenizada del método de pago, monto, estado del cobro</td></tr>
    <tr><td>Proveedor tecnológico de facturación electrónica (DIAN)</td><td>Emisión de facturas electrónicas válidas ante la DIAN</td><td>Datos fiscales del restaurante y del cliente facturado, detalle de la venta</td></tr>
    <tr><td>Cloudflare</td><td>Protección contra ataques, red de distribución de contenido y almacenamiento de imágenes (logos, fotos de producto)</td><td>Dirección IP, archivos de imagen subidos por el restaurante</td></tr>
    <tr><td>Google Analytics</td><td>Analítica de visitantes de páginas públicas, solo con consentimiento previo</td><td>Datos de navegación anonimizados</td></tr>
    <tr><td>Sentry</td><td>Monitoreo y diagnóstico de errores técnicos del Servicio</td><td>Contexto técnico del error (puede incluir fragmentos de la solicitud que falló)</td></tr>
    <tr><td>Proveedor de correo (SMTP)</td><td>Envío de correos transaccionales (verificación de cuenta, notificaciones)</td><td>Nombre y correo electrónico del destinatario</td></tr>
    <tr><td>Railway</td><td>Infraestructura de hospedaje del servidor y la base de datos</td><td>Todos los datos del Servicio, como custodio de la infraestructura</td></tr>
  </tbody>
</table>

<h2>9. Transferencias Internacionales</h2>
<p>
  Dado que el Servicio se apoya en infraestructura de nube y proveedores ubicados fuera de Colombia, algunos datos pueden ser transferidos o transmitidos a otros países. En tales casos, GastroFlow adopta medidas para que dichas transferencias cumplan con las exigencias de la Ley 1581 de 2012 y las instrucciones de la SIC, garantizando niveles adecuados de protección.
</p>

<h2>10. Tiempo de Conservación</h2>
<p>
  Los datos personales se conservan durante el tiempo necesario para cumplir las finalidades descritas y las obligaciones legales aplicables. Cuando el Usuario cancela su cuenta, sus datos podrán conservarse hasta por treinta (30) días para permitir su exportación (ver la cláusula de Terminación de los <a href="/legal/terminos">Términos y Condiciones</a>), tras lo cual serán eliminados o anonimizados, salvo que una norma exija su conservación por un plazo mayor.
</p>

<h2>11. Medidas de Seguridad</h2>
<p>
  GastroFlow implementa medidas técnicas, humanas y administrativas razonables para proteger los datos personales contra acceso no autorizado, pérdida, alteración o divulgación, incluyendo el cifrado de contraseñas, la gestión de sesión mediante una cookie de autenticación httpOnly (no accesible desde JavaScript en el navegador) y el aislamiento lógico entre restaurantes en el entorno multi-tenant. No obstante, ningún sistema es completamente infalible, por lo que GastroFlow no puede garantizar una seguridad absoluta.
</p>

<h2>12. Cookies</h2>
<p>
  El Servicio utiliza cookies esenciales necesarias para su funcionamiento, como las requeridas para mantener la sesión iniciada y garantizar la seguridad. En las páginas públicas también podemos usar cookies analíticas, que solo se instalan con su consentimiento previo a través de un aviso de cookies. El detalle completo está en nuestra <a href="/legal/cookies">Política de Cookies</a>.
</p>

<h2>13. Datos de Menores</h2>
<p>
  El Servicio está dirigido a establecimientos y personas mayores de edad. GastroFlow no recopila de forma consciente datos personales de menores de edad como titulares directos del Servicio. Cuando el Usuario cargue datos de terceros, será su responsabilidad contar con las autorizaciones correspondientes.
</p>

<h2>14. Registro Nacional de Bases de Datos (RNBD)</h2>
<p>
  Cuando GastroFlow se encuentre obligada conforme a la normatividad vigente, inscribirá sus bases de datos en el Registro Nacional de Bases de Datos administrado por la Superintendencia de Industria y Comercio.
</p>

<h2>15. Modificaciones a esta Política</h2>
<p>
  GastroFlow podrá modificar esta Política de Tratamiento de Datos Personales en cualquier momento. Los cambios se publicarán en el Servicio con indicación de la fecha de última actualización y, cuando los cambios sean sustanciales, se comunicarán por correo electrónico o mediante aviso dentro del Servicio.
</p>

<h2>16. Contacto</h2>
<p>
  Para cualquier inquietud relacionada con esta política o con el tratamiento de sus datos personales, puede escribirnos a <a href="mailto:gastroflow.digital@gmail.com">gastroflow.digital@gmail.com</a>.
</p>`,
                terms_conditions: `<h2>1. Aceptación de los Términos</h2>
<p>
  Los presentes Términos y Condiciones (en adelante, los "Términos") regulan el acceso y uso de la plataforma GastroFlow (en adelante, "GastroFlow", "nosotros" o "la Empresa"), disponible en <em>gastroflow.digital</em> y sus subdominios asociados (en adelante, el "Servicio"). Al registrarse, acceder o utilizar el Servicio, el usuario (en adelante, el "Usuario") declara haber leído, entendido y aceptado íntegramente estos Términos. Si no está de acuerdo, deberá abstenerse de usar el Servicio.
</p>

<h2>2. Definiciones</h2>
<ul>
  <li><strong>Servicio:</strong> la plataforma GastroFlow en su totalidad, incluyendo el software, la infraestructura y el soporte asociado.</li>
  <li><strong>Tenant / Restaurante:</strong> la cuenta de negocio (un restaurante o cadena) que contrata el Servicio y cuyos datos operativos están aislados de los de cualquier otro Tenant.</li>
  <li><strong>Titular de la Cuenta:</strong> la persona natural o jurídica que registra y administra el Tenant (normalmente el propietario o administrador del restaurante).</li>
  <li><strong>Usuario:</strong> cualquier persona con credenciales de acceso dentro de un Tenant (administrador, mesero, cocinero, cajero).</li>
  <li><strong>Comensal:</strong> el cliente final del restaurante, que puede interactuar con partes públicas del Servicio (por ejemplo el Menú QR) sin necesidad de una cuenta.</li>
</ul>

<h2>3. Descripción del Servicio</h2>
<p>GastroFlow es una plataforma SaaS (Software como Servicio) multi-tenant que ofrece herramientas de gestión operativa para restaurantes, incluyendo entre otros los siguientes módulos:</p>
<ul>
  <li>Punto de venta (POS) y facturación directa en mostrador.</li>
  <li>Gestión de mesas, pedidos y su ciclo de vida hasta la facturación.</li>
  <li>Menú QR público para autoconsumo del comensal, con notas por producto.</li>
  <li>Cola de cocina (KDS) y agrupación por estaciones de preparación.</li>
  <li>Inventario, insumos, recetas y costeo de platos.</li>
  <li>Caja diaria, turnos y arqueo.</li>
  <li>Facturación POS y facturación electrónica ante la DIAN a través de un proveedor tecnológico autorizado.</li>
  <li>Órdenes de compra y gestión de proveedores.</li>
  <li>Analítica de ventas y del negocio.</li>
  <li>Suscripción y cobro automático recurrente.</li>
</ul>
<p>
  El Servicio se ofrece bajo una modalidad de suscripción y puede evolucionar en el tiempo mediante la adición, modificación o retiro de funcionalidades, sin que ello implique una modificación sustancial de estos Términos, salvo que se indique lo contrario.
</p>

<h2>4. Registro y Cuenta</h2>
<p>
  Para usar el Servicio el Usuario debe registrarse suministrando información veraz, completa y actualizada, incluyendo los datos fiscales del restaurante (NIT, dirección, régimen fiscal) cuando aplique. El Titular de la Cuenta es el único responsable de mantener la confidencialidad de las credenciales de acceso de todos los Usuarios que cree dentro de su Tenant, así como de todas las actividades realizadas bajo dichas credenciales. Deberá notificar de inmediato a GastroFlow cualquier uso no autorizado o brecha de seguridad de la que tenga conocimiento.
</p>
<p>
  El Titular de la Cuenta declara ser mayor de edad y contar con la capacidad legal para obligarse, así como con la representación suficiente para vincular al establecimiento o persona jurídica en cuyo nombre utiliza el Servicio.
</p>

<h2>5. Roles y Usuarios del Restaurante</h2>
<p>
  El Titular de la Cuenta puede crear Usuarios adicionales (mesero, cocinero, cajero, administrador) y asignarles permisos específicos dentro del sistema. El Titular es responsable de que cada Usuario tenga únicamente el nivel de acceso que corresponda a su función, y de revocar el acceso cuando un empleado deje de estar autorizado.
</p>

<h2>6. Planes, Precios y Pago de la Suscripción</h2>
<p>
  GastroFlow ofrece planes de suscripción con ciclos de pago mensuales o anuales. Las tarifas vigentes se publican en el Servicio, están expresadas en pesos colombianos (COP) y se cobran por adelantado a través de la pasarela de pagos Wompi. Salvo indicación en contrario, la suscripción se renueva automáticamente por periodos iguales al contratado, hasta que el Usuario la cancele conforme a la cláusula de Suspensión y Terminación. Al vincular un método de pago, usted autoriza a GastroFlow a realizar los cobros recurrentes correspondientes; GastroFlow no almacena los datos completos de su tarjeta, que son procesados y custodiados directamente por Wompi. En caso de impago, mora o rechazo del medio de pago, la cuenta podrá suspenderse después de un periodo de gracia de siete (7) días calendario, sin perjuicio del derecho de GastroFlow a cobrar los valores adeudados.
</p>

<h2>7. Facturación Electrónica</h2>
<p>
  Cuando el Tenant activa la facturación electrónica, GastroFlow actúa como orquestador técnico: transmite los datos de cada venta a un proveedor tecnológico autorizado por la DIAN para la emisión del documento fiscal (CUFE, XML, PDF). El Titular de la Cuenta es responsable de la exactitud de los datos fiscales del restaurante y de sus clientes que se usan para dicha emisión, así como de sus obligaciones tributarias ante la DIAN. GastroFlow no sustituye la asesoría contable o tributaria del restaurante.
</p>

<h2>8. Reembolsos</h2>
<p>
  Salvo que la ley aplicable disponga lo contrario o que las partes acuerden algo distinto por escrito, los pagos realizados no son reembolsables, incluso si el Usuario cancela antes de que finalice el ciclo de facturación en curso. La cancelación surtirá efectos al término del periodo ya pagado, durante el cual el Usuario conservará el acceso al Servicio. El detalle completo está en nuestra <a href="/legal/reembolsos">Política de Reembolsos y Cancelación</a>.
</p>

<h2>9. Propiedad Intelectual y Licencia de Uso</h2>
<p>
  El Servicio, incluyendo su software, código fuente, diseño, marcas, logotipos, interfaces y documentación, es propiedad exclusiva de GastroFlow o de sus licenciantes y está protegido por las normas de propiedad intelectual aplicables. Estos Términos no transfieren al Usuario ninguna titularidad sobre el Servicio.
</p>
<p>
  GastroFlow otorga al Usuario una licencia limitada, no exclusiva, intransferible y revocable para acceder y utilizar el Servicio durante la vigencia de la suscripción y únicamente para los fines previstos en estos Términos. Queda prohibido copiar, modificar, descompilar, realizar ingeniería inversa, revender o sublicenciar el Servicio, salvo autorización expresa y escrita de la Empresa.
</p>

<h2>10. Propiedad y Tratamiento de los Datos del Usuario</h2>
<p>
  Los datos, contenidos e información que el Usuario cargue o genere a través del Servicio (por ejemplo, ventas, inventarios, recetas y datos de sus propios clientes) son y seguirán siendo de su propiedad (en adelante, los "Datos del Usuario"). El Usuario otorga a GastroFlow una licencia limitada para alojar, procesar y tratar dichos datos con el único fin de prestar y mejorar el Servicio.
</p>
<p>
  Al tratarse de una plataforma multi-tenant, GastroFlow implementa medidas de aislamiento lógico razonables para que los Datos del Usuario de un cliente no sean accesibles por otros clientes. El tratamiento de datos personales se rige además por la <a href="/legal/privacidad">Política de Privacidad</a>, que forma parte integral de estos Términos.
</p>

<h2>11. Uso Aceptable</h2>
<p>El Usuario se obliga a utilizar el Servicio de manera lícita y conforme a estos Términos. En particular, el Usuario no podrá:</p>
<ul>
  <li>Usar el Menú QR, las notas de pedido u otros campos de texto libre para publicar contenido ilegal, difamatorio o que infrinja derechos de terceros.</li>
  <li>Utilizar el Servicio para fines fraudulentos o que infrinjan la normativa aplicable, incluida la tributaria.</li>
  <li>Intentar vulnerar la seguridad del Servicio, acceder a datos de otro Tenant o eludir mecanismos de autenticación.</li>
  <li>Sobrecargar, interferir o interrumpir la infraestructura del Servicio mediante uso automatizado abusivo (scraping masivo, ataques de denegación de servicio).</li>
  <li>Revender, redistribuir o poner el Servicio a disposición de terceros no autorizados.</li>
  <li>Cargar código malicioso, virus o contenido que resulte ofensivo, difamatorio o contrario a la ley.</li>
</ul>
<p>El incumplimiento de esta cláusula podrá dar lugar a la suspensión o terminación inmediata de la cuenta.</p>

<h2>12. Disponibilidad del Servicio</h2>
<p>
  GastroFlow realizará esfuerzos comercialmente razonables para mantener el Servicio disponible de forma continua; sin embargo, el Servicio se presta "tal cual" y "según disponibilidad", sin garantía de operación ininterrumpida o libre de errores. Pueden existir ventanas de mantenimiento programado o interrupciones no planeadas por causas ajenas a nuestro control (fallas de proveedores de infraestructura, conectividad, fuerza mayor).
</p>

<h2>13. Integraciones y Servicios de Terceros</h2>
<p>
  El Servicio puede integrarse con servicios de terceros (por ejemplo, pasarelas de pago, proveedores de nube o herramientas de facturación electrónica). GastroFlow no controla ni es responsable por el funcionamiento, la disponibilidad o las prácticas de dichos terceros. El uso de esas integraciones puede estar sujeto a los términos y políticas propios de cada proveedor, que el Usuario acepta al habilitarlas.
</p>

<h2>14. Suspensión y Terminación</h2>
<p>
  El Usuario puede cancelar su suscripción en cualquier momento desde el Servicio o solicitándolo a través de los canales de contacto; la cancelación evita renovaciones futuras y surte efectos al final del ciclo ya pagado. GastroFlow podrá suspender o terminar la cuenta del Usuario, con o sin previo aviso según la gravedad, en caso de incumplimiento de estos Términos, impago, uso indebido del Servicio o cuando lo exija la ley.
</p>
<p>
  Terminada la relación, el Usuario dispondrá de un plazo de treinta (30) días para exportar sus Datos del Usuario, transcurrido el cual GastroFlow podrá eliminarlos de forma definitiva, salvo la información que deba conservarse por obligación legal (por ejemplo, registros fiscales).
</p>

<h2>15. Limitación de Responsabilidad</h2>
<p>
  En la máxima medida permitida por la ley, GastroFlow no será responsable por daños indirectos, incidentales, especiales o consecuenciales, ni por lucro cesante, pérdida de datos, de clientela o de oportunidades comerciales, derivados del uso o de la imposibilidad de uso del Servicio, incluyendo decisiones de negocio tomadas con base en la información generada por la plataforma.
</p>
<p>
  En todo caso, la responsabilidad total y acumulada de GastroFlow frente al Usuario por cualquier reclamación relacionada con el Servicio no excederá el monto efectivamente pagado por el Usuario durante los doce (12) meses anteriores al hecho que dio origen a la reclamación.
</p>

<h2>16. Indemnidad</h2>
<p>
  El Usuario mantendrá indemne a GastroFlow, sus administradores, empleados y colaboradores, frente a cualquier reclamación, pérdida o gasto (incluidos honorarios razonables de abogados) que surja del uso indebido del Servicio por parte del Usuario, del incumplimiento de estos Términos, de la vulneración de derechos de terceros o de la inexactitud de la información fiscal o de clientes que este haya registrado.
</p>

<h2>17. Modificaciones a los Términos y a las Tarifas</h2>
<p>
  GastroFlow podrá modificar estos Términos y las tarifas del Servicio en cualquier momento. Los cambios se comunicarán a través del Servicio o por correo electrónico con una antelación razonable de quince (15) días antes de su entrada en vigor. El uso continuado del Servicio con posterioridad a la entrada en vigor de los cambios implicará la aceptación de los mismos. Si el Usuario no está de acuerdo, podrá cancelar su suscripción conforme a estos Términos.
</p>

<h2>18. Fuerza Mayor</h2>
<p>
  GastroFlow no será responsable por el incumplimiento o retraso en sus obligaciones cuando ello obedezca a hechos constitutivos de fuerza mayor o caso fortuito, tales como desastres naturales, fallas generalizadas de internet o energía, actos de autoridad, ciberataques u otras circunstancias ajenas a su control razonable.
</p>

<h2>19. Cesión</h2>
<p>
  El Usuario no podrá ceder ni transferir sus derechos u obligaciones bajo estos Términos sin autorización previa y escrita de GastroFlow. La Empresa podrá ceder estos Términos, total o parcialmente, en el marco de reorganizaciones societarias, fusiones o adquisiciones, informando al Usuario.
</p>

<h2>20. Divisibilidad</h2>
<p>
  Si alguna disposición de estos Términos es declarada inválida, ilegal o inaplicable por autoridad competente, las demás disposiciones conservarán plena validez y eficacia, y la cláusula afectada se interpretará en el sentido que más se aproxime a la intención original de las partes.
</p>

<h2>21. Ley Aplicable y Jurisdicción</h2>
<p>
  Estos Términos se rigen por las leyes de la República de Colombia. Cualquier controversia relacionada con el Servicio se someterá a la jurisdicción de los jueces y tribunales competentes de San José del Guaviare, Colombia, sin perjuicio de los mecanismos alternativos de solución de conflictos que las partes acuerden.
</p>

<h2>22. Notificaciones y Contacto</h2>
<p>
  Para cualquier notificación o consulta relacionada con estos Términos, el Usuario puede contactar a GastroFlow en el correo <a href="mailto:gastroflow.digital@gmail.com">gastroflow.digital@gmail.com</a>. Las notificaciones de GastroFlow al Usuario se entenderán válidamente realizadas mediante avisos dentro del Servicio o al correo electrónico registrado en la cuenta.
</p>`,
                cookies_policy: `<h2>1. ¿Qué son las cookies?</h2>
<p>
  Las cookies son pequeños archivos de texto que un sitio web guarda en su navegador para recordar información entre visitas. GastroFlow usa cookies únicamente en sus páginas públicas (landing, inicio de sesión, registro y documentos legales) — nunca dentro del sistema operativo interno del restaurante, que usa exclusivamente la cookie esencial de sesión.
</p>

<h2>2. Detalle de las cookies que usamos</h2>
<table>
  <thead><tr><th>Cookie</th><th>Tipo</th><th>Finalidad</th><th>Duración</th></tr></thead>
  <tbody>
    <tr><td><code>auth_token</code></td><td>Esencial (propia)</td><td>Mantiene su sesión iniciada de forma segura. Es httpOnly: no puede ser leída por scripts en el navegador. Sin ella no es posible usar el sistema.</td><td>Hasta cerrar sesión o expirar (24 h)</td></tr>
    <tr><td><code>gf_cookie_consent</code></td><td>Esencial (propia)</td><td>Recuerda su elección sobre el banner de cookies para no volver a preguntarle en cada visita.</td><td>Persistente hasta que borre los datos del sitio</td></tr>
    <tr><td><code>_ga</code>, <code>_ga_*</code></td><td>Analítica (Google Analytics)</td><td>Distingue visitantes únicos para generar estadísticas agregadas de uso de las páginas públicas. Solo se instala si usted acepta el banner.</td><td>Hasta 2 años</td></tr>
  </tbody>
</table>

<h2>3. Cookies esenciales vs. analíticas</h2>
<p>
  Las cookies esenciales no requieren su consentimiento porque son indispensables para el funcionamiento del sitio (por ejemplo, mantenerlo con la sesión iniciada). Las cookies analíticas sí requieren su aceptación explícita a través del banner que aparece en su primera visita, y solo se cargan después de que usted acepta.
</p>

<h2>4. Cómo gestionar sus preferencias</h2>
<p>
  Al visitar el sitio por primera vez, un banner le permite Aceptar o Rechazar las cookies analíticas. Su elección se guarda en su navegador y puede cambiarla borrando los datos de navegación de este sitio, lo que hará que el banner vuelva a aparecer. También puede bloquear o eliminar cookies desde la configuración de su navegador, aunque esto puede afectar el funcionamiento del sitio.
</p>

<h2>5. Más información</h2>
<p>
  Para conocer cómo tratamos sus datos personales en general, incluyendo los terceros con los que los compartimos, consulte nuestra <a href="/legal/privacidad">Política de Privacidad</a>.
</p>`,
                refund_policy: `<h2>1. Ciclo de facturación</h2>
<p>
  Las suscripciones a GastroFlow se cobran por adelantado, de forma mensual o anual según el plan contratado, a través de la pasarela de pagos Wompi.
</p>

<h2>2. Cancelación</h2>
<p>
  Puede cancelar su suscripción en cualquier momento desde el panel de administración de su cuenta. La cancelación detiene los cobros futuros, pero el servicio permanece activo hasta el final del periodo ya pagado.
</p>

<h2>3. Reembolsos</h2>
<p>
  Como regla general, los pagos ya realizados no son reembolsables, dado que dan acceso inmediato al Servicio durante todo el periodo facturado. Evaluamos excepciones caso por caso ante cobros duplicados por error técnico o fallas comprobadas del Servicio atribuibles a GastroFlow — en esos casos escríbanos a <a href="mailto:gastroflow.digital@gmail.com">gastroflow.digital@gmail.com</a>.
</p>

<h2>4. Impago y suspensión</h2>
<p>
  Si un cobro no se procesa correctamente, la cuenta cuenta con un periodo de gracia de 7 días antes de suspenderse. Durante la suspensión los datos del restaurante se conservan y el servicio se reactiva automáticamente al regularizar el pago.
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
                    'Crea tu cuenta gratis y empieza a conocer el costo real de cada plato. Si prefieres, agenda una demo por WhatsApp.'
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
