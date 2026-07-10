/**
 * Tests unitarios para el motor de cálculo de CosteoService.
 * Cubre el bug real encontrado en auditoría: el método 'factor' no tenía manejo en
 * calcularCostoIndirecto (quedaba en 0 silenciosamente) y calcularCostoDirecto ignoraba
 * el costo real de compras (costo_promedio) y el rendimiento (merma) por insumo.
 */

jest.mock('../../../repositories/Tenant/RecetaRepository', () => ({
    findById: jest.fn(),
    findByProductoId: jest.fn(),
    findAll: jest.fn(),
    getIngredientes: jest.fn()
}));
jest.mock('../../../repositories/Tenant/ConfiguracionCosteoRepository', () => ({
    findOne: jest.fn(),
    create: jest.fn(),
    upsert: jest.fn()
}));
jest.mock('../../../repositories/Tenant/CostosFijosRepository', () => ({
    getTotalActivo: jest.fn()
}));
jest.mock('../../../repositories/Tenant/ProductRepository', () => ({
    findAll: jest.fn()
}));

const CosteoService = require('../../../services/Tenant/CosteoService');
const RecetaRepository = require('../../../repositories/Tenant/RecetaRepository');
const ConfiguracionCosteoRepository = require('../../../repositories/Tenant/ConfiguracionCosteoRepository');
const CostosFijosRepository = require('../../../repositories/Tenant/CostosFijosRepository');

const {
    calcularCostoDirecto,
    calcularCostoIndirecto,
    calcularPrecioSugerido,
    getCostoRealUnitario,
    aplicarRendimiento
} = CosteoService;

describe('CosteoService - motor de cálculo (funciones puras)', () => {
    describe('getCostoRealUnitario', () => {
        it('usa costo_promedio real cuando existe (compras reales vía Inventario)', () => {
            const insumo = { costo_promedio: 15.5, precio_compra: 6380, cantidad_compra: 4000, unidad_compra: 'g' };
            expect(getCostoRealUnitario(insumo)).toBe(15.5);
        });

        it('cae al precio de lista (precio_compra/cantidad_compra) si no hay costo_promedio', () => {
            const insumo = { costo_promedio: null, precio_compra: 2500, cantidad_compra: 1, unidad_compra: 'kg' };
            // 2500 / (1 * 1000 g) = 2.5 por gramo
            expect(getCostoRealUnitario(insumo)).toBeCloseTo(2.5, 5);
        });

        it('ignora costo_promedio si es 0 (insumo nunca comprado) y usa el fallback', () => {
            const insumo = { costo_promedio: 0, precio_compra: 1000, cantidad_compra: 1, unidad_compra: 'UND' };
            expect(getCostoRealUnitario(insumo)).toBe(1000);
        });
    });

    describe('aplicarRendimiento', () => {
        it('rendimiento 100% no cambia el costo', () => {
            expect(aplicarRendimiento(10, 100)).toBe(10);
        });

        it('rendimiento 80% encarece el costo limpio en 100/80', () => {
            expect(aplicarRendimiento(10, 80)).toBeCloseTo(12.5, 5);
        });

        it('rendimiento inválido (0, negativo, no numérico) cae a 100 (sin merma)', () => {
            expect(aplicarRendimiento(10, 0)).toBe(10);
            expect(aplicarRendimiento(10, -5)).toBe(10);
            expect(aplicarRendimiento(10, undefined)).toBe(10);
        });
    });

    describe('calcularCostoDirecto', () => {
        it('prioriza costo_promedio sobre precio_compra y aplica rendimiento', () => {
            // Insumo: costo_promedio real $2/g (de compras reales), pero precio_compra de lista
            // desactualizado sugeriría $1/g. Rendimiento 80% (se pierde 20% en limpieza).
            const ingredientes = [
                {
                    insumo_id: 1,
                    insumo_nombre: 'Pechuga de pollo',
                    cantidad: 100,
                    unidad: 'g',
                    costo_promedio: 2,
                    precio_compra: 1000,
                    cantidad_compra: 1000,
                    unidad_compra: 'g',
                    rendimiento_pct: 80
                }
            ];
            const { total, detalle } = calcularCostoDirecto(ingredientes);
            // costo limpio = 2 / (80/100) = 2.5 por gramo; 100g usados => $250
            expect(total).toBe(250);
            expect(detalle[0].costo_unitario_base).toBe(2);
            expect(detalle[0].costo_unitario_limpio).toBe(2.5);
        });

        it('sin costo_promedio, usa precio de lista y rendimiento 100% por defecto', () => {
            const ingredientes = [
                {
                    insumo_id: 2,
                    cantidad: 500,
                    unidad: 'g',
                    costo_promedio: null,
                    precio_compra: 2500,
                    cantidad_compra: 1,
                    unidad_compra: 'kg'
                    // sin rendimiento_pct -> default 100
                }
            ];
            const { total } = calcularCostoDirecto(ingredientes);
            // 2500/1000g = 2.5/g * 500g = 1250
            expect(total).toBe(1250);
        });

        it('convierte la unidad de la receta (kg) a la unidad base del costo (g)', () => {
            const ingredientes = [
                {
                    insumo_id: 3,
                    cantidad: 0.5,
                    unidad: 'kg',
                    costo_promedio: 10, // $10 por gramo
                    precio_compra: 0,
                    cantidad_compra: 1,
                    unidad_compra: 'kg'
                }
            ];
            const { total } = calcularCostoDirecto(ingredientes);
            // 0.5 kg = 500g * $10/g = 5000
            expect(total).toBe(5000);
        });

        it('ingrediente vacío no rompe el cálculo', () => {
            expect(calcularCostoDirecto([]).total).toBe(0);
            expect(calcularCostoDirecto(null).total).toBe(0);
        });
    });

    describe('calcularCostoIndirecto', () => {
        it('método porcentaje aplica % sobre el costo directo', () => {
            const config = { metodo_indirectos: 'porcentaje', porcentaje_indirectos: 10 };
            expect(calcularCostoIndirecto(100, config)).toBe(10);
        });

        it('método costo_fijo reparte el total de costos fijos entre platos estimados', () => {
            const config = { metodo_indirectos: 'costo_fijo', platos_estimados_mes: 500 };
            expect(calcularCostoIndirecto(100, config, 50000)).toBe(100);
        });

        it('sin config devuelve 0', () => {
            expect(calcularCostoIndirecto(100, null)).toBe(0);
        });

        it('BUG REGRESIÓN: metodo_indirectos legado "factor" ya no devuelve 0 silenciosamente', () => {
            // Antes: calcularCostoIndirecto no tenía case para 'factor' y retornaba 0,
            // subestimando el costo total usado en margen/alertas/punto de equilibrio.
            const config = { metodo_indirectos: 'factor', porcentaje_indirectos: 10, factor_carga: 2.5 };
            expect(calcularCostoIndirecto(100, config)).toBe(10);
        });
    });

    describe('calcularPrecioSugerido', () => {
        it('método margen (default): Precio = Costo / (1 - margen)', () => {
            const config = { metodo_precio: 'margen', margen_objetivo_default: 65 };
            expect(calcularPrecioSugerido(10, config)).toBeCloseTo(28.57, 2);
        });

        it('método factor: Precio = Costo × factor_carga', () => {
            const config = { metodo_precio: 'factor', factor_carga: 2.5 };
            expect(calcularPrecioSugerido(10, config)).toBe(25);
        });

        it('sin config: fallback costo x2', () => {
            expect(calcularPrecioSugerido(10, null)).toBe(20);
        });

        it('metodo_precio y metodo_indirectos son independientes: factor de precio con indirecto por costo_fijo', () => {
            const config = { metodo_indirectos: 'costo_fijo', metodo_precio: 'factor', factor_carga: 3 };
            expect(calcularPrecioSugerido(20, config)).toBe(60);
        });
    });
});

