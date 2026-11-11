/**
 * Administración del asistente Chef desde el panel de superadmin: resumen por restaurante,
 * add-on, nombre y acceso por usuario. Reutiliza los servicios existentes de add-ons y permisos
 * (con su caché y auditoría) en vez de escribir directo en las tablas.
 */
const AsistenteAdminRepository = require('../../repositories/Admin/AsistenteAdminRepository');
const AddonRepository = require('../../repositories/Admin/AddonRepository');
const PermisoRepository = require('../../repositories/Admin/PermisoRepository');
const AddonService = require('./AddonService');
const TenantAuditService = require('./TenantAuditService');
const PermisosUsuarioService = require('../Shared/PermisosUsuarioService');
const { asistenteConfigurado, MODELO_DEFECTO } = require('../Tenant/Asistente/llm');

const SLUG_ADDON = 'asistente';
const PERMISO = 'asistente.usar';
const MODOS = ['conceder', 'denegar', 'estandar'];
const NOMBRE_DEFECTO = 'Chef';
const NOMBRE_VALIDO = /^[\p{L}\p{N} .'-]{1,24}$/u;

const errorDe = (status, message) => Object.assign(new Error(message), { status });

function idValido(valor, etiqueta) {
    if (!Number.isInteger(valor) || valor <= 0) {
        throw errorDe(400, `${etiqueta} inválido`);
    }
    return valor;
}

/** Auditoría del panel: nunca debe tumbar un cambio que ya se aplicó. */
async function auditar(tenantId, superadminId, accion, detalles) {
    try {
        await TenantAuditService.log({ tenantId, userId: superadminId, accion, detalles: JSON.stringify(detalles) });
    } catch (e) {
        // eslint-disable-next-line no-console
        console.error('[asistente-admin] no se pudo registrar la auditoría:', e?.code || e?.name);
    }
}

function origenDe(resuelto) {
    if (resuelto.concedidos.includes(PERMISO)) {
        return 'concedido';
    }
    if (resuelto.denegados.includes(PERMISO)) {
        return 'denegado';
    }
    return resuelto.base.includes(PERMISO) ? 'rol' : 'ninguno';
}

class AsistenteAdminService {
    /** Usuarios del restaurante con su acceso efectivo a `asistente.usar` y de dónde viene. */
    static async usuarios(tenantId) {
        idValido(tenantId, 'Restaurante');
        const usuarios = await PermisoRepository.getUsuariosByTenantId(tenantId);
        const salida = [];
        for (const u of usuarios) {
            const resuelto = await PermisosUsuarioService.resolver(u.id);
            salida.push({
                id: u.id,
                username: u.username,
                nombre: u.nombre_completo || u.username,
                rol: u.rol_nombre,
                activo: !!u.activo,
                tieneAcceso: !!resuelto && resuelto.permisos.includes(PERMISO),
                origen: resuelto ? origenDe(resuelto) : 'ninguno',
                // En planes Premium/Definitivo las excepciones del admin no se aplican.
                premium: !!resuelto?.premium
            });
        }
        return salida;
    }

    /** Vista general: estado del servidor y una fila por restaurante activo. */
    static async resumen() {
        const filas = await AsistenteAdminRepository.resumenTenants();
        const restaurantes = [];
        for (const f of filas) {
            const addon = !!f.tiene_addon;
            // Sin add-on el asistente no está disponible: no se gastan consultas contando usuarios.
            const usuarios = addon ? await AsistenteAdminService.usuarios(f.id) : [];
            restaurantes.push({
                id: f.id,
                nombre: f.nombre,
                addon,
                nombreAsistente: f.nombre_asistente || NOMBRE_DEFECTO,
                usuariosConAcceso: usuarios.filter(u => u.tieneAcceso).length,
                usos: Number(f.usos) || 0,
                errores: Number(f.errores) || 0,
                tokens: Number(f.tokens) || 0,
                ultimoUso: f.ultimo_uso || null
            });
        }
        return {
            servidor: {
                configurado: asistenteConfigurado(),
                modelo: (process.env.GROQ_MODEL || '').trim() || MODELO_DEFECTO
            },
            restaurantes
        };
    }

    /** Activa o quita el add-on del asistente de un restaurante. */
    static async activarAddon(tenantId, activo, superadminId) {
        idValido(tenantId, 'Restaurante');
        const addons = await AddonRepository.findAll();
        const addon = addons.find(a => a.slug === SLUG_ADDON);
        if (!addon) {
            throw errorDe(409, 'El add-on del asistente no existe: falta correr la migración 128.');
        }
        if (activo) {
            await AddonService.addToTenant(tenantId, addon.id, superadminId);
        } else {
            await AddonService.removeFromTenant(tenantId, addon.id, superadminId);
        }
        return { activo: !!activo };
    }

    /** Cambia el nombre del asistente. Un nombre inválido se rechaza, no se modifica en silencio. */
    static async renombrar(tenantId, nombre, superadminId) {
        idValido(tenantId, 'Restaurante');
        const limpio = typeof nombre === 'string' ? nombre.trim() : '';
        if (!NOMBRE_VALIDO.test(limpio)) {
            throw errorDe(
                400,
                'El nombre debe tener de 1 a 24 caracteres: letras, números, espacio, punto, apóstrofo o guion.'
            );
        }
        await AsistenteAdminRepository.guardarNombre(tenantId, limpio);
        await auditar(tenantId, superadminId, 'asistente.admin_nombre', { nombre: limpio });
        return { nombre: limpio };
    }

    /** Fija el acceso de un usuario: conceder, denegar o volver al estándar (sin excepción). */
    static async fijarAcceso(tenantId, userId, modo, superadminId) {
        idValido(tenantId, 'Restaurante');
        idValido(userId, 'Usuario');
        if (!MODOS.includes(modo)) {
            throw errorDe(400, 'Modo inválido');
        }
        if (!(await AsistenteAdminRepository.usuarioDelTenant(tenantId, userId))) {
            throw errorDe(404, 'Usuario no encontrado en este restaurante');
        }
        const [permisoId] = await PermisoRepository._idsPorNombre([PERMISO]);
        if (!permisoId) {
            throw errorDe(409, 'El permiso del asistente no existe: falta sincronizar los permisos.');
        }
        const actuales = await PermisoRepository.getExcepcionesByUser(userId);
        // Se conserva todo lo demás del usuario: solo cambia la excepción del asistente.
        const conceder = actuales.conceder.filter(id => id !== permisoId);
        const denegar = actuales.denegar.filter(id => id !== permisoId);
        if (modo === 'conceder') {
            conceder.push(permisoId);
        } else if (modo === 'denegar') {
            denegar.push(permisoId);
        }
        await PermisoRepository.setExcepcionesForUser(userId, { conceder, denegar });
        await auditar(tenantId, superadminId, 'asistente.admin_acceso', { usuario: userId, modo });
        return { modo };
    }
}

module.exports = AsistenteAdminService;
