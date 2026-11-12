const { pesosTexto, MONEDA } = require('../../../utils/pesosTexto');

describe('pesosTexto', () => {
    it.each([
        [0, '0 pesos'],
        [1, '1 peso'],
        [999, '999 pesos'],
        // Intl con es-CO no agrupa los miles de 4 cifras ("1234"): aquí siempre llevan punto.
        [1234, '1.234 pesos'],
        [12345, '12.345 pesos'],
        [1234567, '1.234.567 pesos'],
        [1234567.6, '1.234.568 pesos'],
        ['25000.00', '25.000 pesos'],
        [-5000, '-5.000 pesos']
    ])('%p -> %p', (valor, esperado) => {
        expect(pesosTexto(valor)).toBe(esperado);
    });

    it.each([[null], [undefined], ['abc'], [NaN], [Infinity], [{}]])('un valor no numérico (%p) es 0 pesos', valor => {
        expect(pesosTexto(valor)).toBe('0 pesos');
    });

    it('declara la moneda para que el modelo no la adivine', () => {
        expect(MONEDA).toMatch(/colombian/i);
    });
});
