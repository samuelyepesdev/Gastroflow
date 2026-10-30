/**
 * AnuncioService - Modales informativos (nuevas funcionalidades, actualizaciones, tutoriales, avisos)
 * que el superadmin publica y que los usuarios de los restaurantes ven al entrar.
 */

const AnuncioRepository = require('../../repositories/Admin/AnuncioRepository');
const { hoyColombia, toFechaDia } = require('../../utils/dateHelpers');

const TIPOS = ['funcionalidad', 'actualizacion', 'tutorial', 'aviso'];
const FRECUENCIAS = ['una_vez', 'cada_login'];
const ROLES_ANUNCIABLES = ['admin', 'mesero', 'cocinero', 'cajero'];
const MAX_ITEMS = 10;

function parseJsonLista(valor) {
    if (valor === null || valor === undefined || valor === '') {
        return null;
    }
    if (Array.isArray(valor)) {
        return valor;
    }
    try {
        const parsed = JSON.parse(valor);
        return Array.isArray(parsed) ? parsed : null;
    } catch {
        return null;
    }
}

function textoOpcional(valor, max, campo) {
    const t = String(valor ?? '').trim();
    if (t.length > max) {
        throw new Error(`${campo} no puede superar ${max} caracteres`);
    }
    return t || null;
}

