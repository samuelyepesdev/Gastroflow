/**
 * Desglose de lo que se cobra de una venta entre efectivo y transferencia (lo que usan el arqueo de caja,
 * los reportes y el ticket). Un solo método cobra todo con él; 'mixto' reparte según los montos que indique
 * quien cobra y exige que cuadren con lo que falta por pagar (el total menos el bono, si hubo).
 */

const redondear = n => Math.round((Number(n) || 0) * 100) / 100;

function errorDeValidacion(mensaje) {
    const err = new Error(mensaje);
    err.status = 400;
    return err;
}

/**
 * @param {Object} p
 * @param {string} p.formaPago - 'efectivo' | 'transferencia' | 'mixto' (otro valor no reparte nada)
 * @param {number} p.pendiente - lo que se cobra en dinero (total menos bono)
 * @param {number} [p.montoBono] - cubierto con bono
 * @param {number} [p.efectivo] - solo para 'mixto'
 * @param {number} [p.transferencia] - solo para 'mixto'
 * @returns {{ formaPago: string, montoEfectivo: number, montoTransferencia: number }}
 * @throws {Error} con status 400 si el pago mixto no es válido
 */
function desglosarPago({ formaPago, pendiente, montoBono = 0, efectivo, transferencia }) {
    const aCobrar = redondear(pendiente);
    let montoEfectivo = 0;
    let montoTransferencia = 0;

    if (aCobrar > 0) {
        if (formaPago === 'efectivo') {
            montoEfectivo = aCobrar;
        } else if (formaPago === 'transferencia') {
            montoTransferencia = aCobrar;
        } else if (formaPago === 'mixto') {
            montoEfectivo = redondear(efectivo);
            montoTransferencia = redondear(transferencia);
            if (montoEfectivo <= 0 || montoTransferencia <= 0) {
                throw errorDeValidacion('El pago mixto necesita un monto en efectivo y otro en transferencia.');
            }
            if (Math.abs(montoEfectivo + montoTransferencia - aCobrar) > 0.01) {
                throw errorDeValidacion(
                    `Efectivo y transferencia deben sumar exactamente lo que se cobra (${aCobrar}).`
                );
            }
        }
    }

    let formaPagoFinal = formaPago;
    if (montoBono > 0) {
        formaPagoFinal = aCobrar > 0 ? 'mixto' : 'bono';
    }
    return { formaPago: formaPagoFinal, montoEfectivo, montoTransferencia };
}

module.exports = { desglosarPago };
