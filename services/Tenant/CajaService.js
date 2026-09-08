const CajaRepository = require('../../repositories/Tenant/CajaRepository');
const { toFechaISOUtc } = require('../../utils/dateHelpers');

// Las fechas de la BD llegan como string UTC (dateStrings + timezone 'Z'); hay
// que formatearlas explícitamente en la zona horaria de Colombia, no en la del
// servidor (que en producción es UTC y hacía que "Apertura" saliera corrida).
function fmtHoraBogota(fecha) {
    const iso = toFechaISOUtc(fecha);
    if (!iso) {
        return '';
    }
    return new Date(iso).toLocaleTimeString('es-CO', {
        timeZone: 'America/Bogota',
        hour: '2-digit',
        minute: '2-digit'
    });
}
function fmtFechaBogota(fecha) {
    const iso = toFechaISOUtc(fecha);
    if (!iso) {
        return '';
    }
    return new Date(iso).toLocaleDateString('es-CO', { timeZone: 'America/Bogota' });
}

class CajaService {
    static async getEstadoCaja(tenantId) {
        const sesion = await CajaRepository.getSesionAbierta(tenantId);
        if (!sesion) {
            return { abierta: false };
        }

        const stats = await CajaRepository.getEstadisticasSesion(sesion.id);

        const teoricoEfectivo =
            Number.parseFloat(sesion.monto_inicial_efectivo) +
            Number.parseFloat(stats.ventas_efectivo) +
            Number.parseFloat(stats.entradas) -
            Number.parseFloat(stats.salidas);
        const teoricoTransferencia =
            Number.parseFloat(sesion.monto_inicial_transferencia) + Number.parseFloat(stats.ventas_transferencia);
        const montoTeorico = teoricoEfectivo + teoricoTransferencia;

        return {
            abierta: true,
            sesion: {
                ...sesion,
                ...stats,
                apertura_hora: fmtHoraBogota(sesion.fecha_apertura),
                apertura_fecha: fmtFechaBogota(sesion.fecha_apertura),
                monto_final_teorico_efectivo: teoricoEfectivo,
                monto_final_teorico_transferencia: teoricoTransferencia,
                monto_final_teorico: montoTeorico
            }
        };
    }

    static async abrirCaja(tenantId, usuarioId, data) {
        const abierta = await CajaRepository.getSesionAbierta(tenantId);
        if (abierta) {
            throw new Error('Ya existe un turno abierto');
        }

        const efectivo = Number.parseFloat(data.monto_inicial_efectivo) || 0;
        const transferencia = Number.parseFloat(data.monto_inicial_transferencia) || 0;
        return await CajaRepository.abrirSesion(tenantId, usuarioId, efectivo, transferencia, data.notas);
    }

    static async cerrarCaja(tenantId, sesionId, data) {
        const montoReal = Number.parseFloat(data.monto_final_real) || 0;
        return await CajaRepository.cerrarSesion(sesionId, tenantId, montoReal, data.notas);
    }

    static async registrarMovimiento(tenantId, sesionId, usuarioId, data) {
        return await CajaRepository.registrarMovimiento(
            tenantId,
            sesionId,
            usuarioId,
            data.tipo,
            Number.parseFloat(data.monto),
            data.motivo
        );
    }

    static async getHistorial(tenantId) {
        const sesiones = await CajaRepository.getHistorial(tenantId);
        return (sesiones || []).map(s => ({
            ...s,
            apertura_hora: fmtHoraBogota(s.fecha_apertura),
            apertura_fecha: fmtFechaBogota(s.fecha_apertura),
            cierre_hora: fmtHoraBogota(s.fecha_cierre),
            cierre_fecha: fmtFechaBogota(s.fecha_cierre)
        }));
    }

    /**
     * true si conviene avisar al usuario que no hay turno de caja abierto:
     * solo para tenants que alguna vez han usado el módulo (si nunca lo han
     * usado, mostrar el aviso sería imponerles un flujo que no quieren).
     */
    static async debeAvisarCajaCerrada(tenantId) {
        const abierta = await CajaRepository.getSesionAbierta(tenantId);
        if (abierta) {
            return false;
        }
        return await CajaRepository.hasHistorial(tenantId);
    }
}

module.exports = CajaService;