describe('CosteoService.getCosteoReceta - integración con costo real e independencia de métodos', () => {
    const tenantId = 1;
    const recetaId = 10;

    beforeEach(() => {
        jest.clearAllMocks();
        RecetaRepository.findById.mockResolvedValue({
            id: recetaId,
            porciones: 2,
            precio_venta_actual: 100
        });
        CostosFijosRepository.getTotalActivo.mockResolvedValue(0);
    });

    it('usa costo_promedio real de Inventario en vez del precio_compra desactualizado', async () => {
        RecetaRepository.getIngredientes.mockResolvedValue([
            {
                insumo_id: 1,
                cantidad: 100,
                unidad: 'g',
                costo_promedio: 1, // costo real actual: $1/g
                precio_compra: 5000, // precio de lista viejo/desactualizado
                cantidad_compra: 1,
                unidad_compra: 'kg', // sugeriría $5/g si se usara precio de lista
                rendimiento_pct: 100
            }
        ]);
        ConfiguracionCosteoRepository.findOne.mockResolvedValue({
            metodo_indirectos: 'porcentaje',
            metodo_precio: 'margen',
            porcentaje_indirectos: 0,
            margen_objetivo_default: 50
        });

        const costeo = await CosteoService.getCosteoReceta(recetaId, tenantId);
        // 100g * $1/g = $100 costo directo total / 2 porciones = $50 por porción
        expect(costeo.costo_directo_porcion).toBe(50);
    });

    it('método de precio "factor" ya no queda desconectado del costo indirecto real', async () => {
        RecetaRepository.getIngredientes.mockResolvedValue([
            {
                insumo_id: 1,
                cantidad: 100,
                unidad: 'g',
                costo_promedio: 1,
                precio_compra: 0,
                cantidad_compra: 1,
                unidad_compra: 'g',
                rendimiento_pct: 100
            }
        ]);
        ConfiguracionCosteoRepository.findOne.mockResolvedValue({
            metodo_indirectos: 'porcentaje',
            metodo_precio: 'factor',
            porcentaje_indirectos: 20,
            factor_carga: 3
        });

        const costeo = await CosteoService.getCosteoReceta(recetaId, tenantId);
        // directo/porción = 100*1/2 = 50; indirecto 20% = 10; CVU = 60; precio sugerido = 60*3 = 180
        expect(costeo.costo_total_porcion).toBe(60);
        expect(costeo.precio_sugerido).toBe(180);
    });
});
