/**
 * ComboArmableService: validación del catálogo y de la selección "arma tu combo".
 * El repositorio se mockea: nunca toca una BD real.
 */

jest.mock('../../../config/database', () => ({ query: jest.fn(), getConnection: jest.fn() }));
jest.mock('../../../repositories/Tenant/ComboArmableRepository');

const ComboArmableRepository = require('../../../repositories/Tenant/ComboArmableRepository');
const ComboArmableService = require('../../../services/Tenant/ComboArmableService');

const TENANT = 7;

const opcion = (id, productoId, extra = {}) => ({
    id,
    producto_id: productoId,
    producto_nombre: `Producto ${productoId}`,
    cantidad: 1,
    recargo: 0,
    activo: 1,
    producto_activo: 1,
    ...extra
});

// Combo $20.000: plato fijo + bebida a elegir (una) + hasta 2 adicionales opcionales.
const estructura = () => ({
    id: 50,
    nombre: 'Combo Burger',
    precio_base: 20000,
    grupos: [
        { id: 1, nombre: 'Plato', minimo: 1, maximo: 1, opciones: [opcion(100, 10)] },
        {
            id: 2,
            nombre: 'Bebida',
            minimo: 1,
            maximo: 1,
            opciones: [opcion(200, 20), opcion(201, 21, { recargo: 2000 })]
        },
        {
            id: 3,
            nombre: 'Adicionales',
            minimo: 0,
            maximo: 2,
            opciones: [opcion(300, 30, { recargo: 1500 }), opcion(301, 31, { recargo: 3000 }), opcion(302, 32)]
        }
    ]
});

describe('ComboArmableService.validarSeleccion', () => {
    it('completa solo los grupos forzados y suma el precio base sin recargos', () => {
        const res = ComboArmableService.validarSeleccion(estructura(), [{ opcion_id: 200 }]);

        expect(res.precio_final).toBe(20000);
        expect(res.recargos).toBe(0);
        expect(res.selecciones.map(s => s.combo_opcion_id)).toEqual([100, 200]);
    });

    it('suma los recargos de las opciones elegidas al precio base', () => {
        const res = ComboArmableService.validarSeleccion(estructura(), [
            { opcion_id: 201 },
            { opcion_id: 300 },
            { opcion_id: 301 }
        ]);

        expect(res.recargos).toBe(6500);
        expect(res.precio_final).toBe(26500);
    });

    it('devuelve el snapshot con nombre de grupo/producto, cantidad y recargo', () => {
        const res = ComboArmableService.validarSeleccion(estructura(), [{ opcion_id: 201 }]);

        expect(res.selecciones).toContainEqual({
            combo_opcion_id: 201,
            producto_id: 21,
            grupo_nombre: 'Bebida',
            producto_nombre: 'Producto 21',
            cantidad: 1,
            recargo: 2000
        });
    });

    it('exige elegir en un grupo obligatorio con varias opciones', () => {
        expect(() => ComboArmableService.validarSeleccion(estructura(), [])).toThrow(/Elige una opción en "Bebida"/);
    });

    it('rechaza pasarse del máximo de un grupo', () => {
        expect(() =>
            ComboArmableService.validarSeleccion(estructura(), [
                { opcion_id: 200 },
                { opcion_id: 300 },
                { opcion_id: 301 },
                { opcion_id: 302 }
            ])
        ).toThrow(/máximo 2/);
    });

    it('rechaza dos opciones de un grupo de elección única', () => {
        expect(() =>
            ComboArmableService.validarSeleccion(estructura(), [{ opcion_id: 200 }, { opcion_id: 201 }])
        ).toThrow(/"Bebida" puedes elegir máximo 1/);
    });

    it('rechaza una opción repetida', () => {
        expect(() =>
            ComboArmableService.validarSeleccion(estructura(), [{ opcion_id: 200 }, { opcion_id: 200 }])
        ).toThrow(/misma opción dos veces/);
    });

    it('rechaza opciones de otro combo', () => {
        expect(() =>
            ComboArmableService.validarSeleccion(estructura(), [{ opcion_id: 200 }, { opcion_id: 999 }])
        ).toThrow(/no pertenece a este combo/);
    });

    it('ignora opciones inactivas: elegirlas falla y no cuentan para el grupo', () => {
        const e = estructura();
        e.grupos[1].opciones[1] = opcion(201, 21, { producto_activo: 0 });

        expect(() => ComboArmableService.validarSeleccion(e, [{ opcion_id: 201 }])).toThrow(
            /no pertenece a este combo/
        );
        // Con una sola opción activa el grupo queda forzado y se completa solo.
        expect(ComboArmableService.validarSeleccion(e, []).selecciones.map(s => s.combo_opcion_id)).toEqual([100, 200]);
    });

    it('un combo fijo (migrado) se vende sin enviar selecciones', () => {
        const fijo = {
            id: 60,
            nombre: 'Combo fijo',
            precio_base: 15000,
            grupos: [
                { id: 1, nombre: 'Hamburguesa', minimo: 1, maximo: 1, opciones: [opcion(1, 10)] },
                { id: 2, nombre: 'Papas', minimo: 1, maximo: 1, opciones: [opcion(2, 11, { cantidad: 2 })] }
            ]
        };
        const res = ComboArmableService.validarSeleccion(fijo, []);

        expect(res.precio_final).toBe(15000);
        expect(res.selecciones).toHaveLength(2);
        expect(res.selecciones[1].cantidad).toBe(2);
    });

    it('suma recargos decimales sin error de punto flotante', () => {
        const e = estructura();
        e.precio_base = 10000.1;
        e.grupos[2].opciones[0].recargo = 0.2;
        const res = ComboArmableService.validarSeleccion(e, [{ opcion_id: 200 }, { opcion_id: 300 }]);

        expect(res.precio_final).toBe(10000.3);
    });
});

