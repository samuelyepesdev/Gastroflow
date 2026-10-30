jest.mock('../../../repositories/Tenant/BonoRepository');
jest.mock('../../../repositories/Admin/TenantRepository');

const BonoPublicoService = require('../../../services/Public/BonoPublicoService');
const BonoRepository = require('../../../repositories/Tenant/BonoRepository');
const TenantRepository = require('../../../repositories/Admin/TenantRepository');

const TOKEN = 'AbCdEfGhIjKlMnOp';

const bonoBase = (extra = {}) => ({
    tenant_id: 2,
    codigo: 'BONO-ABC123',
    valor_inicial: '50000.00',
    saldo_actual: '30000.00',
    estado: 'activo',
    fecha_vencimiento: null,
    destinatario: 'Ana',
    remitente: 'Luis',
    mensaje: 'Feliz cumpleaños',
    // Campos internos que NUNCA deben llegar a la página pública:
    nota: 'pagó Luis en efectivo',
    cliente_id: 99,
    usuario_creador_id: 4,
    ...extra
});

const tenantBase = (extra = {}) => ({
    id: 2,
    nombre: 'Mi Restaurante',
    logo_src: null,
    direccion: 'Calle 1 # 2-3',
    ciudad: 'Cali',
    telefono: '3001234567',
    config: { colores: { primary: '#ff5500' } },
    ...extra
});

describe('BonoPublicoService.getVista', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('devuelve null para tokens con formato inválido sin consultar la BD', async () => {
        await expect(BonoPublicoService.getVista('corto')).resolves.toBeNull();
        await expect(BonoPublicoService.getVista('../../etc/passwd')).resolves.toBeNull();
        await expect(BonoPublicoService.getVista(undefined)).resolves.toBeNull();
        expect(BonoRepository.findByTokenPublico).not.toHaveBeenCalled();
    });

    it('devuelve null si el token no existe (mismo resultado que inválido)', async () => {
        BonoRepository.findByTokenPublico.mockResolvedValue(null);
        await expect(BonoPublicoService.getVista(TOKEN)).resolves.toBeNull();
    });

    it('expone saldo, vigencia y contacto del negocio, pero no datos internos', async () => {
        BonoRepository.findByTokenPublico.mockResolvedValue(bonoBase());
        TenantRepository.findById.mockResolvedValue(tenantBase());

        const vista = await BonoPublicoService.getVista(TOKEN);

        expect(vista.bono).toEqual(
            expect.objectContaining({
                codigo: 'BONO-ABC123',
                saldo_actual: 30000,
                valor_inicial: 50000,
                estado: 'activo',
                usable: true
            })
        );
        expect(vista.negocio).toEqual(
            expect.objectContaining({ nombre: 'Mi Restaurante', telefono: '3001234567', color: '#ff5500' })
        );
        const serializado = JSON.stringify(vista);
        expect(serializado).not.toContain('pagó Luis');
        expect(serializado).not.toContain('cliente_id');
    });

    it('marca como vencido un bono activo cuya fecha ya pasó', async () => {
        BonoRepository.findByTokenPublico.mockResolvedValue(bonoBase({ fecha_vencimiento: '2000-01-01' }));
        TenantRepository.findById.mockResolvedValue(tenantBase());

        const { bono } = await BonoPublicoService.getVista(TOKEN);

        expect(bono.estado).toBe('vencido');
        expect(bono.usable).toBe(false);
    });

    it('un bono anulado o agotado no es utilizable', async () => {
        TenantRepository.findById.mockResolvedValue(tenantBase());
        for (const estado of ['anulado', 'agotado']) {
            BonoRepository.findByTokenPublico.mockResolvedValue(bonoBase({ estado }));
            const { bono } = await BonoPublicoService.getVista(TOKEN);
            expect(bono.usable).toBe(false);
        }
    });

    it('descarta un color de negocio que no sea un hex válido (se inserta en un <style>)', async () => {
        BonoRepository.findByTokenPublico.mockResolvedValue(bonoBase());
        TenantRepository.findById.mockResolvedValue(
            tenantBase({ config: { colores: { primary: 'red;}</style><script>alert(1)</script>' } } })
        );

        const { negocio } = await BonoPublicoService.getVista(TOKEN);

        expect(negocio.color).toBe('#ff5a36');
    });

    it('devuelve null si el tenant del bono ya no existe', async () => {
        BonoRepository.findByTokenPublico.mockResolvedValue(bonoBase());
        TenantRepository.findById.mockResolvedValue(null);
        await expect(BonoPublicoService.getVista(TOKEN)).resolves.toBeNull();
    });
});
