jest.mock('../../../repositories/Tenant/BonoRepository');
jest.mock('../../../services/Tenant/FinanzasService', () => ({
    registrarMovimientoManual: jest.fn().mockResolvedValue(undefined)
}));
jest.mock('../../../services/Tenant/BonoComprobanteService', () => ({
    generar: jest.fn().mockResolvedValue('https://fake-r2/bonos/bono-test.pdf')
}));

const BonoService = require('../../../services/Tenant/BonoService');
const BonoRepository = require('../../../repositories/Tenant/BonoRepository');
const FinanzasService = require('../../../services/Tenant/FinanzasService');
const BonoComprobanteService = require('../../../services/Tenant/BonoComprobanteService');

describe('BonoService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('crear', () => {
        it('rechaza un valor <= 0', async () => {
            await expect(BonoService.crear(1, { valor: 0, origen: 'comprado' })).rejects.toThrow(
                'El valor del bono debe ser mayor a 0'
            );
            expect(BonoRepository.create).not.toHaveBeenCalled();
        });

        it('rechaza un origen inválido', async () => {
            await expect(BonoService.crear(1, { valor: 10000, origen: 'descuento' })).rejects.toThrow(
                'El origen del bono debe ser "comprado" o "regalo"'
            );
        });

        it('crea el bono, registra la emisión, y NO toca Finanzas si es "regalo"', async () => {
            BonoRepository.findByCodigo.mockResolvedValue(null); // el código generado no colisiona
            BonoRepository.create.mockResolvedValue(42);

            const result = await BonoService.crear(1, { valor: 10000, origen: 'regalo', usuarioId: 9 });

            expect(result).toEqual(expect.objectContaining({ id: 42, valor_inicial: 10000, saldo_actual: 10000 }));
            expect(result.codigo).toMatch(/^BONO-[A-Z0-9]{6}$/);
            expect(BonoRepository.registrarMovimiento).toHaveBeenCalledWith(
                expect.objectContaining({ bonoId: 42, tipo: 'emision', monto: 10000, usuarioId: 9 })
            );
            expect(FinanzasService.registrarMovimientoManual).not.toHaveBeenCalled();
        });

        it('si es "comprado", registra el ingreso en Finanzas', async () => {
            BonoRepository.findByCodigo.mockResolvedValue(null);
            BonoRepository.create.mockResolvedValue(43);

            await BonoService.crear(1, { valor: 50000, origen: 'comprado', usuarioId: 9 });

            expect(FinanzasService.registrarMovimientoManual).toHaveBeenCalledWith(
                1,
                expect.objectContaining({ monto: 50000, tipo: 'entrada', usuario_id: 9 })
            );
        });

        it('si Finanzas falla al registrar el ingreso, el bono queda emitido igual (no bloqueante)', async () => {
            BonoRepository.findByCodigo.mockResolvedValue(null);
            BonoRepository.create.mockResolvedValue(44);
            FinanzasService.registrarMovimientoManual.mockRejectedValue(new Error('caja rota'));

            await expect(BonoService.crear(1, { valor: 20000, origen: 'comprado' })).resolves.toEqual(
                expect.objectContaining({ id: 44 })
            );
        });

        it('genera el comprobante y guarda su URL en el bono y en el resultado', async () => {
            BonoRepository.findByCodigo.mockResolvedValue(null);
            BonoRepository.create.mockResolvedValue(46);

            const result = await BonoService.crear(1, { valor: 30000, origen: 'regalo' });

            expect(BonoComprobanteService.generar).toHaveBeenCalledWith(
                1,
                expect.objectContaining({ valor_inicial: 30000, origen: 'regalo' })
            );
            expect(BonoRepository.actualizarImagenUrl).toHaveBeenCalledWith(
                46,
                1,
                'https://fake-r2/bonos/bono-test.pdf'
            );
            expect(result.imagen_url).toBe('https://fake-r2/bonos/bono-test.pdf');
        });

        it('si falla el comprobante, el bono queda emitido igual (no bloqueante)', async () => {
            BonoRepository.findByCodigo.mockResolvedValue(null);
            BonoRepository.create.mockResolvedValue(47);
            BonoComprobanteService.generar.mockRejectedValueOnce(new Error('R2 caído'));

            await expect(BonoService.crear(1, { valor: 15000, origen: 'regalo' })).resolves.toEqual(
                expect.objectContaining({ id: 47, imagen_url: null })
            );
            expect(BonoRepository.actualizarImagenUrl).not.toHaveBeenCalled();
        });

        it('reintenta generar código si el primero ya existe', async () => {
            BonoRepository.findByCodigo
                .mockResolvedValueOnce({ id: 1, codigo: 'BONO-COLISION' }) // primer intento: colisiona
                .mockResolvedValueOnce(null); // segundo intento: libre
            BonoRepository.create.mockResolvedValue(45);

            const result = await BonoService.crear(1, { valor: 5000, origen: 'regalo' });

            expect(BonoRepository.findByCodigo).toHaveBeenCalledTimes(2);
            expect(result.id).toBe(45);
        });
    });

    describe('anular', () => {
        it('lanza si el bono no existe', async () => {
            BonoRepository.findById.mockResolvedValue(null);
            await expect(BonoService.anular(1, 1, 9)).rejects.toThrow('Bono no encontrado');
        });

        it('lanza si ya está anulado', async () => {
            BonoRepository.findById.mockResolvedValue({ id: 1, estado: 'anulado' });
            await expect(BonoService.anular(1, 1, 9)).rejects.toThrow('Este bono ya está anulado');
        });

        it('lanza si ya está agotado', async () => {
            BonoRepository.findById.mockResolvedValue({ id: 1, estado: 'agotado' });
            await expect(BonoService.anular(1, 1, 9)).rejects.toThrow(
                'Este bono ya se usó por completo, no se puede anular'
            );
        });

        it('anula un bono activo y registra el movimiento', async () => {
            BonoRepository.findById.mockResolvedValue({ id: 1, estado: 'activo', saldo_actual: 7000 });

            await expect(BonoService.anular(1, 1, 9)).resolves.toBe(true);
            expect(BonoRepository.anular).toHaveBeenCalledWith(1, 1);
            expect(BonoRepository.registrarMovimiento).toHaveBeenCalledWith(
                expect.objectContaining({ bonoId: 1, tipo: 'anulacion', monto: 7000, usuarioId: 9 })
            );
        });
    });

    describe('validarParaRedimir', () => {
        const connection = {};

        it('retorna null sin consultar el repositorio si no se pasa código', async () => {
            const result = await BonoService.validarParaRedimir(1, null, connection);
            expect(result).toBeNull();
            expect(BonoRepository.findByCodigoForUpdate).not.toHaveBeenCalled();
        });

        it('lanza si el código no existe', async () => {
            BonoRepository.findByCodigoForUpdate.mockResolvedValue(null);
            await expect(BonoService.validarParaRedimir(1, 'BONO-X', connection)).rejects.toThrow(
                'El código de bono no existe'
            );
        });

        it('lanza si está anulado', async () => {
            BonoRepository.findByCodigoForUpdate.mockResolvedValue({ estado: 'anulado', saldo_actual: 100 });
            await expect(BonoService.validarParaRedimir(1, 'BONO-X', connection)).rejects.toThrow(
                'Este bono fue anulado'
            );
        });

        it('lanza si está vencido por fecha aunque el estado siga "activo" (el cron diario aún no corrió)', async () => {
            BonoRepository.findByCodigoForUpdate.mockResolvedValue({
                estado: 'activo',
                saldo_actual: 100,
                fecha_vencimiento: '2000-01-01'
            });
            await expect(BonoService.validarParaRedimir(1, 'BONO-X', connection)).rejects.toThrow(
                'Este bono está vencido'
            );
        });

        it('lanza si no tiene saldo disponible', async () => {
            BonoRepository.findByCodigoForUpdate.mockResolvedValue({
                estado: 'activo',
                saldo_actual: 0,
                fecha_vencimiento: null
            });
            await expect(BonoService.validarParaRedimir(1, 'BONO-X', connection)).rejects.toThrow(
                'Este bono ya no tiene saldo disponible'
            );
        });

        it('retorna el bono si es válido, normalizando el código a mayúsculas', async () => {
            const bono = { estado: 'activo', saldo_actual: 5000, fecha_vencimiento: null };
            BonoRepository.findByCodigoForUpdate.mockResolvedValue(bono);

            const result = await BonoService.validarParaRedimir(1, ' bono-abc123 ', connection);

            expect(result).toBe(bono);
            expect(BonoRepository.findByCodigoForUpdate).toHaveBeenCalledWith('BONO-ABC123', 1, connection);
        });
    });

    describe('consultarPorCodigo', () => {
        it('lanza si no encuentra el bono', async () => {
            BonoRepository.findByCodigo.mockResolvedValue(null);
            await expect(BonoService.consultarPorCodigo('BONO-X', 1)).rejects.toThrow('Código de bono no encontrado');
        });

        it('retorna el bono encontrado', async () => {
            const bono = { codigo: 'BONO-X', saldo_actual: 100 };
            BonoRepository.findByCodigo.mockResolvedValue(bono);
            await expect(BonoService.consultarPorCodigo('bono-x', 1)).resolves.toBe(bono);
        });
    });
});
