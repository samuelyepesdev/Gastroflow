/**
 * Tests unitarios para PlanService (repository mockeado)
 */

jest.mock('../../../repositories/Admin/PlanRepository', () => ({
    findAll: jest.fn(),
    findById: jest.fn(),
    findBySlug: jest.fn()
}));

const PlanService = require('../../../services/Admin/PlanService');
const PlanRepository = require('../../../repositories/Admin/PlanRepository');

describe('PlanService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('getAll', () => {
        it('devuelve todos los planes del repository', async () => {
            const planes = [
                { id: 1, nombre: 'Básico' },
                { id: 2, nombre: 'Pro' }
            ];
            PlanRepository.findAll.mockResolvedValue(planes);
            const result = await PlanService.getAll();
            expect(PlanRepository.findAll).toHaveBeenCalledTimes(1);
            expect(result).toEqual(planes);
        });
    });

    describe('getById', () => {
        it('devuelve el plan cuando existe', async () => {
            const plan = { id: 1, nombre: 'Básico', slug: 'basico' };
            PlanRepository.findById.mockResolvedValue(plan);
            const result = await PlanService.getById(1);
            expect(PlanRepository.findById).toHaveBeenCalledWith(1);
            expect(result).toEqual(plan);
        });
        it('devuelve null cuando no existe', async () => {
            PlanRepository.findById.mockResolvedValue(null);
            const result = await PlanService.getById(999);
            expect(result).toBeNull();
        });
    });

    describe('getBySlug', () => {
        it('devuelve el plan cuando existe', async () => {
            const plan = { id: 2, nombre: 'Pro', slug: 'pro' };
            PlanRepository.findBySlug.mockResolvedValue(plan);
            const result = await PlanService.getBySlug('pro');
            expect(PlanRepository.findBySlug).toHaveBeenCalledWith('pro');
            expect(result).toEqual(plan);
        });
        it('devuelve null cuando no existe', async () => {
            PlanRepository.findBySlug.mockResolvedValue(null);
            const result = await PlanService.getBySlug('inexistente');
            expect(result).toBeNull();
        });
    });
});
