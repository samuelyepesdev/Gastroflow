/**
 * ReservaService - Reservas V1 (sin anticipo en línea).
 *
 * La disponibilidad se calcula por aforo: en ningún instante de la reserva puede haber más personas que
 * `aforo_maximo`. La verificación y el INSERT corren en una transacción que bloquea la fila del tenant, para
 * que dos reservas simultáneas no sobrepasen el aforo.
 */
const crypto = require('crypto');
const db = require('../../config/database');
const ReservaRepository = require('../../repositories/Tenant/ReservaRepository');
const { ValidationError, NotFoundError, ConflictError } = require('../../utils/errors');
const { fechaColombia, hoyColombia, sumarDias, toFechaDia } = require('../../utils/dateHelpers');

const ESTADOS = ['pendiente', 'confirmada', 'sentada', 'cancelada', 'no_show'];
// Transiciones permitidas: sentada, cancelada y no_show son finales.
const TRANSICIONES = {
    pendiente: ['confirmada', 'cancelada', 'no_show'],
    confirmada: ['sentada', 'cancelada', 'no_show'],
    sentada: [],
    cancelada: [],
    no_show: []
};
const OCASIONES = ['cumpleanos', 'aniversario', 'empresarial', 'navidad', 'otra'];
const OFFSET_COLOMBIA_MIN = 5 * 60;

// ------------------------------------------------------------------ helpers puros (exportados para tests)

/** 'HH:MM' o 'HH:MM:SS' -> minutos desde medianoche, o null si no es una hora válida. */
function horaAMinutos(hora) {
    const m = /^(\d{2}):(\d{2})(?::\d{2})?$/.exec(String(hora ?? ''));
    if (!m) {
        return null;
    }
    const h = Number(m[1]);
    const min = Number(m[2]);
    return h < 24 && min < 60 ? h * 60 + min : null;
}

function minutosAHora(minutos) {
    const pad = n => String(n).padStart(2, '0');
    return `${pad(Math.floor(minutos / 60))}:${pad(minutos % 60)}`;
}

/** Minutos desde medianoche, hora Colombia (UTC-5 fijo, sin horario de verano). */
function minutosAhoraColombia(ahora = new Date()) {
    const utc = ahora.getUTCHours() * 60 + ahora.getUTCMinutes();
    return (utc - OFFSET_COLOMBIA_MIN + 1440) % 1440;
}

/** Horarios de inicio que ofrece el restaurante en un día: apertura .. última, cada `intervalo` minutos. */
function generarFranjas(config) {
    const inicio = horaAMinutos(config.hora_apertura);
    const fin = horaAMinutos(config.hora_ultima);
    const paso = Number(config.intervalo_min);
    if (inicio === null || fin === null || !(paso > 0) || fin < inicio) {
        return [];
    }
    const franjas = [];
    for (let t = inicio; t <= fin; t += paso) {
        franjas.push(minutosAHora(t));
    }
    return franjas;
}

/**
 * Máximo de personas simultáneas dentro de [inicio, fin) sumando las reservas existentes que se cruzan.
 * El pico siempre ocurre en `inicio` o en el inicio de alguna reserva que arranca dentro del intervalo.
 */
function ocupacionMaxima(reservas, inicio, fin) {
    const intervalos = reservas
        .map(r => {
            const ini = horaAMinutos(r.hora_inicio);
            return ini === null ? null : { ini, fin: ini + Number(r.duracion_min), personas: Number(r.personas) };
        })
        .filter(r => r && r.ini < fin && r.fin > inicio);
    const puntos = [inicio, ...intervalos.map(r => r.ini).filter(t => t > inicio && t < fin)];
    return Math.max(
        0,
        ...puntos.map(t => intervalos.filter(r => r.ini <= t && t < r.fin).reduce((s, r) => s + r.personas, 0))
    );
}

