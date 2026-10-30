const colorAcento = require('../../../utils/colorAcento');

describe('colorAcento', () => {
    test('usa el color configurado por el tenant cuando existe', () => {
        const tenant = { config: { colores: { primary: '#ff0000' } } };
        expect(colorAcento(tenant, '#00ff00', '#0000ff')).toBe('#ff0000');
    });

    test('sin color de tenant, cae al color del navbar', () => {
        expect(colorAcento(null, '#00ff00', '#0000ff')).toBe('#00ff00');
        expect(colorAcento({}, '#00ff00')).toBe('#00ff00');
    });

    test('sin tenant ni navbar, cae al valor por defecto explícito', () => {
        expect(colorAcento(null, null, '#0000ff')).toBe('#0000ff');
    });

    test('sin nada, cae al verde de GastroFlow', () => {
        expect(colorAcento(null, null)).toBe('#ff5a36');
        expect(colorAcento(undefined, undefined)).toBe('#ff5a36');
    });

    test('tenant sin config.colores.primary (undefined en cualquier nivel) no revienta', () => {
        expect(colorAcento({}, null)).toBe('#ff5a36');
        expect(colorAcento({ config: {} }, null)).toBe('#ff5a36');
        expect(colorAcento({ config: { colores: {} } }, null)).toBe('#ff5a36');
    });
});
