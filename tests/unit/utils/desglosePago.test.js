const { desglosarPago } = require('../../../utils/desglosePago');

describe('desglosarPago', () => {
    it('efectivo o transferencia cobran todo con ese método', () => {
        expect(desglosarPago({ formaPago: 'efectivo', pendiente: 50000 })).toEqual({
            formaPago: 'efectivo',
            montoEfectivo: 50000,
            montoTransferencia: 0
        });
        expect(desglosarPago({ formaPago: 'transferencia', pendiente: 50000 })).toEqual({
            formaPago: 'transferencia',
            montoEfectivo: 0,
            montoTransferencia: 50000
        });
    });

    it('mixto reparte según lo indicado y conserva la forma de pago', () => {
        expect(desglosarPago({ formaPago: 'mixto', pendiente: 50000, efectivo: 20000, transferencia: 30000 })).toEqual({
            formaPago: 'mixto',
            montoEfectivo: 20000,
            montoTransferencia: 30000
        });
    });

    it('mixto acepta una diferencia de redondeo de un centavo', () => {
        const r = desglosarPago({ formaPago: 'mixto', pendiente: 100, efectivo: 33.33, transferencia: 66.67 });
        expect(r.montoEfectivo + r.montoTransferencia).toBeCloseTo(100);
    });

    it.each([
        ['no suman el total', { efectivo: 10000, transferencia: 30000 }, /deben sumar exactamente/],
        ['se pasan del total', { efectivo: 40000, transferencia: 30000 }, /deben sumar exactamente/],
        ['falta el efectivo', { efectivo: 0, transferencia: 50000 }, /necesita un monto en efectivo y otro/],
        ['falta la transferencia', { efectivo: 50000 }, /necesita un monto en efectivo y otro/],
        ['no son números', { efectivo: 'abc', transferencia: 'x' }, /necesita un monto en efectivo y otro/]
    ])('rechaza un mixto que %s, con status 400', (_n, montos, mensaje) => {
        expect(() => desglosarPago({ formaPago: 'mixto', pendiente: 50000, ...montos })).toThrow(mensaje);
        try {
            desglosarPago({ formaPago: 'mixto', pendiente: 50000, ...montos });
        } catch (e) {
            expect(e.status).toBe(400);
        }
    });

    it('con bono, el mixto se valida contra lo que resta después del bono', () => {
        const r = desglosarPago({
            formaPago: 'mixto',
            pendiente: 30000,
            montoBono: 20000,
            efectivo: 10000,
            transferencia: 20000
        });
        expect(r).toEqual({ formaPago: 'mixto', montoEfectivo: 10000, montoTransferencia: 20000 });
    });

    it('un bono que cubre todo deja la factura en "bono" y no exige repartir nada', () => {
        expect(desglosarPago({ formaPago: 'mixto', pendiente: 0, montoBono: 50000 })).toEqual({
            formaPago: 'bono',
            montoEfectivo: 0,
            montoTransferencia: 0
        });
    });

    it('un bono parcial con un solo método queda como "mixto" (bono + método)', () => {
        expect(desglosarPago({ formaPago: 'efectivo', pendiente: 30000, montoBono: 20000 })).toEqual({
            formaPago: 'mixto',
            montoEfectivo: 30000,
            montoTransferencia: 0
        });
    });
});
