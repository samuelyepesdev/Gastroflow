const { normalizar, palabrasANumeros, resolverMesa, resolverProducto } = require('../../../utils/asistenteMatching');

describe('normalizar', () => {
    it('pasa a minúsculas, quita tildes y signos', () => {
        expect(normalizar('  ¡Burrito  de la CASA! ')).toBe('burrito de la casa');
        expect(normalizar('Cerámica Ñoño')).toBe('ceramica nono');
    });

    it('tolera valores vacíos o no string', () => {
        expect(normalizar(null)).toBe('');
        expect(normalizar(undefined)).toBe('');
        expect(normalizar(42)).toBe('42');
    });
});

describe('palabrasANumeros', () => {
    it.each([
        ['mesa cuatro', 'mesa 4'],
        ['mesa ocho', 'mesa 8'],
        ['mesa veinte', 'mesa 20'],
        ['mesa veintiuno', 'mesa 21'],
        ['mesa treinta y uno', 'mesa 31'],
        ['mesa cuarenta y cinco', 'mesa 45'],
        ['cuatro ramen', '4 ramen'],
        ['una pizza', '1 pizza']
    ])('%s -> %s', (entrada, esperado) => {
        expect(palabrasANumeros(normalizar(entrada))).toBe(esperado);
    });

    it('no toca palabras que no son números', () => {
        expect(palabrasANumeros('terraza')).toBe('terraza');
    });
});

describe('resolverMesa', () => {
    const mesas = [
        { id: 1, numero: '4', descripcion: null, tipo: 'fisica' },
        { id: 2, numero: '14', descripcion: '', tipo: 'fisica' },
        { id: 3, numero: 'T1', descripcion: 'Terraza 1', tipo: 'fisica' },
        { id: 4, numero: 'T2', descripcion: 'Terraza 2', tipo: 'fisica' },
        { id: 5, numero: 'B1', descripcion: 'Barra', tipo: 'fisica' },
        { id: 6, numero: 'D1', descripcion: 'Domicilios', tipo: 'virtual' }
    ];

    it('resuelve "mesa cuatro" y "4" por número exacto, sin confundirlo con la 14', () => {
        expect(resolverMesa('mesa cuatro', mesas)).toEqual({ estado: 'ok', mesa: mesas[0] });
        expect(resolverMesa('4', mesas)).toEqual({ estado: 'ok', mesa: mesas[0] });
        expect(resolverMesa('la mesa 14', mesas).mesa).toBe(mesas[1]);
    });

    it('resuelve por número con código alfanumérico dicho con espacio ("t 1")', () => {
        expect(resolverMesa('mesa t 1', mesas).mesa).toBe(mesas[2]);
    });

    it('resuelve por descripción exacta y por descripción sin tildes ni mayúsculas', () => {
        expect(resolverMesa('Barra', mesas).mesa).toBe(mesas[4]);
        expect(resolverMesa('terraza dos', mesas).mesa).toBe(mesas[3]);
    });

    it('si el texto coincide con varias descripciones pide aclarar', () => {
        const r = resolverMesa('la terraza', mesas);
        expect(r.estado).toBe('ambigua');
        expect(r.candidatas.map(m => m.id)).toEqual([3, 4]);
    });

    it('"domicilio" resuelve la única mesa virtual', () => {
        expect(resolverMesa('para domicilio', mesas).mesa).toBe(mesas[5]);
        expect(resolverMesa('mesa de domicilio', mesas).mesa).toBe(mesas[5]);
    });

    it('si hay varias mesas virtuales, "domicilio" es ambiguo', () => {
        const dos = [...mesas, { id: 7, numero: 'D2', descripcion: 'Rappi', tipo: 'virtual' }];
        const r = resolverMesa('domicilio', dos);
        expect(r.estado).toBe('ambigua');
    });

    it('sin coincidencia devuelve sin_coincidencia, nunca adivina', () => {
        expect(resolverMesa('mesa 99', mesas)).toEqual({ estado: 'sin_coincidencia', candidatas: [] });
        expect(resolverMesa('', mesas).estado).toBe('sin_coincidencia');
        expect(resolverMesa(null, mesas).estado).toBe('sin_coincidencia');
    });

    it('un fragmento del número no coincide ("1" no es la mesa 14 ni T1)', () => {
        expect(resolverMesa('1', mesas).estado).toBe('sin_coincidencia');
    });
});

describe('resolverProducto', () => {
    const productos = [
        { id: 1, nombre: 'Burrito de la Casa', precio_unidad: 18000, disponible: 1 },
        { id: 2, nombre: 'Burrito Vegetariano', precio_unidad: 16000, disponible: 1 },
        { id: 3, nombre: 'Ramen', precio_unidad: 25000, disponible: 1 },
        { id: 4, nombre: 'Limonada Cerezada', precio_unidad: 9000, disponible: 1 },
        { id: 5, nombre: 'Tiramisú', precio_unidad: 12000, disponible: 0 }
    ];

    it('resuelve por nombre exacto normalizado', () => {
        expect(resolverProducto('burrito de la casa', productos)).toEqual({ estado: 'ok', producto: productos[0] });
        expect(resolverProducto('RAMEN', productos).producto).toBe(productos[2]);
    });

    it('acepta plurales simples', () => {
        expect(resolverProducto('ramens', productos).producto).toBe(productos[2]);
        expect(resolverProducto('burritos de la casa', productos).producto).toBe(productos[0]);
    });

    it('un término genérico presente en varios productos es ambiguo', () => {
        const r = resolverProducto('burrito', productos);
        expect(r.estado).toBe('ambigua');
        expect(r.candidatas.map(p => p.id)).toEqual([1, 2]);
    });

    it('tolera un error de transcripción pequeño y lo marca como aproximado', () => {
        const r = resolverProducto('ramem', productos);
        expect(r.estado).toBe('ok');
        expect(r.producto).toBe(productos[2]);
        expect(r.aproximada).toBe(true);
    });

    it('no inventa coincidencias con textos lejanos', () => {
        expect(resolverProducto('hamburguesa', productos).estado).toBe('sin_coincidencia');
    });

    it('un producto no disponible se informa como no_disponible, no como inexistente', () => {
        const r = resolverProducto('tiramisu', productos);
        expect(r.estado).toBe('no_disponible');
        expect(r.producto).toBe(productos[4]);
    });

    it('prefiere los disponibles cuando el mismo texto también coincide con uno no disponible', () => {
        const lista = [
            { id: 10, nombre: 'Postre Chocolate', disponible: 0 },
            { id: 11, nombre: 'Postre Fresa', disponible: 1 }
        ];
        const r = resolverProducto('postre', lista);
        expect(r.estado).toBe('ok');
        expect(r.producto.id).toBe(11);
    });

    it('texto vacío no resuelve nada', () => {
        expect(resolverProducto('  ', productos).estado).toBe('sin_coincidencia');
    });
});