describe('ComboArmableService.resolverSeleccion', () => {
    beforeEach(() => jest.resetAllMocks());

    it('carga el combo del tenant y valida la selección', async () => {
        const e = estructura();
        const { grupos, ...combo } = e;
        ComboArmableRepository.findById.mockResolvedValue(combo);
        ComboArmableRepository.getGrupos.mockResolvedValue(grupos);

        const res = await ComboArmableService.resolverSeleccion(50, TENANT, [{ opcion_id: 201 }]);

        expect(ComboArmableRepository.findById).toHaveBeenCalledWith(50, TENANT);
        expect(res.precio_final).toBe(22000);
    });

    it('falla si el combo no existe o es de otro tenant', async () => {
        ComboArmableRepository.findById.mockResolvedValue(null);

        await expect(ComboArmableService.resolverSeleccion(50, TENANT, [])).rejects.toThrow('Combo no encontrado');
    });
});

const datosValidos = () => ({
    nombre: ' Combo Burger ',
    precio_base: 20000,
    grupos: [
        { nombre: 'Plato', minimo: 1, maximo: 1, opciones: [{ producto_id: 10 }] },
        {
            nombre: 'Bebida',
            minimo: 1,
            maximo: 1,
            opciones: [{ producto_id: 20 }, { producto_id: 21, recargo: 2000, es_default: true }]
        }
    ]
});

