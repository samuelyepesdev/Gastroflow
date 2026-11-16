const {
    fechaColombia,
    hoyColombia,
    sumarDias,
    esUltimoDiaDelMes,
    sumarMeses,
    rangoUtcColombia,
    SQL_COLOMBIA,
    toFechaDia
} = require('../../../utils/dateHelpers');

// Copia exacta de la función que estaba duplicada en 6 archivos (Stats/Crecimiento),
// para garantizar que el reemplazo centralizado da el mismo resultado.
function getUtcRangeForColombiaOriginal(desde, hasta) {
    const utcDesde = `${desde} 05:00:00`;
    const utcHastaDate = new Date(`${hasta}T23:59:59`);
    utcHastaDate.setHours(utcHastaDate.getHours() + 5);
    const y = utcHastaDate.getFullYear();
    const m = String(utcHastaDate.getMonth() + 1).padStart(2, '0');
    const d = String(utcHastaDate.getDate()).padStart(2, '0');
    const hh = String(utcHastaDate.getHours()).padStart(2, '0');
    const mm = String(utcHastaDate.getMinutes()).padStart(2, '0');
    const ss = String(utcHastaDate.getSeconds()).padStart(2, '0');
    return { utcDesde, utcHasta: `${y}-${m}-${d} ${hh}:${mm}:${ss}` };
}

describe('fechaColombia / hoyColombia', () => {
    test.each([
        ['2026-09-25T23:30:00Z', '2026-09-25'], // 6:30 p. m. en Colombia: sigue siendo el 25
        ['2026-09-26T04:59:59Z', '2026-09-25'], // 11:59 p. m.
        ['2026-09-26T05:00:00Z', '2026-09-26'], // medianoche Colombia
        ['2027-01-01T03:00:00Z', '2026-12-31'] // cambio de año
    ])('%s -> %s', (instante, esperado) => {
        expect(fechaColombia(new Date(instante))).toBe(esperado);
    });

    test('hoyColombia devuelve YYYY-MM-DD', () => {
        expect(hoyColombia()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
});

describe('sumarDias', () => {
    test.each([
        ['2026-01-31', 1, '2026-02-01'],
        ['2028-02-28', 1, '2028-02-29'], // bisiesto
        ['2026-12-31', 1, '2027-01-01'],
        ['2026-03-01', -1, '2026-02-28'],
        ['2026-09-26', -30, '2026-08-27']
    ])('%s %+d -> %s', (dia, n, esperado) => {
        expect(sumarDias(dia, n)).toBe(esperado);
    });
});

describe('sumarMeses', () => {
    test.each([
        ['2026-09-26', 1, '2026-10-26'],
        ['2026-01-31', 1, '2026-02-28'], // no 3 de marzo
        ['2028-01-31', 1, '2028-02-29'], // bisiesto
        ['2026-12-15', 1, '2027-01-15'],
        ['2026-03-31', -1, '2026-02-28'],
        ['2026-10-31', 12, '2027-10-31']
    ])('%s %+d mes(es) -> %s', (dia, n, esperado) => {
        expect(sumarMeses(dia, n)).toBe(esperado);
    });
});

describe('esUltimoDiaDelMes', () => {
    test.each([
        ['2026-11-30', true],
        ['2026-11-29', false],
        ['2026-12-31', true], // fin de año
        ['2027-02-28', true],
        ['2028-02-28', false], // bisiesto: el 29 es el último
        ['2028-02-29', true],
        ['2026-01-01', false]
    ])('%s -> %s', (dia, esperado) => {
        expect(esUltimoDiaDelMes(dia)).toBe(esperado);
    });

    test('sin argumento usa hoy en Colombia', () => {
        expect(esUltimoDiaDelMes()).toBe(esUltimoDiaDelMes(hoyColombia()));
    });
});

describe('rangoUtcColombia', () => {
    test('un día Colombia = de 05:00 UTC a 04:59:59 UTC del día siguiente', () => {
        expect(rangoUtcColombia('2026-09-25')).toEqual({
            utcDesde: '2026-09-25 05:00:00',
            utcHasta: '2026-09-26 04:59:59'
        });
    });

    test.each([
        ['2026-09-01', '2026-09-25'],
        ['2026-01-31', '2026-01-31'],
        ['2026-12-01', '2026-12-31'],
        ['2028-02-01', '2028-02-29'],
        ['2026-02-28', '2026-02-28']
    ])('igual a la función original para %s..%s', (desde, hasta) => {
        expect(rangoUtcColombia(desde, hasta)).toEqual(getUtcRangeForColombiaOriginal(desde, hasta));
    });
});

describe('SQL_COLOMBIA', () => {
    test('fragmentos con los offsets correctos', () => {
        expect(SQL_COLOMBIA.hoy).toBe("DATE(CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '-05:00'))");
        expect(SQL_COLOMBIA.dia('f.fecha')).toBe("DATE(CONVERT_TZ(f.fecha, '+00:00', '-05:00'))");
        expect(SQL_COLOMBIA.desdeDia()).toBe("CONVERT_TZ(?, '-05:00', '+00:00')");
        expect(SQL_COLOMBIA.hastaDia()).toBe("CONVERT_TZ(DATE_ADD(?, INTERVAL 1 DAY), '-05:00', '+00:00')");
        expect(SQL_COLOMBIA.inicioHoyUtc).toContain('UTC_TIMESTAMP()');
    });
});

describe('toFechaDia', () => {
    test('Date (DATE de mysql2 en producción) y string (local)', () => {
        expect(toFechaDia(new Date(2026, 8, 25))).toBe('2026-09-25');
        expect(toFechaDia('2026-09-25')).toBe('2026-09-25');
        expect(toFechaDia(null)).toBeNull();
    });
});
