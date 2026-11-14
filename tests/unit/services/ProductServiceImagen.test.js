jest.mock('../../../config/database', () => ({ query: jest.fn() }));
jest.mock('../../../repositories/Tenant/ProductRepository');
jest.mock('../../../repositories/Admin/CategoryRepository');
jest.mock('../../../repositories/Tenant/ProductoAuditoriaRepository');
jest.mock('../../../services/Tenant/PromocionService', () => ({}));
jest.mock('../../../services/Tenant/R2StorageService', () => ({
    eliminarSiHuerfano: jest.fn().mockResolvedValue(true)
}));

const ProductRepository = require('../../../repositories/Tenant/ProductRepository');
const R2StorageService = require('../../../services/Tenant/R2StorageService');
const ProductService = require('../../../services/Tenant/ProductService');

const datos = imagen_url => ({ codigo: 'A1', nombre: 'Café', precio_unidad: 5000, imagen_url });

describe('ProductService.update y las imágenes de R2', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        ProductRepository.update.mockResolvedValue({ affectedRows: 1 });
    });

    test('al cambiar la imagen se limpia la anterior (después de guardar)', async () => {
        ProductRepository.findById.mockResolvedValue({
            id: 1,
            codigo: 'A1',
            nombre: 'Café',
            imagen_url: 'https://cdn/productos/vieja.png'
        });
        await ProductService.update(1, 7, datos('https://cdn/productos/nueva.png'));
        expect(R2StorageService.eliminarSiHuerfano).toHaveBeenCalledWith('https://cdn/productos/vieja.png');
        expect(ProductRepository.update.mock.invocationCallOrder[0]).toBeLessThan(
            R2StorageService.eliminarSiHuerfano.mock.invocationCallOrder[0]
        );
    });

    test('quitar la imagen también limpia la anterior', async () => {
        ProductRepository.findById.mockResolvedValue({
            id: 1,
            codigo: 'A1',
            nombre: 'Café',
            imagen_url: 'https://cdn/productos/vieja.png'
        });
        await ProductService.update(1, 7, datos(null));
        expect(R2StorageService.eliminarSiHuerfano).toHaveBeenCalledWith('https://cdn/productos/vieja.png');
    });

    test('misma imagen o producto sin imagen previa: no se limpia nada', async () => {
        ProductRepository.findById.mockResolvedValue({
            id: 1,
            codigo: 'A1',
            nombre: 'Café',
            imagen_url: 'https://cdn/productos/a.png'
        });
        await ProductService.update(1, 7, datos('https://cdn/productos/a.png'));
        ProductRepository.findById.mockResolvedValue({ id: 1, codigo: 'A1', nombre: 'Café', imagen_url: null });
        await ProductService.update(1, 7, datos('https://cdn/productos/b.png'));
        expect(R2StorageService.eliminarSiHuerfano).not.toHaveBeenCalled();
    });

    test('si el UPDATE no afecta filas no se borra nada', async () => {
        ProductRepository.findById.mockResolvedValue({
            id: 1,
            codigo: 'A1',
            nombre: 'Café',
            imagen_url: 'https://cdn/productos/vieja.png'
        });
        ProductRepository.update.mockResolvedValue({ affectedRows: 0 });
        await expect(ProductService.update(1, 7, datos('https://cdn/productos/nueva.png'))).rejects.toThrow();
        expect(R2StorageService.eliminarSiHuerfano).not.toHaveBeenCalled();
    });
});