describe('ComboArmableService.crear / actualizar', () => {
    beforeEach(() => {
        jest.resetAllMocks();
        ComboArmableRepository.findProductosElegibles.mockImplementation(async ids => ids);
        ComboArmableRepository.findEstacion.mockResolvedValue({ id: 4 });
        ComboArmableRepository.create.mockResolvedValue(99);
        ComboArmableRepository.replace.mockResolvedValue();
    });

    it('crea el combo con datos normalizados y valores por defecto', async () => {
        const res = await ComboArmableService.crear(TENANT, datosValidos());

        expect(res.id).toBe(99);
        const [tenantId, datos, grupos] = ComboArmableRepository.create.mock.calls[0];
        expect(tenantId).toBe(TENANT);
        expect(datos).toMatchObject({ nombre: 'Combo Burger', precio_base: 20000, estacion_id: null, tributo: null });
        expect(grupos[0].opciones[0]).toEqual({ producto_id: 10, cantidad: 1, recargo: 0, es_default: false });
        expect(grupos[1].opciones[1]).toMatchObject({ recargo: 2000, es_default: true });
    });

    it.each([
        ['iva_19', 19],
        ['impoconsumo_8', 8],
        ['exento', 0]
    ])('deriva la tasa del tributo %s cuando no se envía', async (tributo, tasa) => {
        await ComboArmableService.crear(TENANT, { ...datosValidos(), tributo });

        expect(ComboArmableRepository.create.mock.calls[0][1]).toMatchObject({ tributo, tasa_impuesto: tasa });
    });

    it('sin tributo deja la tasa en null (usa el default del restaurante)', async () => {
        await ComboArmableService.crear(TENANT, { ...datosValidos(), tasa_impuesto: 19 });

        expect(ComboArmableRepository.create.mock.calls[0][1]).toMatchObject({ tributo: null, tasa_impuesto: null });
    });

    it.each([
        ['sin nombre', { nombre: '  ' }, /nombre/],
        ['precio 0', { precio_base: 0 }, /precio/],
        ['tributo inválido', { tributo: 'iva_99' }, /Tributo/],
        ['sin grupos', { grupos: [] }, /al menos un grupo/],
        ['grupo sin nombre', { grupos: [{ nombre: '', opciones: [{ producto_id: 1 }] }] }, /necesita un nombre/],
        ['grupo sin opciones', { grupos: [{ nombre: 'X', opciones: [] }] }, /al menos una opción/],
        [
            'producto repetido en el grupo',
            { grupos: [{ nombre: 'X', opciones: [{ producto_id: 1 }, { producto_id: 1 }] }] },
            /repite un producto/
        ],
        [
            'mínimo mayor al máximo',
            { grupos: [{ nombre: 'X', minimo: 2, maximo: 1, opciones: [{ producto_id: 1 }, { producto_id: 2 }] }] },
            /mínimo\/máximo inválido/
        ],
        [
            'máximo mayor a las opciones',
            { grupos: [{ nombre: 'X', minimo: 1, maximo: 3, opciones: [{ producto_id: 1 }] }] },
            /más opciones de las que ofrece/
        ],
        [
            'recargo negativo',
            { grupos: [{ nombre: 'X', opciones: [{ producto_id: 1, recargo: -5 }] }] },
            /no puede ser negativo/
        ],
        ['cantidad 0', { grupos: [{ nombre: 'X', opciones: [{ producto_id: 1, cantidad: 0 }] }] }, /cantidad mayor a 0/]
    ])('rechaza %s', async (_caso, cambios, mensaje) => {
        await expect(ComboArmableService.crear(TENANT, { ...datosValidos(), ...cambios })).rejects.toThrow(mensaje);
        expect(ComboArmableRepository.create).not.toHaveBeenCalled();
    });

    it('rechaza productos que no existen, están inactivos o son combos', async () => {
        ComboArmableRepository.findProductosElegibles.mockResolvedValue([10]);

        await expect(ComboArmableService.crear(TENANT, datosValidos())).rejects.toThrow(/no existe, está inactivo/);
    });

    it('rechaza una estación de otro tenant', async () => {
        ComboArmableRepository.findEstacion.mockResolvedValue(null);

        await expect(ComboArmableService.crear(TENANT, { ...datosValidos(), estacion_id: 4 })).rejects.toThrow(
            /estación/
        );
    });

    it('actualizar falla si el combo no existe', async () => {
        ComboArmableRepository.findById.mockResolvedValue(null);

        await expect(ComboArmableService.actualizar(1, TENANT, datosValidos())).rejects.toThrow('Combo no encontrado');
        expect(ComboArmableRepository.replace).not.toHaveBeenCalled();
    });

    it('actualizar reemplaza la estructura del combo', async () => {
        ComboArmableRepository.findById.mockResolvedValue({ id: 1 });

        await ComboArmableService.actualizar(1, TENANT, datosValidos());

        expect(ComboArmableRepository.replace).toHaveBeenCalledWith(1, TENANT, expect.any(Object), expect.any(Array));
    });

    it('eliminar falla si el combo no existe', async () => {
        ComboArmableRepository.softDelete.mockResolvedValue(false);

        await expect(ComboArmableService.eliminar(1, TENANT)).rejects.toThrow('Combo no encontrado');
    });
});

