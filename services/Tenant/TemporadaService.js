/**
 * TemporadaService - Herramientas de temporada (fin de año): plantillas de promoción y vigencia por fechas
 * de productos/combos. Reutiliza PromocionService (descuentos) y mueve `productos.disponible` por fechas.
 */
const TemporadaRepository = require('../../repositories/Tenant/TemporadaRepository');
const PromocionService = require('./PromocionService');
const { ValidationError } = require('../../utils/errors');
const { hoyColombia, toFechaDia } = require('../../utils/dateHelpers');

// Plantillas de promoción de fin de año. Fechas (mes-día) inclusive; el año se resuelve según hoy.
const PLANTILLAS = [
    {
        id: 'velitas',
        nombre: 'Noche de Velitas',
        descripcion: 'Descuento para la noche del 7 de diciembre, el arranque de la temporada.',
        inicio: '12-07',
        fin: '12-08',
        porcentaje: 10,
        icono: 'bi-lamp'
    },
    {
        id: 'novena',
        nombre: 'Novena de Aguinaldos',
        descripcion: 'Del 16 al 23 de diciembre, para las novenas en familia y de empresa.',
        inicio: '12-16',
        fin: '12-23',
        porcentaje: 10,
        icono: 'bi-people'
    },
    {
        id: 'navidad',
        nombre: 'Navidad',
        descripcion: 'Cena de Nochebuena y almuerzo del 25 de diciembre.',
        inicio: '12-24',
        fin: '12-25',
        porcentaje: 5,
        icono: 'bi-gift'
    },
    {
        id: 'fin_de_ano',
        nombre: 'Fin de año',
        descripcion: 'Del 26 al 31 de diciembre: despedir el año con tu restaurante.',
        inicio: '12-26',
        fin: '12-31',
        porcentaje: 10,
        icono: 'bi-stars'
    }
];

/** Año que corresponde a una fecha mes-día: este año, o el siguiente si la ventana ya terminó. */
function fechasDePlantilla(plantilla, hoy) {
    let anio = Number(hoy.slice(0, 4));
    if (`${anio}-${plantilla.fin}` < hoy) {
        anio += 1;
    }
    return { fecha_inicio: `${anio}-${plantilla.inicio}`, fecha_fin: `${anio}-${plantilla.fin}` };
}

/** Días que faltan para el 24 de diciembre (0 si es hoy, null si ya pasó este año). */
function diasParaNavidad(hoy) {
    const anio = hoy.slice(0, 4);
    const objetivo = Date.parse(`${anio}-12-24T12:00:00Z`);
    const dias = Math.round((objetivo - Date.parse(`${hoy}T12:00:00Z`)) / 86400000);
    return dias >= 0 ? dias : null;
}

class TemporadaService {
    static listarPlantillas(hoy = hoyColombia()) {
        return PLANTILLAS.map(p => ({
            id: p.id,
            nombre: p.nombre,
            descripcion: p.descripcion,
            porcentaje: p.porcentaje,
            icono: p.icono,
            ...fechasDePlantilla(p, hoy)
        }));
    }

    static diasParaNavidad(hoy = hoyColombia()) {
        return diasParaNavidad(hoy);
    }