/** Valida y normaliza lo que llega del formulario del superadmin. Lanza Error con mensaje legible. */
function normalizar(body) {
    const tipo = TIPOS.includes(body.tipo) ? body.tipo : null;
    if (!tipo) {
        throw new Error('Tipo de anuncio inválido');
    }
    const titulo = String(body.titulo ?? '').trim();
    if (!titulo) {
        throw new Error('El título es obligatorio');
    }
    if (titulo.length > 120) {
        throw new Error('El título no puede superar 120 caracteres');
    }

    const itemsEntrada = Array.isArray(body.items) ? body.items : String(body.items ?? '').split('\n');
    const items = itemsEntrada.map(i => String(i).trim()).filter(Boolean);
    if (items.length > MAX_ITEMS) {
        throw new Error(`Máximo ${MAX_ITEMS} puntos o pasos`);
    }
    if (items.some(i => i.length > 200)) {
        throw new Error('Cada punto o paso no puede superar 200 caracteres');
    }

    const botonUrl = textoOpcional(body.boton_url, 255, 'El enlace del botón');
    // Solo rutas internas o https: evita javascript:, data:, etc.
    if (botonUrl && !(/^\/(?!\/)/.test(botonUrl) || /^https:\/\//i.test(botonUrl))) {
        throw new Error('El enlace del botón debe empezar con / (ruta interna) o https://');
    }
    const botonTexto = textoOpcional(body.boton_texto, 40, 'El texto del botón');
    if (botonUrl && !botonTexto) {
        throw new Error('Escribe el texto del botón');
    }

    const color = textoOpcional(body.color_acento, 7, 'El color');
    if (color && !/^#[0-9a-f]{6}$/i.test(color)) {
        throw new Error('El color debe ser un hex válido, ej. #e8431f');
    }

    const frecuencia = FRECUENCIAS.includes(body.frecuencia) ? body.frecuencia : 'una_vez';

    const planesEntrada = parseJsonLista(body.planes);
    const planes = planesEntrada
        ? [...new Set(planesEntrada.map(Number).filter(n => Number.isInteger(n) && n > 0))]
        : [];
    const rolesEntrada = parseJsonLista(body.roles);
    const roles = rolesEntrada ? [...new Set(rolesEntrada.filter(r => ROLES_ANUNCIABLES.includes(r)))] : [];

    const fechaInicio = body.fecha_inicio ? toFechaDia(body.fecha_inicio) : null;
    const fechaFin = body.fecha_fin ? toFechaDia(body.fecha_fin) : null;
    if (fechaInicio && fechaFin && fechaFin < fechaInicio) {
        throw new Error('La fecha de fin no puede ser anterior a la de inicio');
    }

    return {
        tipo,
        titulo,
        cuerpo: textoOpcional(body.cuerpo, 2000, 'El texto'),
        items: items.length ? JSON.stringify(items) : null,
        version: textoOpcional(body.version, 20, 'La versión'),
        boton_texto: botonTexto,
        boton_url: botonUrl,
        color_acento: color,
        frecuencia,
        // Lista vacía = sin restricción (todos)
        planes: planes.length ? JSON.stringify(planes) : null,
        roles: roles.length ? JSON.stringify(roles) : null,
        fecha_inicio: fechaInicio,
        fecha_fin: fechaFin,
        activo: body.activo === false || body.activo === 0 || body.activo === '0' ? 0 : 1
    };
}

/** Forma que consume el cliente (y la vista previa): sin campos internos. */
function aPublico(a) {
    return {
        id: a.id,
        tipo: a.tipo,
        titulo: a.titulo,
        cuerpo: a.cuerpo || '',
        items: parseJsonLista(a.items) || [],
        version: a.version || '',
        boton_texto: a.boton_texto || '',
        boton_url: a.boton_url || '',
        color_acento: a.color_acento || '',
        frecuencia: a.frecuencia
    };
}

class AnuncioService {
    static async listar() {
        const rows = await AnuncioRepository.findAllConEstadisticas();
        return rows.map(a => ({
            ...a,
            items: parseJsonLista(a.items) || [],
            planes: parseJsonLista(a.planes),
            roles: parseJsonLista(a.roles),
            fecha_inicio: a.fecha_inicio ? toFechaDia(a.fecha_inicio) : '',
            fecha_fin: a.fecha_fin ? toFechaDia(a.fecha_fin) : ''
        }));
    }

    static async crear(body) {
        return AnuncioRepository.create(normalizar(body));
    }

    static async actualizar(id, body) {
        const existente = await AnuncioRepository.findById(id);
        if (!existente) {
            throw Object.assign(new Error('Anuncio no encontrado'), { status: 404 });
        }
        await AnuncioRepository.update(id, normalizar(body));
    }

    static async setActivo(id, activo) {
        const r = await AnuncioRepository.setActivo(id, activo);
        if (!r.affectedRows) {
            throw Object.assign(new Error('Anuncio no encontrado'), { status: 404 });
        }
    }

    static async eliminar(id) {
        await AnuncioRepository.delete(id);
    }

    /**
     * Siguiente anuncio que le toca ver a un usuario (uno por entrada: si hay varios, van en cola).
     * `excluir` son ids que el navegador ya mostró en esta sesión (anuncios "cada_login").
     * @returns {Promise<Object|null>} anuncio en su forma pública, o null
     */
    static async getPendiente({ usuarioId, rol, planId, excluir = [] }) {
        const rolNorm = String(rol || '').toLowerCase();
        const excluidos = new Set(excluir.map(Number));
        const vigentes = await AnuncioRepository.findVigentesParaUsuario(usuarioId, hoyColombia());

        const siguiente = vigentes.find(a => {
            if (excluidos.has(a.id)) {
                return false;
            }
            // "una_vez": si ya hay fila de visto, no vuelve. "cada_login": solo se silencia con "no volver a mostrar".
            if (a.visto_id && (a.frecuencia === 'una_vez' || a.no_mostrar)) {
                return false;
            }
            const planes = parseJsonLista(a.planes);
            if (planes && planes.length && !planes.map(Number).includes(Number(planId))) {
                return false;
            }
            const roles = parseJsonLista(a.roles);
            if (roles && roles.length && !roles.includes(rolNorm)) {
                return false;
            }
            return true;
        });

        return siguiente ? aPublico(siguiente) : null;
    }

    /** Registra lo que hizo el usuario con un anuncio: 'vista' | 'clic' | 'no_mostrar'. */
    static async registrarEvento({ anuncioId, usuarioId, tenantId, evento }) {
        const anuncio = await AnuncioRepository.findById(anuncioId);
        if (!anuncio) {
            throw Object.assign(new Error('Anuncio no encontrado'), { status: 404 });
        }
        if (evento === 'vista') {
            return AnuncioRepository.registrarVista(anuncioId, usuarioId, tenantId);
        }
        if (evento === 'clic') {
            return AnuncioRepository.registrarClic(anuncioId, usuarioId, tenantId);
        }
        if (evento === 'no_mostrar') {
            return AnuncioRepository.registrarNoMostrar(anuncioId, usuarioId, tenantId);
        }
        throw Object.assign(new Error('Evento inválido'), { status: 400 });
    }
}

module.exports = AnuncioService;
