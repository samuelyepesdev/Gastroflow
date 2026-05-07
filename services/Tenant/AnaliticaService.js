/**
 * AnaliticaService - Lógica de analítica avanzada y predicción (plan Premium)
 * Usa últimos 3 meses de ventas para resumen y estimación del próximo mes.
 * Relacionado con: StatsRepository
 */

const StatsRepository = require('../../repositories/Tenant/StatsRepository');

/**
 * Retorna el nombre corto de un mes en español.
 */
function nombreMes(month) {
    const nombres = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    return nombres[month - 1] || '';
}

class AnaliticaService {
    /**
     * Resumen de ventas por mes (últimos N meses) para gráficos y análisis
     * Aplicando programación funcional para acumular montos de forma inmutable.
     * @param {number} tenantId
     * @param {number} months
     * @returns {Promise<Object>} { meses, totalGeneral, cantidadFacturas }
     */
    static async getResumenUltimosMeses(tenantId, months = 3) {
        const meses = await StatsRepository.getMonthlySales(tenantId, months, { excludeEventos: true });
        
        // Sumatorias declarativas e inmutables con .reduce
        const totalGeneral = (meses || []).reduce((sum, m) => sum + (parseFloat(m.total_ventas) || 0), 0);
        const cantidadFacturas = (meses || []).reduce((sum, m) => sum + (parseInt(m.cantidad_facturas, 10) || 0), 0);
        
        return {
            meses: (meses || []).map(m => ({
                ...m,
                etiqueta: `${m.year}-${String(m.month).padStart(2, '0')}`,
                nombreMes: nombreMes(m.month)
            })),
            totalGeneral,
            cantidadFacturas
        };
    }

    /**
     * Predicción del próximo mes basada en los últimos 3 meses (promedio + variación típica)
     * @param {number} tenantId
     * @returns {Promise<Object>} Predicción de ventas y ganancias esperadas
     */
    static async getPrediccionProximoMes(tenantId) {
        // Excluir ventas de eventos para que no afecten la predicción
        const meses = await StatsRepository.getMonthlySales(tenantId, 3, { excludeEventos: true });
        if (!meses || !meses.length) {
            return {
                ventasProximoMes: 0,
                rangoMin: 0,
                rangoMax: 0,
                gananciasEsperadas: null,
                posiblesPerdidasVariacion: null,
                mesesUsados: [],
                mensaje: 'No hay datos de ventas de los últimos 3 meses. Genera ventas para ver predicciones.'
            };
        }

        const totales = meses.map(m => parseFloat(m.total_ventas) || 0);
        
        // Promedio matemático declarativo con .reduce
        const promedio = totales.reduce((a, b) => a + b, 0) / totales.length;
        const min = Math.min(...totales);
        const max = Math.max(...totales);
        const variacion = totales.length >= 2 ? (max - min) / 2 : 0;
        
        const rangoMin = Math.max(0, promedio - variacion);
        const rangoMax = promedio + variacion;

        // Margen por defecto 30% si no hay costeo configurado
        const margenPorDefecto = 0.30;
        const gananciasEsperadas = promedio * margenPorDefecto;
        const posiblesPerdidasVariacion = variacion;

        return {
            ventasProximoMes: Math.round(promedio * 100) / 100,
            rangoMin: Math.round(rangoMin * 100) / 100,
            rangoMax: Math.round(rangoMax * 100) / 100,
            gananciasEsperadas: Math.round(gananciasEsperadas * 100) / 100,
            posiblesPerdidasVariacion: Math.round(posiblesPerdidasVariacion * 100) / 100,
            mesesUsados: meses.map(m => ({ ...m, nombreMes: nombreMes(m.month) })),
            mensaje: `Basado en ${meses.length} mes(es) de datos. Las ganancias usan un margen estimado del ${margenPorDefecto * 100}%. Ajusta en Costeo para mayor precisión.`
        };
    }

    /**
     * Datos para la página de analítica: resumen + predicción
     */
    static async getAnaliticaCompleta(tenantId) {
        const [resumen, prediccion] = await Promise.all([
            this.getResumenUltimosMeses(tenantId, 3),
            this.getPrediccionProximoMes(tenantId)
        ]);
        return { resumen, prediccion };
    }
}

module.exports = AnaliticaService;
