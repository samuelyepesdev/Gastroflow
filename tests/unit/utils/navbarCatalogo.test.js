const {
    GRUPOS,
    CLAVES,
    normalizarOcultos,
    menuVisible,
    hayMas,
    catalogoParaUsuario
} = require('../../../utils/navbarCatalogo');

describe('navbarCatalogo - normalizarOcultos', () => {
    it('acepta un array o su JSON y descarta duplicados y claves desconocidas', () => {
        expect(normalizarOcultos(['finanzas', 'bonos', 'finanzas', 'hackeo', 5, null])).toEqual(['finanzas', 'bonos']);
        expect(normalizarOcultos('["mesas","pos"]')).toEqual(['mesas', 'pos']);
    });

    it('lo que no es una lista válida da lista vacía', () => {
        expect(normalizarOcultos(null)).toEqual([]);
        expect(normalizarOcultos(undefined)).toEqual([]);
        expect(normalizarOcultos('no-json')).toEqual([]);
        expect(normalizarOcultos('{"a":1}')).toEqual([]);
        expect(normalizarOcultos({ finanzas: true })).toEqual([]);
    });

    it('Configuración y el menú de usuario NO se pueden ocultar', () => {
        expect(normalizarOcultos(['configuracion', 'perfil', 'facturacion', 'asistente'])).toEqual([]);
        expect(CLAVES.has('configuracion')).toBe(false);
    });
});

describe('navbarCatalogo - menuVisible', () => {
    const can = { mesas: true, finanzas: true, configuracion: true, perfil: true, alertas: true };

    it('apaga solo los ocultos y NO toca el acceso real (can)', () => {
        const visible = menuVisible(can, ['finanzas']);
        expect(visible.finanzas).toBe(false);
        expect(visible.mesas).toBe(true);
        expect(can.finanzas).toBe(true); // el original sigue intacto
    });

    it('ignora claves fuera del catálogo (no se puede ocultar Configuración ni el perfil)', () => {
        const visible = menuVisible(can, ['configuracion', 'perfil', 'alertas']);
        expect(visible).toEqual(can);
    });

    it('sin ocultos devuelve el mismo menú', () => {
        expect(menuVisible(can, [])).toEqual(can);
        expect(menuVisible(can, undefined)).toEqual(can);
    });

    it('ocultar un enlace al que no se tiene acceso no lo hace aparecer', () => {
        expect(menuVisible({ mesas: false }, ['mesas']).mesas).toBe(false);
        expect(menuVisible({}, ['mesas']).mesas).toBe(false);
    });
});

describe('navbarCatalogo - hayMas', () => {
    it('muestra «Más» solo si queda algún enlace de ese desplegable', () => {
        expect(hayMas({ recetas: true })).toBe(true);
        expect(hayMas({ cocina: true })).toBe(true);
        expect(hayMas({ mesas: true, finanzas: true })).toBe(false);
    });

    it('al ocultar todo lo de «Más» el desplegable desaparece', () => {
        const can = { recetas: true, analitica: true, cocina: true };
        const visible = menuVisible(can, ['recetas', 'analitica', 'cocina']);
        expect(hayMas(visible)).toBe(false);
    });
});

describe('navbarCatalogo - catalogoParaUsuario', () => {
    it('lista solo lo que el usuario puede ver, con la marca de oculto, y sin grupos vacíos', () => {
        const can = { mesas: true, pos: true, finanzas: true, productos: false };
        const grupos = catalogoParaUsuario(can, ['pos']);
        expect(grupos.map(g => g.titulo)).toEqual(['Operación', 'Comercial y gestión']);
        const operacion = grupos[0].items.map(i => [i.clave, i.oculto]);
        expect(operacion).toEqual([
            ['mesas', false],
            ['pos', true]
        ]);
    });

    it('cada elemento del catálogo tiene clave única, etiqueta e icono', () => {
        const claves = GRUPOS.flatMap(g => g.items.map(i => i.clave));
        expect(new Set(claves).size).toBe(claves.length);
        GRUPOS.forEach(g => g.items.forEach(i => expect(i.etiqueta && i.icono).toBeTruthy()));
    });
});
