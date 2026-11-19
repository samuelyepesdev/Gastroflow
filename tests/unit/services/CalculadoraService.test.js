jest.mock('../../../config/database', () => ({ query: jest.fn() }));
jest.mock('../../../repositories/Public/CalculadoraRepository');

const CalculadoraRepository = require('../../../repositories/Public/CalculadoraRepository');
const CalculadoraService = require('../../../services/Public/CalculadoraService');

const { calcular, validarEntradas } = CalculadoraService;

const ENTRADAS = {
    reservas_semana: '30',
    personas_reserva: '3',
    ticket_persona: '45000',
    no_show_pct: '15',
    ventas_mes: '30000000',
    merma_pct: '5'
};
const CONTACTO = { restaurante: 'La Cazuela', telefono: '300 123 4567', email: '', consentimiento: true };

describe('CalculadoraService.calcular', () => {
    it('calcula no-show, merma, totales y lo recuperable', () => {
        const r = calcular(validarEntradas(ENTRADAS));
        // 30 reservas x 4,33 semanas x 3 personas x $45.000 x 15% = 2.630.475
        expect(r.no_show_mes).toBe(2630475);
        // $30.000.000 x 5% = 1.500.000
        expect(r.merma_mes).toBe(1500000);
        expect(r.perdida_mes).toBe(4130475);
        expect(r.perdida_anio).toBe(4130475 * 12);
        // 40% del no-show (1.052.190) + 30% de la merma (450.000)
        expect(r.recuperable_mes).toBe(1502190);
        expect(r.recuperable_anio).toBe(1502190 * 12);
    });

    it('con todo en cero no pierde nada', () => {
        const r = calcular({ ...validarEntradas(ENTRADAS), reservas_semana: 0, ventas_mes: 0 });
        expect(r).toMatchObject({ perdida_mes: 0, recuperable_mes: 0 });
    });
});

describe('CalculadoraService.validarEntradas', () => {
    it.each([
        ['reservas_semana', '-1'],
        ['reservas_semana', '5001'],
        ['personas_reserva', '0'],
        ['ticket_persona', '500'],
        ['no_show_pct', '81'],
        ['no_show_pct', '7.5'],
        ['ventas_mes', '45.000'],
        ['merma_pct', ''],
        ['merma_pct', 'abc']
    ])('rechaza %s = "%s"', (campo, valor) => {
        expect(() => validarEntradas({ ...ENTRADAS, [campo]: valor })).toThrow(
            expect.objectContaining({ code: 'CALCULADORA_ENTRADA_INVALIDA' })
        );
    });
});

describe('CalculadoraService.calcularYRegistrar', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        CalculadoraRepository.crear.mockResolvedValue(1);
    });

    it('guarda el prospecto con consentimiento, teléfono normalizado y el resultado', async () => {
        const r = await CalculadoraService.calcularYRegistrar({ ...ENTRADAS, ...CONTACTO }, '203.0.113.5');
        expect(r.perdida_mes).toBe(4130475);
        expect(CalculadoraRepository.crear).toHaveBeenCalledTimes(1);
        expect(CalculadoraRepository.crear).toHaveBeenCalledWith(
            expect.objectContaining({
                restaurante: 'La Cazuela',
                telefono: '3001234567',
                email: null,
                perdida_mes: 4130475,
                recuperable_mes: 1502190,
                consentimiento_ip: '203.0.113.5',
                consentimiento_at: expect.any(Date)
            })
        );
    });

    it.each([
        [{ consentimiento: false }, 'CALCULADORA_SIN_CONSENTIMIENTO'],
        [{ telefono: '12345' }, 'CALCULADORA_TELEFONO_INVALIDO'],
        [{ restaurante: ' ' }, 'CALCULADORA_RESTAURANTE_INVALIDO'],
        [{ email: 'no-es-correo' }, 'CALCULADORA_EMAIL_INVALIDO'],
        [{ no_show_pct: '99' }, 'CALCULADORA_ENTRADA_INVALIDA']
    ])('no guarda nada si %j', async (cambio, codigo) => {
        await expect(
            CalculadoraService.calcularYRegistrar({ ...ENTRADAS, ...CONTACTO, ...cambio }, '203.0.113.5')
        ).rejects.toMatchObject({ code: codigo });
        expect(CalculadoraRepository.crear).not.toHaveBeenCalled();
    });
});
