const HubRepository = require('../../repositories/Admin/HubRepository');
const { hoyColombia, sumarDias, rangoUtcColombia } = require('../../utils/dateHelpers');
const { version } = require('../../package.json');

// Por encima de este tiempo la base de datos se considera lenta y se avisa.
const DB_LENTA_MS = 500;

/**
 * Arma el resumen para Safe Hub siguiendo su contrato (docs/integracion-sistemas.md
 * del repo safe-hub): { version, metricas: [...], alertas: [...] }.
 * Si la base de datos falla, el error sube y el controlador responde 503: así
 * el Hub marca el sistema como caído en vez de mostrar números a medias.
 */
class HubResumenService {
    static async obtener() {
        const hoy = hoyColombia();
        const hoyRango = rangoUtcColombia(hoy);
        const semanaRango = rangoUtcColombia(sumarDias(hoy, -6), hoy);

        const [latenciaDb, restaurantes, usuarios, ventasHoy, cobrosFallidos7d] = await Promise.all([
            HubRepository.pingDb(),
            HubRepository.restaurantes(),
            HubRepository.usuariosActivos(),
            HubRepository.ventas(hoyRango.utcDesde, hoyRango.utcHasta),
            HubRepository.cobrosFallidos(semanaRango.utcDesde, semanaRango.utcHasta)
        ]);

        const enProduccion = process.env.NODE_ENV === 'production';
        const suspendidos = Number(restaurantes.suspendidos_por_pago);
        const conCobroFallido = Number(restaurantes.con_cobro_fallido);

        const metricas = [
            { clave: 'ventas_hoy', etiqueta: 'Ventas de hoy', valor: Number(ventasHoy.total), formato: 'pesos' },
            {
                clave: 'facturas_hoy',
                etiqueta: 'Facturas de hoy',
                valor: Number(ventasHoy.facturas),
                formato: 'numero'
            },
            {
                clave: 'restaurantes_activos',
                etiqueta: 'Restaurantes activos',
                valor: Number(restaurantes.activos),
                formato: 'numero'
            },
            {
                clave: 'restaurantes_vendieron_hoy',
                etiqueta: 'Restaurantes con ventas hoy',
                valor: Number(ventasHoy.restaurantes),
                formato: 'numero'
            },
            { clave: 'usuarios_activos', etiqueta: 'Usuarios activos', valor: Number(usuarios), formato: 'numero' },
            {
                clave: 'suspendidos_por_pago',
                etiqueta: 'Suspendidos por impago',
                valor: suspendidos,
                formato: 'numero'
            },
            {
                clave: 'latencia_db_ms',
                etiqueta: 'Latencia de la base de datos (ms)',
                valor: latenciaDb,
                formato: 'numero'
            },
            {
                clave: 'entorno',
                etiqueta: 'Entorno',
                valor: enProduccion ? 'Producción' : 'Desarrollo',
                formato: 'texto'
            }
        ];

        const alertas = [];
        if (suspendidos > 0) {
            alertas.push({
                nivel: 'warning',
                mensaje: `${suspendidos} restaurante(s) suspendido(s) por falta de pago.`
            });
        }
        if (conCobroFallido > suspendidos) {
            alertas.push({
                nivel: 'warning',
                mensaje: `${conCobroFallido - suspendidos} restaurante(s) con el último cobro fallido.`
            });
        }
        if (Number(cobrosFallidos7d) > 0) {
            alertas.push({
                nivel: 'info',
                mensaje: `${cobrosFallidos7d} cobro(s) de suscripción fallido(s) en los últimos 7 días.`
            });
        }
        if (latenciaDb > DB_LENTA_MS) {
            alertas.push({ nivel: 'warning', mensaje: `La base de datos responde lento (${latenciaDb} ms).` });
        }

        return { version, metricas, alertas };
    }
}

module.exports = HubResumenService;
