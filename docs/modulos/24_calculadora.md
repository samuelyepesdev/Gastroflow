# 24. Calculadora de pérdidas (captación de prospectos)

Gancho comercial: página pública `/calculadora` donde el dueño de un restaurante ingresa 6 cifras y su contacto para ver
cuánto pierde al mes por **reservas que no llegan** y por **merma de cocina**. Cada uso queda como prospecto para que
el superadmin lo contacte por WhatsApp.

## 1. Flujo

1. El visitante abre `/calculadora` (enlazada desde la landing, sección «¿Cuánto pierde tu restaurante cada mes?»).
2. Llena reservas por semana, personas por reserva, gasto por persona, % que no llega, ventas del mes y % de merma
   (los porcentajes traen valores típicos por defecto).
3. Deja nombre del restaurante, celular colombiano (obligatorio), correo (opcional) y **acepta el tratamiento de datos**.
4. `POST /calculadora/calcular` valida, calcula, guarda el prospecto y devuelve las cifras. Sin consentimiento o con
   cualquier dato inválido **no se guarda nada**.
5. El superadmin ve los prospectos en **Comercio → Prospectos** (`/admin/leads`), abre su WhatsApp y marca «Contactado».

## 2. Fórmulas (`services/Public/CalculadoraService.js`)

El cálculo vive **solo en el servidor**; el navegador únicamente envía y pinta.

| Resultado | Fórmula |
| --- | --- |
| Reservas perdidas / mes | `reservas_semana × 4,33 × personas_reserva × ticket_persona × no_show_pct` |
| Merma / mes | `ventas_mes × merma_pct` |
| Pérdida / mes y / año | suma de ambas, y ×12 |
| Recuperable / mes | `40 % de las reservas perdidas + 30 % de la merma` (constantes `RECUPERA_NO_SHOW`, `RECUPERA_MERMA`) |

El recuperable es una **estimación orientativa** y la página lo dice. Si se cambian las proporciones, actualizar también
el texto de la nota en `views/calculadora/index.ejs`.

Los campos son enteros sin separadores: el navegador muestra «45.000» pero envía «45000», y el servidor rechaza
decimales o puntos de miles (de lo contrario «45.000» se leería como 45).

## 3. Datos y privacidad

Tabla `calculadora_leads` (migración `137`): restaurante, teléfono normalizado (10 dígitos), correo, `entradas` (JSON),
pérdida y recuperable mensuales, `consentimiento_at`, `consentimiento_ip` y `contactado`. No lleva `tenant_id`: son
prospectos, no clientes. La evidencia de consentimiento sigue el mismo criterio que las reservas públicas (Ley 1581 de 2012).

## 4. Protecciones

- Límite por IP: 120 consultas / 10 min para la página y **10 cálculos / hora** para el `POST` (cada uno escribe en la base).
- Campo trampa `web` (honeypot): si viene lleno se responde sin guardar.
- Sin sesión ni datos de ningún tenant; la respuesta lleva `Cache-Control: no-store`.

## 5. Archivos

- Rutas: `routes/calculadora_publica.js` (montada en `/calculadora`) y `routes/admin/leads.js` (`/admin/leads`).
- Controladores: `app/Http/Controllers/Public/CalculadoraController.js`, `Admin/LeadsController.js`.
- Servicio y repositorio: `services/Public/CalculadoraService.js`, `repositories/Public/CalculadoraRepository.js`.
- Vistas: `views/calculadora/index.ejs`, `views/admin/leads/index.ejs`. Front: `public/js/modulos/calculadora.js`,
  `public/css/modulos/calculadora.css`, `public/js/admin/leads.js`.
- Pruebas: `tests/unit/services/CalculadoraService.test.js`.
