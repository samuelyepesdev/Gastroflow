const AsistenteResolverService = require('../../../services/Tenant/Asistente/AsistenteResolverService');
const AsistenteRepository = require('../../../repositories/Tenant/AsistenteRepository');
const ProductRepository = require('../../../repositories/Tenant/ProductRepository');

jest.mock('../../../repositories/Tenant/AsistenteRepository', () => ({ listarMesas: jest.fn() }));
jest.mock('../../../repositories/Tenant/ProductRepository', () => ({ findAll: jest.fn() }));

describe('AsistenteResolverService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('resuelve la mesa usando solo las mesas del tenant de la sesión', async () => {
        AsistenteRepository.listarMesas.mockResolvedValueOnce([
            { id: 7, numero: '4', descripcion: null, tipo: 'fisica' }
        ]);

        const r = await AsistenteResolverService.resolverMesa(55, 'mesa cuatro');

        expect(AsistenteRepository.listarMesas).toHaveBeenCalledWith(55);
        expect(r).toEqual({ estado: 'ok', mesa: expect.objectContaining({ id: 7 }) });
    });

    it('resuelve el producto con el catálogo del tenant de la sesión y distingue no disponibles', async () => {
        ProductRepository.findAll.mockResolvedValueOnce([
            { id: 1, nombre: 'Ramen', precio_unidad: 25000, disponible: 1 },
            { id: 2, nombre: 'Tiramisú', precio_unidad: 12000, disponible: 0 }
        ]);
        ProductRepository.findAll.mockResolvedValueOnce([{ id: 2, nombre: 'Tiramisú', disponible: 0 }]);

        const ok = await AsistenteResolverService.resolverProducto(55, 'ramen');
        const noDisp = await AsistenteResolverService.resolverProducto(55, 'tiramisu');

        expect(ProductRepository.findAll).toHaveBeenCalledWith(55);
        expect(ok.producto.id).toBe(1);
        expect(noDisp.estado).toBe('no_disponible');
    });

    it('si el tenant no tiene mesas ni productos coincidentes no inventa nada', async () => {
        AsistenteRepository.listarMesas.mockResolvedValueOnce([]);
        ProductRepository.findAll.mockResolvedValueOnce([]);

        expect((await AsistenteResolverService.resolverMesa(1, 'mesa 1')).estado).toBe('sin_coincidencia');
        expect((await AsistenteResolverService.resolverProducto(1, 'ramen')).estado).toBe('sin_coincidencia');
    });
});