/** Celular colombiano de 10 dígitos o null (acepta prefijo 57). */
function normalizarTelefono(valor) {
    const digitos = String(valor || '').replace(/\D/g, '');
    const sin57 = digitos.length === 12 && digitos.startsWith('57') ? digitos.slice(2) : digitos;
    return /^3\d{9}$/.test(sin57) ? sin57 : null;
}

const enteroEnRango = (valor, min, max, mensaje) => {
    const n = Number.parseInt(valor, 10);
    if (!Number.isInteger(n) || n < min || n > max) {
        throw new ValidationError(mensaje, 'RESERVA_CONFIG_INVALIDA');
    }
    return n;
};

const textoOpcional = (valor, max, campo) => {
    const t = String(valor ?? '').trim();
    if (t.length > max) {
        throw new ValidationError(`${campo} no puede superar ${max} caracteres`, 'RESERVA_TEXTO_LARGO');
    }
    return t || null;
};

const nuevoToken = () => crypto.randomBytes(18).toString('hex');

class ReservaService {
    // ------------------------------------------------------------------ configuración

    static async getConfig(tenantId) {
        const config =
            (await ReservaRepository.getConfig(tenantId)) ||
            (await ReservaRepository.asegurarConfig(tenantId, nuevoToken()));
        return ReservaService._configPublica(config);
    }

    /** Configuración tal como está en BD (la usa el cálculo de disponibilidad del panel). */
    static async getConfigCompleta(tenantId) {
        return (
            (await ReservaRepository.getConfig(tenantId)) ||
            (await ReservaRepository.asegurarConfig(tenantId, nuevoToken()))
        );
    }

    static async listarMesas(tenantId) {
        return ReservaRepository.findMesasFisicas(tenantId);
    }

    static async guardarConfig(tenantId, body = {}) {
        await ReservaService.getConfig(tenantId);
        const apertura = horaAMinutos(body.hora_apertura);
        const ultima = horaAMinutos(body.hora_ultima);
        if (apertura === null || ultima === null) {
            throw new ValidationError('Las horas deben tener formato HH:MM', 'RESERVA_CONFIG_INVALIDA');
        }
        if (ultima < apertura) {
            throw new ValidationError(
                'La última hora de reserva no puede ser anterior a la apertura',
                'RESERVA_CONFIG_INVALIDA'
            );
        }
        await ReservaRepository.actualizarConfig(tenantId, {
            activo: body.activo === true || body.activo === 1 || body.activo === '1' ? 1 : 0,
            aforo_maximo: enteroEnRango(body.aforo_maximo, 1, 2000, 'El aforo debe estar entre 1 y 2000 personas'),
            duracion_min: enteroEnRango(body.duracion_min, 30, 480, 'La duración debe estar entre 30 y 480 minutos'),
            intervalo_min: enteroEnRango(body.intervalo_min, 10, 240, 'El intervalo debe estar entre 10 y 240 minutos'),
            hora_apertura: `${minutosAHora(apertura)}:00`,
            hora_ultima: `${minutosAHora(ultima)}:00`,
            anticipacion_min_horas: enteroEnRango(
                body.anticipacion_min_horas,
                0,
                168,
                'La anticipación debe estar entre 0 y 168 horas'
            ),
            dias_max_adelanto: enteroEnRango(
                body.dias_max_adelanto,
                1,
                365,
                'Los días de adelanto deben estar entre 1 y 365'
            ),
            max_personas_reserva: enteroEnRango(
                body.max_personas_reserva,
                1,
                200,
                'El máximo por reserva debe estar entre 1 y 200'
            ),
            auto_confirmar:
                body.auto_confirmar === true || body.auto_confirmar === 1 || body.auto_confirmar === '1' ? 1 : 0,
            mensaje_publico: textoOpcional(body.mensaje_publico, 300, 'El mensaje')
        });
        return ReservaService.getConfig(tenantId);
    }

