const {
    OFFSET_INSUMO_VIRTUAL,
    esIdInsumoVirtual,
    idVirtualDeInsumo,
    insumoIdDeVirtual
} = require('../../../utils/insumoVirtual');

describe('insumoVirtual (convención de ids de insumos vendibles)', () => {
    test('el desplazamiento sigue siendo 1.000.000 (los ids ya guardados en carritos/pedidos dependen de él)', () => {
        expect(OFFSET_INSUMO_VIRTUAL).toBe(1000000);
    });

    test('ida y vuelta insumo <-> id virtual', () => {
        expect(idVirtualDeInsumo(25)).toBe(1000025);
        expect(insumoIdDeVirtual(1000025)).toBe(25);
        expect(insumoIdDeVirtual(idVirtualDeInsumo(7))).toBe(7);
    });

    test('reconoce ids virtuales en el borde y acepta strings numéricos', () => {
        expect(esIdInsumoVirtual(999999)).toBe(false);
        expect(esIdInsumoVirtual(1000000)).toBe(true);
        expect(esIdInsumoVirtual('1000025')).toBe(true);
        expect(esIdInsumoVirtual(12)).toBe(false);
        expect(esIdInsumoVirtual(null)).toBe(false);
        expect(esIdInsumoVirtual(undefined)).toBe(false);
    });
});
