/**
 * BonoPublicoService - Datos de la página pública /bono/<token> (la que abre el QR del
 * comprobante). Sin login: solo expone lo que el dueño del bono necesita ver (saldo,
 * vigencia, dedicatoria) y los datos de contacto del negocio para reclamarlo. Nunca
 * devuelve historial de movimientos, cliente ni notas internas.
 */
const BonoRepository = require('../../repositories/Tenant/BonoRepository');
const TenantRepository = require('../../repositories/Admin/TenantRepository');
const { hoyColombia } = require('../../utils/dateHelpers');

const COLOR_PRIMARIO_DEFECTO = '#ff5a36';
const COLOR_HEX_REGEX = /^#[0-9a-fA-F]{3,8}$/;
const TOKEN_REGEX = /^[A-Za-z0-9_-]{16,64}$/;

const ESTADOS = {
    activo: { etiqueta: 'Vigente', clase: 'ok' },
    agotado: { etiqueta: 'Saldo agotado', clase: 'off' },
    vencido: { etiqueta: 'Vencido', clase: 'off' },
    anulado: { etiqueta: 'Anulado', clase: 'off' }
};

class BonoPublicoService {
    /**
     * @returns {Promise<object|null>} modelo para la vista, o null si el token no existe
     *   (mismo resultado para "inválido" y "no existe": no se filtra nada a quien prueba tokens).
     */
    static async getVista(token) {
        if (!TOKEN_REGEX.test(String(token || ''))) {
            return null;
        }
        const bono = await BonoRepository.findByTokenPublico(token);
        if (!bono) {
            return null;
        }
        const tenant = await TenantRepository.findById(bono.tenant_id);
        if (!tenant) {
            return null;
        }

        // El estado 'vencido' solo lo marca un job: si la fecha ya pasó, se muestra vencido igual.
        const vencidoPorFecha = bono.fecha_vencimiento && bono.fecha_vencimiento < hoyColombia();
        const estado = bono.estado === 'activo' && vencidoPorFecha ? 'vencido' : bono.estado;
        const info = ESTADOS[estado] || ESTADOS.activo;

        return {
            bono: {
                codigo: bono.codigo,
                valor_inicial: Number(bono.valor_inicial),
                saldo_actual: Number(bono.saldo_actual),
                fecha_vencimiento: bono.fecha_vencimiento,
                destinatario: bono.destinatario,
                remitente: bono.remitente,
                mensaje: bono.mensaje,
                estado,
                estado_etiqueta: info.etiqueta,
                estado_clase: info.clase,
                usable: estado === 'activo'
            },
            negocio: {
                nombre: tenant.nombre,
                logo_src: tenant.logo_src || null,
                // Se inserta en un <style>: solo se acepta un hex válido.
                color: COLOR_HEX_REGEX.test(tenant.config?.colores?.primary || '')
                    ? tenant.config.colores.primary
                    : COLOR_PRIMARIO_DEFECTO,
                direccion: tenant.direccion || null,
                ciudad: tenant.ciudad || null,
                telefono: tenant.telefono || null
            }
        };
    }
}

module.exports = BonoPublicoService;