    /** Invalida el enlace público anterior (por ejemplo si se filtró). */
    static async regenerarEnlace(tenantId) {
        await ReservaService.getConfig(tenantId);
        await ReservaRepository.setToken(tenantId, nuevoToken());
        return ReservaService.getConfig(tenantId);
    }

    static _configPublica(c) {
        return {
            activo: !!c.activo,
            token_publico: c.token_publico,
            enlace: c.token_publico ? `/reservar/${c.token_publico}` : null,
            aforo_maximo: c.aforo_maximo,
            duracion_min: c.duracion_min,
            intervalo_min: c.intervalo_min,
            hora_apertura: String(c.hora_apertura).slice(0, 5),
            hora_ultima: String(c.hora_ultima).slice(0, 5),
            anticipacion_min_horas: c.anticipacion_min_horas,
            dias_max_adelanto: c.dias_max_adelanto,
            max_personas_reserva: c.max_personas_reserva,
            auto_confirmar: !!c.auto_confirmar,
            mensaje_publico: c.mensaje_publico || ''
        };
    }

    // ------------------------------------------------------------------ disponibilidad

    /**
     * Horarios de un día con su disponibilidad para `personas`. Un horario pasado o dentro de la antelación
     * mínima aparece como no disponible.
     */
    static async disponibilidad(tenantId, config, fecha, personas, ahora = new Date(), conn = null) {
        const dia = ReservaService._validarFecha(fecha, config, ahora);
        const n = Number.parseInt(personas, 10) || 1;
        const ocupantes = await ReservaRepository.findOcupantesDelDia(tenantId, dia, conn);
        const hoy = fechaColombia(ahora);
        const minAhora = minutosAhoraColombia(ahora);
        const limiteMin = minAhora + Number(config.anticipacion_min_horas) * 60;
        const duracion = Number(config.duracion_min);

        return generarFranjas(config).map(hora => {
            const ini = horaAMinutos(hora);
            const ocupadas = ocupacionMaxima(ocupantes, ini, ini + duracion);
            const libres = Math.max(0, Number(config.aforo_maximo) - ocupadas);
            const muyPronto = dia === hoy && ini < limiteMin;
            return { hora, disponible: !muyPronto && libres >= n, cupos: libres };
        });
    }

    static _validarFecha(fecha, config, ahora = new Date()) {
        const dia = /^\d{4}-\d{2}-\d{2}$/.test(String(fecha ?? '')) ? String(fecha) : null;
        if (!dia || Number.isNaN(Date.parse(`${dia}T12:00:00Z`))) {
            throw new ValidationError('Fecha inválida', 'RESERVA_FECHA_INVALIDA');
        }
        const hoy = fechaColombia(ahora);
        if (dia < hoy) {
            throw new ValidationError('No se puede reservar en una fecha pasada', 'RESERVA_FECHA_PASADA');
        }
        if (dia > sumarDias(hoy, Number(config.dias_max_adelanto))) {
            throw new ValidationError(
                `Solo se puede reservar con hasta ${config.dias_max_adelanto} días de anticipación`,
                'RESERVA_FECHA_LEJANA'
            );
        }
        return dia;
    }

    // ------------------------------------------------------------------ crear

    /** Reserva desde la página pública: el restaurante se resuelve por token. */
    static async crearPublica(token, body = {}, ip = null, ahora = new Date()) {
        const config = await ReservaRepository.getConfigPorToken(String(token || ''));
        if (!config) {
            throw new NotFoundError('Este enlace de reservas no está disponible', 'RESERVA_ENLACE_INVALIDO');
        }
        if (body.consentimiento !== true && body.consentimiento !== '1') {
            throw new ValidationError(
                'Debes autorizar el tratamiento de tus datos para reservar',
                'RESERVA_SIN_CONSENTIMIENTO'
            );
        }
        const id = await ReservaService._crear(config.tenant_id, config, body, {
            origen: 'publica',
            estado: config.auto_confirmar ? 'confirmada' : 'pendiente',
            forzar: false,
            ip,
            ahora
        });
        return { id, estado: config.auto_confirmar ? 'confirmada' : 'pendiente' };
    }

