jest.mock('../../../repositories/Admin/PlanRepository');
const PlanRepository = require('../../../repositories/Admin/PlanRepository');
const cache = require('../../../services/Shared/CacheService');
const PlanService = require('../../../services/Admin/PlanService');

describe('PlanService.getAll cache', () => {
    beforeEach(() => {
        cache.clear();
        jest.clearAllMocks();
        PlanRepository.findAll.mockResolvedValue([{ id: 1 }]);
        PlanRepository.findById.mockResolvedValue({ id: 1 });
        PlanRepository.updatePrecios.mockResolvedValue();
    });

    it('queries the DB once across repeated calls', async () => {
        await PlanService.getAll();
        await PlanService.getAll();
        expect(PlanRepository.findAll).toHaveBeenCalledTimes(1);
    });

    it('refreshes after a plan price update', async () => {
        await PlanService.getAll();
        await PlanService.updatePrecios(1, { precio_pequeno: 1, precio_mediano: 2, precio_grande: 3 });
        await PlanService.getAll();
        expect(PlanRepository.findAll).toHaveBeenCalledTimes(2);
    });
});
