/**
 * Tests unitarios para utils/unidadesCosteo (conversión de unidades compartida entre
 * CosteoService e InventarioService).
 */

const { convertirABase, derivarTipoBase } = require('../../../utils/unidadesCosteo');

describe('unidadesCosteo', () => {
    describe('convertirABase', () => {
        it('convierte kg a gramos (x1000)', () => {
            expect(convertirABase(2, 'kg')).toEqual({ cantidadBase: 2000, tipoBase: 'g' });
        });

        it('convierte g y gr a gramos (x1)', () => {
            expect(convertirABase(500, 'g')).toEqual({ cantidadBase: 500, tipoBase: 'g' });
            expect(convertirABase(500, 'gr')).toEqual({ cantidadBase: 500, tipoBase: 'g' });
        });

        it('convierte lb a gramos (x453.592) — ausente antes en InventarioService', () => {
            const { cantidadBase, tipoBase } = convertirABase(1, 'lb');
            expect(cantidadBase).toBeCloseTo(453.592, 3);
            expect(tipoBase).toBe('g');
        });

        it('convierte L a mililitros (x1000)', () => {
            expect(convertirABase(1.5, 'L')).toEqual({ cantidadBase: 1500, tipoBase: 'ml' });
            expect(convertirABase(1.5, 'l')).toEqual({ cantidadBase: 1500, tipoBase: 'ml' });
        });

        it('convierte ml a mililitros (x1)', () => {
            expect(convertirABase(250, 'ml')).toEqual({ cantidadBase: 250, tipoBase: 'ml' });
        });

        it('trata UND/und/u como unidades (x1)', () => {
            expect(convertirABase(12, 'UND')).toEqual({ cantidadBase: 12, tipoBase: 'UND' });
            expect(convertirABase(12, 'und')).toEqual({ cantidadBase: 12, tipoBase: 'UND' });
            expect(convertirABase(12, 'u')).toEqual({ cantidadBase: 12, tipoBase: 'UND' });
        });

        it('unidad desconocida cae a UND con factor 1', () => {
            expect(convertirABase(5, 'caja')).toEqual({ cantidadBase: 5, tipoBase: 'UND' });
        });

        it('cantidad no numérica se trata como 0', () => {
            expect(convertirABase('abc', 'kg')).toEqual({ cantidadBase: 0, tipoBase: 'g' });
        });

        it('es insensible a mayúsculas/minúsculas', () => {
            expect(convertirABase(1, 'KG').cantidadBase).toBe(1000);
            expect(convertirABase(1, 'Lb').cantidadBase).toBeCloseTo(453.592, 3);
        });
    });

    describe('derivarTipoBase', () => {
        it('deriva g para unidades de peso', () => {
            expect(derivarTipoBase('kg')).toBe('g');
            expect(derivarTipoBase('g')).toBe('g');
            expect(derivarTipoBase('lb')).toBe('g');
        });

        it('deriva ml para unidades de volumen', () => {
            expect(derivarTipoBase('L')).toBe('ml');
            expect(derivarTipoBase('ml')).toBe('ml');
        });

        it('deriva UND para unidades de conteo o desconocidas', () => {
            expect(derivarTipoBase('UND')).toBe('UND');
            expect(derivarTipoBase('caja')).toBe('UND');
            expect(derivarTipoBase(undefined)).toBe('UND');
        });
    });
});