    /** Reserva tomada por el personal (teléfono, mostrador): puede forzar sobre el aforo. */
    static async crearInterna(tenantId, body = {}, ahora = new Date()) {
        const config = await ReservaRepository.asegurarConfig(tenantId, nuevoToken());
        const id = await ReservaService._crear(tenantId, config, body, {
            origen: 'interna',
            estado: 'confirmada',
            forzar: body.forzar === true || body.forzar === '1',
            ip: null,
            ahora
        });
        return { id };
    }

    static async _crear(tenantId, config, body, { origen, estado, forzar, ip, ahora }) {
        const nombre = String(body.nombre ?? '').trim();
        if (!nombre || nombre.length > 80) {
            throw new ValidationError('El nombre es obligatorio (máximo 80 caracteres)', 'RESERVA_NOMBRE_INVALIDO');
        }
        const telefono = normalizarTelefono(body.telefono);
        if (!telefono) {
            throw new ValidationError('Escribe un celular colombiano válido (10 dígitos)', 'RESERVA_TELEFONO_INVALIDO');
        }
        const email = textoOpcional(body.email, 120, 'El correo');
        if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            throw new ValidationError('El correo no es válido', 'RESERVA_EMAIL_INVALIDO');
        }
        const personas = Number.parseInt(body.personas, 10);
        if (!Number.isInteger(personas) || personas < 1 || personas > Number(config.max_personas_reserva)) {
            throw new ValidationError(
                `Las reservas son de 1 a ${config.max_personas_reserva} personas. Para grupos más grandes, llámanos.`,
                'RESERVA_PERSONAS_INVALIDAS'
            );
        }
        const dia = ReservaService._validarFecha(body.fecha, config, ahora);
        const ini = horaAMinutos(body.hora);
        if (ini === null || !generarFranjas(config).includes(minutosAHora(ini))) {
            throw new ValidationError('Elige uno de los horarios disponibles', 'RESERVA_HORA_INVALIDA');
        }
        if (origen === 'publica' && dia === fechaColombia(ahora)) {
            const limite = minutosAhoraColombia(ahora) + Number(config.anticipacion_min_horas) * 60;
            if (ini < limite) {
                throw new ValidationError(
                    `Reserva con al menos ${config.anticipacion_min_horas} hora(s) de anticipación`,
                    'RESERVA_MUY_PRONTO'
                );
            }
        }
        const ocasion = body.ocasion && OCASIONES.includes(body.ocasion) ? body.ocasion : null;
        const mesaId = body.mesa_id ? Number.parseInt(body.mesa_id, 10) : null;
        if (mesaId && !(await ReservaRepository.mesaExiste(tenantId, mesaId))) {
            throw new ValidationError('La mesa no existe', 'RESERVA_MESA_INVALIDA');
        }

        const connection = await db.getConnection();
        try {
            await connection.beginTransaction();
            await ReservaRepository.bloquearTenant(connection, tenantId);
            const ocupantes = await ReservaRepository.findOcupantesDelDia(tenantId, dia, connection);
            const duracion = Number(config.duracion_min);
            const ocupadas = ocupacionMaxima(ocupantes, ini, ini + duracion);
            if (!forzar && ocupadas + personas > Number(config.aforo_maximo)) {
                throw new ConflictError(
                    'Ese horario ya no tiene cupo para esa cantidad de personas. Elige otro horario.',
                    'RESERVA_SIN_CUPO'
                );
            }
            const id = await ReservaRepository.create(connection, tenantId, {
                nombre,
                telefono,
                email,
                personas,
                fecha: dia,
                hora_inicio: `${minutosAHora(ini)}:00`,
                duracion_min: duracion,
                estado,
                mesa_id: mesaId,
                notas: textoOpcional(body.notas, 300, 'Las notas'),
                ocasion,
                origen,
                consentimiento_at: origen === 'publica' ? new Date() : null,
                consentimiento_ip: origen === 'publica' ? String(ip || '').slice(0, 45) || null : null
            });
            await connection.commit();
            return id;
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }

