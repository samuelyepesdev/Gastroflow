const { resolverPeriodo } = require('../../../services/Admin/AsistenteSistema/periodos');
const { AclaracionError } = require('../../../services/Tenant/Asistente/tools/errores');

const HOY = '2026-11-11'; // miércoles

const rango = (args, hoy = HOY) => {
    const r = resolverPeriodo(args, hoy);
    return [r.desde, r.hasta];
};

describe('resolverPeriodo', () => {
    it('sin nada pedido usa hoy', () => {
        expect(rango({})).toEqual([HOY, HOY]);
        expect(rango(undefined)).toEqual([HOY, HOY]);
    });

    it.each([
        ['hoy', ['2026-11-11', '2026-11-11']],
        ['ayer', ['2026-11-10', '2026-11-10']],
        ['ultimos_7_dias', ['2026-11-05', '2026-11-11']],
        ['este_mes', ['2026-11-01', '2026-11-11']],
        ['mes_pasado', ['2026-10-01', '2026-10-31']],
        ['este_anio', ['2026-01-01', '2026-11-11']],
        ['historico', ['2000-01-01', '2026-11-11']]
    ])('"%s" se resuelve en hora de Colombia', (periodo, esperado) => {
        expect(rango({ periodo })).toEqual(esperado);
    });

    it('enero retrocede bien al mes pasado (diciembre del año anterior)', () => {
        expect(rango({ periodo: 'mes_pasado' }, '2027-01-15')).toEqual(['2026-12-01', '2026-12-31']);
    });

    it('febrero bisiesto: el mes pasado termina el 29', () => {
        expect(rango({ periodo: 'mes_pasado' }, '2028-03-10')).toEqual(['2028-02-01', '2028-02-29']);
    });

    describe('periodo anterior para comparar', () => {
        const anterior = (args, hoy) => {
            const a = resolverPeriodo(args, hoy || HOY).anterior;
            return a && [a.desde, a.hasta];
        };

        it.each([
            ['hoy', ['2026-11-10', '2026-11-10']],
            ['ayer', ['2026-11-09', '2026-11-09']],
            ['ultimos_7_dias', ['2026-10-29', '2026-11-04']],
            ['este_mes', ['2026-10-01', '2026-10-11']],
            ['mes_pasado', ['2026-09-01', '2026-09-30']],
            ['este_anio', ['2025-01-01', '2025-11-11']]
        ])('de "%s"', (periodo, esperado) => {
            expect(anterior({ periodo })).toEqual(esperado);
        });

        it('el histórico no tiene con qué compararse', () => {
            expect(anterior({ periodo: 'historico' })).toBeNull();
        });

        it('un rango personalizado se compara con el tramo inmediatamente anterior de igual duración', () => {
            expect(anterior({ desde: '2026-11-01', hasta: '2026-11-10' })).toEqual(['2026-10-22', '2026-10-31']);
        });
    });

    describe('rango personalizado', () => {
        it('acepta desde y hasta', () => {
            expect(rango({ desde: '2026-10-05', hasta: '2026-10-20' })).toEqual(['2026-10-05', '2026-10-20']);
        });

        it('si solo dice "desde", llega hasta hoy', () => {
            expect(rango({ desde: '2026-11-01' })).toEqual(['2026-11-01', HOY]);
        });

        it('un "hasta" en el futuro se recorta a hoy', () => {
            expect(rango({ desde: '2026-11-01', hasta: '2027-02-01' })).toEqual(['2026-11-01', HOY]);
        });

        it('las fechas mandan sobre el periodo', () => {
            expect(rango({ periodo: 'ayer', desde: '2026-10-05', hasta: '2026-10-06' })).toEqual([
                '2026-10-05',
                '2026-10-06'
            ]);
        });

        it.each([
            ['solo hasta', { hasta: '2026-10-20' }],
            ['formato inválido', { desde: '11/10/2026', hasta: '2026-11-11' }],
            ['fecha que no existe', { desde: '2026-02-30', hasta: '2026-03-10' }],
            ['mes 13', { desde: '2026-13-01', hasta: '2026-13-10' }],
            ['desde después de hasta', { desde: '2026-11-10', hasta: '2026-11-01' }],
            ['más de 400 días', { desde: '2025-01-01', hasta: '2026-11-11' }],
            ['no es texto', { desde: 20261101, hasta: '2026-11-10' }],
            ['con texto extra (inyección)', { desde: '2026-11-01; DROP TABLE x', hasta: '2026-11-10' }]
        ])('pide aclarar si el rango es inválido: %s', (_n, args) => {
            expect(() => resolverPeriodo(args, HOY)).toThrow(AclaracionError);
        });
    });

    it.each([['siempre'], ['semana'], [''], [42], ['HOY'], ['__proto__']])(
        'un periodo desconocido (%p) pide aclarar con las opciones válidas',
        periodo => {
            expect(() => resolverPeriodo({ periodo }, HOY)).toThrow(AclaracionError);
            try {
                resolverPeriodo({ periodo }, HOY);
            } catch (e) {
                expect(e.message).toMatch(/este_mes/);
            }
        }
    );

    it('incluye una etiqueta legible con el rango', () => {
        expect(resolverPeriodo({ periodo: 'este_mes' }, HOY).etiqueta).toBe('este mes (2026-11-01 a 2026-11-11)');
        expect(resolverPeriodo({ periodo: 'hoy' }, HOY).etiqueta).toBe('hoy (2026-11-11)');
    });
});