    /**
     * Crea la promoción de una plantilla. Nace DESACTIVADA y para todo el catálogo: el administrador la revisa y
     * la activa en Promociones (donde también puede acotarla a categorías o productos).
     */
    static async crearPromocionDePlantilla(tenantId, usuarioId, body = {}, hoy = hoyColombia()) {
        const plantilla = PLANTILLAS.find(p => p.id === body.plantilla);
        if (!plantilla) {
            throw new ValidationError('Plantilla no válida', 'TEMPORADA_PLANTILLA_INVALIDA');
        }
        const porcentaje = Number(body.porcentaje ?? plantilla.porcentaje);
        if (!Number.isFinite(porcentaje) || porcentaje <= 0 || porcentaje > 100) {
            throw new ValidationError('El descuento debe estar entre 1 y 100 %', 'TEMPORADA_PORCENTAJE_INVALIDO');
        }
        const fechas = fechasDePlantilla(plantilla, hoy);
        const fechaInicio = body.fecha_inicio ? toFechaDia(body.fecha_inicio) : fechas.fecha_inicio;
        const fechaFin = body.fecha_fin ? toFechaDia(body.fecha_fin) : fechas.fecha_fin;
        if (fechaFin < fechaInicio) {
            throw new ValidationError(
                'La fecha de fin no puede ser anterior a la de inicio',
                'TEMPORADA_FECHAS_INVALIDAS'
            );
        }
        const { id } = await PromocionService.crear(
            tenantId,
            {
                nombre: plantilla.nombre,
                valor_tipo: 'porcentaje',
                valor: porcentaje,
                fecha_inicio: fechaInicio,
                fecha_fin: fechaFin,
                activa: 0
            },
            usuarioId
        );
        return { id, nombre: plantilla.nombre, fecha_inicio: fechaInicio, fecha_fin: fechaFin, porcentaje };
    }

    // ------------------------------------------------------------------ vigencia por fechas

    static async listarVigencias(tenantId) {
        return TemporadaRepository.findAllConProducto(tenantId);
    }

    /** Fija la ventana de fechas de varios productos y la aplica de inmediato. `desde` o `hasta` pueden faltar. */
    static async fijarVigencia(tenantId, body = {}, hoy = hoyColombia()) {
        const ids = [...new Set((Array.isArray(body.producto_ids) ? body.producto_ids : []).map(Number))].filter(
            n => Number.isInteger(n) && n > 0
        );
        if (!ids.length) {
            throw new ValidationError('Elige al menos un producto', 'TEMPORADA_SIN_PRODUCTOS');
        }
        if (ids.length > 500) {
            throw new ValidationError('Máximo 500 productos por vez', 'TEMPORADA_DEMASIADOS');
        }
        const desde = body.desde ? toFechaDia(body.desde) : null;
        const hasta = body.hasta ? toFechaDia(body.hasta) : null;
        if (!desde && !hasta) {
            throw new ValidationError('Indica la fecha desde o la fecha hasta', 'TEMPORADA_SIN_FECHAS');
        }
        if (desde && hasta && hasta < desde) {
            throw new ValidationError(
                'La fecha hasta no puede ser anterior a la fecha desde',
                'TEMPORADA_FECHAS_INVALIDAS'
            );
        }
        const validos = await TemporadaRepository.findProductosActivos(tenantId, ids);
        if (validos.length !== ids.length) {
            throw new ValidationError('Algún producto no existe o está inactivo', 'TEMPORADA_PRODUCTO_INVALIDO');
        }
        await TemporadaRepository.upsert(tenantId, validos, desde, hasta);
        await TemporadaRepository.aplicarVigencias(hoy, tenantId);
        return { aplicados: validos.length };
    }

    /** Quita la vigencia: el producto conserva el estado de `disponible` con que haya quedado. */
    static async quitarVigencia(tenantId, productoId) {
        const id = Number.parseInt(productoId, 10);
        if (!Number.isInteger(id) || id <= 0) {
            throw new ValidationError('Producto inválido', 'TEMPORADA_PRODUCTO_INVALIDO');
        }
        await TemporadaRepository.delete(tenantId, id);
        return { producto_id: id };
    }

    /** Proceso diario: aplica a todos los restaurantes las vigencias que cambiaron de estado. */
    static async aplicarVigenciasTodos(hoy = hoyColombia()) {
        return TemporadaRepository.aplicarVigencias(hoy);
    }
}

module.exports = TemporadaService;
module.exports.PLANTILLAS = PLANTILLAS;
module.exports.fechasDePlantilla = fechasDePlantilla;
module.exports.diasParaNavidad = diasParaNavidad;