    // ------------------------------------------------------------------ consulta y estados

    static async listar(tenantId, desde, hasta) {
        const d = toFechaDia(desde || hoyColombia());
        const h = toFechaDia(hasta || d);
        if (h < d) {
            throw new ValidationError('El rango de fechas es inválido', 'RESERVA_RANGO_INVALIDO');
        }
        if (h > sumarDias(d, 62)) {
            throw new ValidationError('El rango máximo es de 62 días', 'RESERVA_RANGO_INVALIDO');
        }
        return ReservaRepository.findPorRango(tenantId, d, h);
    }

    static async cambiarEstado(id, tenantId, estado) {
        if (!ESTADOS.includes(estado)) {
            throw new ValidationError('Estado inválido', 'RESERVA_ESTADO_INVALIDO');
        }
        const reserva = await ReservaRepository.findById(id, tenantId);
        if (!reserva) {
            throw new NotFoundError('Reserva no encontrada', 'RESERVA_NO_ENCONTRADA');
        }
        if (!TRANSICIONES[reserva.estado].includes(estado)) {
            throw new ConflictError(
                `Una reserva ${reserva.estado.replace('_', ' ')} no puede pasar a ${estado.replace('_', ' ')}`,
                'RESERVA_TRANSICION_INVALIDA'
            );
        }
        await ReservaRepository.setEstado(id, tenantId, estado);
        return { id, estado };
    }

    static async asignarMesa(id, tenantId, mesaId) {
        const reserva = await ReservaRepository.findById(id, tenantId);
        if (!reserva) {
            throw new NotFoundError('Reserva no encontrada', 'RESERVA_NO_ENCONTRADA');
        }
        const mesa = mesaId ? Number.parseInt(mesaId, 10) : null;
        if (mesa && !(await ReservaRepository.mesaExiste(tenantId, mesa))) {
            throw new ValidationError('La mesa no existe', 'RESERVA_MESA_INVALIDA');
        }
        await ReservaRepository.setMesa(id, tenantId, mesa);
        return { id, mesa_id: mesa };
    }

    // ------------------------------------------------------------------ vista pública

    /** Datos mínimos para pintar la página pública (nunca expone ids internos). */
    static async vistaPublica(token) {
        const c = await ReservaRepository.getConfigPorToken(String(token || ''));
        if (!c) {
            return null;
        }
        return {
            restaurante: c.restaurante,
            mensaje: c.mensaje_publico || '',
            max_personas: c.max_personas_reserva,
            dias_max_adelanto: c.dias_max_adelanto,
            ocasiones: OCASIONES
        };
    }

    static async disponibilidadPublica(token, fecha, personas, ahora = new Date()) {
        const c = await ReservaRepository.getConfigPorToken(String(token || ''));
        if (!c) {
            throw new NotFoundError('Este enlace de reservas no está disponible', 'RESERVA_ENLACE_INVALIDO');
        }
        const franjas = await ReservaService.disponibilidad(c.tenant_id, c, fecha, personas, ahora);
        // Al público solo se le dice si hay o no cupo, no cuántos lugares quedan.
        return franjas.map(({ hora, disponible }) => ({ hora, disponible }));
    }
}

module.exports = ReservaService;
module.exports.horaAMinutos = horaAMinutos;
module.exports.generarFranjas = generarFranjas;
module.exports.ocupacionMaxima = ocupacionMaxima;
module.exports.normalizarTelefono = normalizarTelefono;
module.exports.minutosAhoraColombia = minutosAhoraColombia;