describe('ComboArmableService.listarParaVenta', () => {
    beforeEach(() => jest.resetAllMocks());

    const opcionDb = (id, productoId, extra = {}) => ({
        id,
        producto_id: productoId,
        producto_nombre: `P${productoId}`,
        cantidad: '1.00',
        recargo: '0.00',
        activo: 1,
        producto_activo: 1,
        es_default: 0,
        ...extra
    });

    it('arma el catálogo con números, marca los grupos forzados y oculta opciones inactivas', async () => {
        ComboArmableRepository.findAll.mockResolvedValue([
            { id: 1, nombre: 'Combo A', descripcion: null, imagen_url: null, precio_base: '20000.00' }
        ]);
        ComboArmableRepository.getGruposPorCombos.mockResolvedValue([
            { id: 10, combo_id: 1, nombre: 'Plato', minimo: 1, maximo: 1, opciones: [opcionDb(100, 5)] },
            {
                id: 11,
                combo_id: 1,
                nombre: 'Bebida',
                minimo: 1,
                maximo: 1,
                opciones: [
                    opcionDb(200, 6, { recargo: '2000.00' }),
                    opcionDb(201, 7),
                    opcionDb(202, 8, { producto_activo: 0 })
                ]
            }
        ]);

        const [combo] = await ComboArmableService.listarParaVenta(TENANT);

        expect(ComboArmableRepository.getGruposPorCombos).toHaveBeenCalledWith([1]);
        expect(combo.precio_base).toBe(20000);
        expect(combo.grupos[0]).toMatchObject({ forzado: true });
        expect(combo.grupos[1].forzado).toBe(false);
        expect(combo.grupos[1].opciones.map(o => o.id)).toEqual([200, 201]);
        expect(combo.grupos[1].opciones[0].recargo).toBe(2000);
    });

    it('no ofrece un combo al que le faltan opciones para cumplir un mínimo', async () => {
        ComboArmableRepository.findAll.mockResolvedValue([
            { id: 1, nombre: 'Roto', precio_base: '1000' },
            { id: 2, nombre: 'Bien', precio_base: '1000' }
        ]);
        ComboArmableRepository.getGruposPorCombos.mockResolvedValue([
            { id: 10, combo_id: 1, nombre: 'Bebida', minimo: 1, maximo: 1, opciones: [opcionDb(1, 5, { activo: 0 })] },
            { id: 11, combo_id: 2, nombre: 'Bebida', minimo: 1, maximo: 1, opciones: [opcionDb(2, 6)] }
        ]);

        const combos = await ComboArmableService.listarParaVenta(TENANT);

        expect(combos.map(c => c.nombre)).toEqual(['Bien']);
    });

    it('sin combos devuelve lista vacía', async () => {
        ComboArmableRepository.findAll.mockResolvedValue([]);
        ComboArmableRepository.getGruposPorCombos.mockResolvedValue([]);

        await expect(ComboArmableService.listarParaVenta(TENANT)).resolves.toEqual([]);
    });
});

describe('ComboArmableService.resolverLineaVenta', () => {
    beforeEach(() => {
        jest.resetAllMocks();
        const e = estructura();
        const { grupos, ...combo } = e;
        ComboArmableRepository.findById.mockResolvedValue(combo);
        ComboArmableRepository.getGrupos.mockResolvedValue(grupos);
    });

    const linea = extra => ({ combo_id: 50, cantidad: 2, selecciones: [{ opcion_id: 201 }], ...extra });

    it('el precio sale del catálogo aunque el cliente mande otro más alto', async () => {
        const res = await ComboArmableService.resolverLineaVenta(TENANT, linea({ precio: 99999, subtotal: 999999 }));

        expect(res).toMatchObject({
            combo_id: 50,
            producto_id: null,
            es_servicio: false,
            nombre: 'Combo Burger',
            cantidad: 2,
            precio: 22000,
            precio_original: 22000,
            subtotal: 44000
        });
        expect(res._comboSelecciones.map(s => s.combo_opcion_id)).toEqual([100, 201]);
    });

    it('respeta un descuento manual (precio y subtotal menores) pero deja el precio original', async () => {
        const res = await ComboArmableService.resolverLineaVenta(TENANT, linea({ precio: 20000, subtotal: 40000 }));

        expect(res).toMatchObject({ precio: 20000, precio_original: 22000, subtotal: 40000 });
    });

    it('un subtotal mayor al precio x cantidad se ignora', async () => {
        const res = await ComboArmableService.resolverLineaVenta(TENANT, linea({ precio: 20000, subtotal: 44000 }));

        expect(res.subtotal).toBe(40000);
    });

    it('sin precio ni subtotal usa el catálogo', async () => {
        const res = await ComboArmableService.resolverLineaVenta(TENANT, linea());

        expect(res).toMatchObject({ precio: 22000, subtotal: 44000 });
    });

    it('conserva el resto de campos de la línea (descuentos, unidad)', async () => {
        const res = await ComboArmableService.resolverLineaVenta(
            TENANT,
            linea({ descuento_porcentaje: 10, unidad: 'UND' })
        );

        expect(res).toMatchObject({ descuento_porcentaje: 10, unidad: 'UND' });
    });

    it('propaga el error si la selección es inválida', async () => {
        await expect(ComboArmableService.resolverLineaVenta(TENANT, linea({ selecciones: [] }))).rejects.toThrow(
            /Bebida/
        );
    });
});
