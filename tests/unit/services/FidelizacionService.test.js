/**
 * Tests unitarios de FidelizacionService (repositorios, BD y Wallet simulados).
 */
jest.mock('../../../config/database', () => ({ getConnection: jest.fn(), query: jest.fn() }));
jest.mock('../../../repositories/Tenant/FidelizacionRepository');
jest.mock('../../../services/Shared/GoogleWalletService');
jest.mock('../../../repositories/Tenant/ClienteRepository');
jest.mock('../../../services/Tenant/TenantOwnership', () => ({
    clientes: jest.fn().mockResolvedValue(true),
    productos: jest.fn().mockResolvedValue(true)
}));
// Funciones simples (no jest.fn): resetAllMocks no las toca. Sin R2 la imagen del pase simplemente no se sube.
jest.mock('../../../services/Tenant/R2StorageService', () => ({
    publicUrl: undefined,
    uploadFile: async () => {
        throw new Error('sin R2 en tests');
    },
    deleteFile: async () => {}
}));
jest.mock('../../../repositories/Admin/TenantRepository', () => ({
    findById: async () => ({ nombre: 'Don Pepe', config: {} })
}));
jest.mock('../../../services/Tenant/FidelizacionDisenos', () => ({
    ...jest.requireActual('../../../services/Tenant/FidelizacionDisenos'),
    aPng: async () => Buffer.from('png'),
    cargarLogo: async () => null
}));

const db = require('../../../config/database');
const Repo = require('../../../repositories/Tenant/FidelizacionRepository');
const ClienteRepository = require('../../../repositories/Tenant/ClienteRepository');
const Wallet = require('../../../services/Shared/GoogleWalletService');
const FidelizacionService = require('../../../services/Tenant/FidelizacionService');

const programa = { sellos_requeridos: 3, monto_minimo: 10000, premio: 'Postre', activo: 1 };
const tarjetaBase = {
    id: 7,
    cliente_id: 5,
    estado: 'activa',
    sellos: 0,
    sellos_historicos: 0,
    premios_disponibles: 0,
    premios_canjeados: 0
};
let conn;

beforeEach(() => {
    jest.resetAllMocks();
    conn = { beginTransaction: jest.fn(), commit: jest.fn(), rollback: jest.fn(), release: jest.fn() };
    db.getConnection.mockResolvedValue(conn);
    db.query.mockResolvedValue([[{ nombre: 'La Brasa' }]]);
    Wallet.config.mockImplementation(() => {
        throw new Error('sin wallet');
    });
});

describe('guardarPrograma', () => {
    test('valida sellos entre 2 y 20', async () => {
        await expect(FidelizacionService.guardarPrograma(1, { sellos_requeridos: 1, premio: 'x' })).rejects.toThrow(
            /entre 2 y 20/
        );
        await expect(FidelizacionService.guardarPrograma(1, { sellos_requeridos: 21, premio: 'x' })).rejects.toThrow();
    });

    test('exige premio y monto no negativo', async () => {
        await expect(FidelizacionService.guardarPrograma(1, { sellos_requeridos: 8, premio: ' ' })).rejects.toThrow(
            /premio/
        );
        await expect(
            FidelizacionService.guardarPrograma(1, { sellos_requeridos: 8, premio: 'x', monto_minimo: -1 })
        ).rejects.toThrow(/negativo/);
    });

    test('guarda con valores normalizados', async () => {
        Repo.guardarPrograma.mockResolvedValue({ ok: true });
        await FidelizacionService.guardarPrograma(1, {
            sellos_requeridos: '8',
            premio: ' Postre ',
            monto_minimo: '15000'
        });
        expect(Repo.guardarPrograma).toHaveBeenCalledWith(
            1,
            expect.objectContaining({ sellosRequeridos: 8, premio: 'Postre', montoMinimo: 15000, activo: true })
        );
    });
});

describe('sello por producto: guardado', () => {
    const base = { sellos_requeridos: 8, premio: 'Postre', monto_minimo: 5000 };

    test('el modo por defecto es por monto y no guarda producto', async () => {
        Repo.guardarPrograma.mockResolvedValue({});
        await FidelizacionService.guardarPrograma(1, { ...base, producto_id: 9 });
        expect(Repo.guardarPrograma).toHaveBeenCalledWith(
            1,
            expect.objectContaining({ modoSello: 'monto', productoId: null, montoMinimo: 5000 })
        );
    });

    test('en modo producto exige elegir uno', async () => {
        await expect(FidelizacionService.guardarPrograma(1, { ...base, modo_sello: 'producto' })).rejects.toThrow(
            /producto/
        );
        expect(Repo.guardarPrograma).not.toHaveBeenCalled();
    });

    test('en modo producto valida que sea del restaurante y deja el monto en 0', async () => {
        const TenantOwnership = require('../../../services/Tenant/TenantOwnership');
        TenantOwnership.productos.mockResolvedValue(true);
        Repo.guardarPrograma.mockResolvedValue({});
        await FidelizacionService.guardarPrograma(1, { ...base, modo_sello: 'producto', producto_id: '9' });
        expect(TenantOwnership.productos).toHaveBeenCalledWith(1, [9]);
        expect(Repo.guardarPrograma).toHaveBeenCalledWith(
            1,
            expect.objectContaining({ modoSello: 'producto', productoId: 9, montoMinimo: 0 })
        );
    });

    test('rechaza un producto de otro restaurante', async () => {
        const TenantOwnership = require('../../../services/Tenant/TenantOwnership');
        TenantOwnership.productos.mockRejectedValue(new Error('Producto no válido'));
        await expect(
            FidelizacionService.guardarPrograma(1, { ...base, modo_sello: 'producto', producto_id: 99 })
        ).rejects.toThrow(/no válido/);
        expect(Repo.guardarPrograma).not.toHaveBeenCalled();
    });
});

describe('sello por producto: venta', () => {
    const porProducto = { ...programa, monto_minimo: 0, modo_sello: 'producto', producto_id: 9 };
    const venta = { tenantId: 1, facturaId: 40, clienteId: 5, total: 100 };

    test('sin producto configurado no sella', async () => {
        Repo.obtenerPrograma.mockResolvedValue({ ...porProducto, producto_id: null });
        expect((await FidelizacionService.sellarPorFactura(venta)).motivo).toBe('producto_no_configurado');
        expect(Repo.facturaTieneProducto).not.toHaveBeenCalled();
    });

    test('la venta sin el producto no sella, aunque el monto sea alto', async () => {
        Repo.obtenerPrograma.mockResolvedValue(porProducto);
        Repo.facturaTieneProducto.mockResolvedValue(false);
        const r = await FidelizacionService.sellarPorFactura({ ...venta, total: 900000 });
        expect(r).toEqual({ sellado: false, motivo: 'sin_producto' });
        expect(Repo.facturaTieneProducto).toHaveBeenCalledWith(1, 40, 9);
        expect(db.getConnection).not.toHaveBeenCalled();
    });

    test('la venta con el producto suma un sello, sin mirar el monto', async () => {
        Repo.obtenerPrograma.mockResolvedValue(porProducto);
        Repo.facturaTieneProducto.mockResolvedValue(true);
        Repo.obtenerTarjetaPorCliente.mockResolvedValue(tarjetaBase);
        Repo.registrarMovimiento.mockResolvedValue(true);
        const r = await FidelizacionService.sellarPorFactura(venta);
        expect(r).toMatchObject({ sellado: true, sellos: 1 });
    });

    test('en modo monto no consulta el detalle de la factura', async () => {
        Repo.obtenerPrograma.mockResolvedValue(programa);
        Repo.obtenerTarjetaPorCliente.mockResolvedValue(null);
        await FidelizacionService.sellarPorFactura({ ...venta, total: 20000 });
        expect(Repo.facturaTieneProducto).not.toHaveBeenCalled();
    });

    test('la regla impresa nombra el producto', () => {
        expect(FidelizacionService.textoRegla({ ...porProducto, producto_nombre: 'Café' })).toMatch(/incluya Café/);
        expect(FidelizacionService.textoRegla({ monto_minimo: 0 })).toBe('Cada compra suma un sello.');
        expect(FidelizacionService.textoRegla({ monto_minimo: 10000 })).toMatch(/desde/);
    });
});

describe('inscribir', () => {
    test('exige consentimiento', async () => {
        await expect(FidelizacionService.inscribir(1, { clienteId: 5, consentimiento: false })).rejects.toThrow(
            /autorizar/
        );
        expect(Repo.crearTarjeta).not.toHaveBeenCalled();
    });

    test('exige programa activo', async () => {
        Repo.obtenerPrograma.mockResolvedValue({ ...programa, activo: 0 });
        await expect(FidelizacionService.inscribir(1, { clienteId: 5, consentimiento: true })).rejects.toThrow(
            /activa/
        );
    });

    test('no duplica la tarjeta de un cliente', async () => {
        Repo.obtenerPrograma.mockResolvedValue(programa);
        Repo.obtenerTarjetaPorCliente.mockResolvedValue(tarjetaBase);
        const r = await FidelizacionService.inscribir(1, { clienteId: 5, consentimiento: true });
        expect(r.nueva).toBe(false);
        expect(Repo.crearTarjeta).not.toHaveBeenCalled();
    });

    test('crea la tarjeta nueva', async () => {
        Repo.obtenerPrograma.mockResolvedValue(programa);
        Repo.obtenerTarjetaPorCliente.mockResolvedValue(null);
        Repo.crearTarjeta.mockResolvedValue(7);
        Repo.obtenerTarjetaPorId.mockResolvedValue(tarjetaBase);
        const r = await FidelizacionService.inscribir(1, { clienteId: 5, consentimiento: true });
        expect(r.nueva).toBe(true);
        expect(Repo.crearTarjeta.mock.calls[0][0].numero).toMatch(/^GF\d{8}$/);
        expect(Repo.crearTarjeta.mock.calls[0][0].tokenPublico).toMatch(/^[a-f0-9]{36}$/);
    });
});

describe('sellarPorFactura', () => {
    test('ignora facturas sin cliente, programa inactivo o monto bajo', async () => {
        expect(
            (await FidelizacionService.sellarPorFactura({ tenantId: 1, facturaId: 1, clienteId: null, total: 50000 }))
                .motivo
        ).toBe('sin_cliente');
        Repo.obtenerPrograma.mockResolvedValue({ ...programa, activo: 0 });
        expect(
            (await FidelizacionService.sellarPorFactura({ tenantId: 1, facturaId: 1, clienteId: 5, total: 50000 }))
                .motivo
        ).toBe('programa_inactivo');
        Repo.obtenerPrograma.mockResolvedValue(programa);
        expect(
            (await FidelizacionService.sellarPorFactura({ tenantId: 1, facturaId: 1, clienteId: 5, total: 9999 }))
                .motivo
        ).toBe('monto_insuficiente');
    });

    test('sin tarjeta no sella ni falla', async () => {
        Repo.obtenerPrograma.mockResolvedValue(programa);
        Repo.obtenerTarjetaPorCliente.mockResolvedValue(null);
        const r = await FidelizacionService.sellarPorFactura({ tenantId: 1, facturaId: 1, clienteId: 5, total: 20000 });
        expect(r).toEqual({ sellado: false, motivo: 'sin_tarjeta' });
        expect(conn.rollback).toHaveBeenCalled();
    });

    test('suma un sello', async () => {
        Repo.obtenerPrograma.mockResolvedValue(programa);
        Repo.obtenerTarjetaPorCliente.mockResolvedValue(tarjetaBase);
        Repo.registrarMovimiento.mockResolvedValue(true);
        const r = await FidelizacionService.sellarPorFactura({ tenantId: 1, facturaId: 9, clienteId: 5, total: 20000 });
        expect(r).toMatchObject({ sellado: true, sellos: 1, premioGanado: false });
        expect(Repo.actualizarContadores).toHaveBeenCalledWith(
            conn,
            7,
            expect.objectContaining({ sellos: 1, sellosHistoricos: 1 })
        );
        expect(conn.commit).toHaveBeenCalled();
    });

    test('la misma factura no suma dos veces', async () => {
        Repo.obtenerPrograma.mockResolvedValue(programa);
        Repo.obtenerTarjetaPorCliente.mockResolvedValue(tarjetaBase);
        Repo.registrarMovimiento.mockResolvedValue(false);
        const r = await FidelizacionService.sellarPorFactura({ tenantId: 1, facturaId: 9, clienteId: 5, total: 20000 });
        expect(r.motivo).toBe('ya_sellada');
        expect(Repo.actualizarContadores).not.toHaveBeenCalled();
    });

    test('al completar reinicia sellos y suma un premio disponible', async () => {
        Repo.obtenerPrograma.mockResolvedValue(programa);
        Repo.obtenerTarjetaPorCliente.mockResolvedValue({ ...tarjetaBase, sellos: 2, sellos_historicos: 2 });
        Repo.registrarMovimiento.mockResolvedValue(true);
        const r = await FidelizacionService.sellarPorFactura({ tenantId: 1, facturaId: 9, clienteId: 5, total: 20000 });
        expect(r).toMatchObject({ sellado: true, sellos: 0, premiosDisponibles: 1, premioGanado: true });
        expect(Repo.registrarMovimiento).toHaveBeenCalledWith(conn, expect.objectContaining({ tipo: 'premio_ganado' }));
    });

    test('un error interno no se propaga (la venta ya está cobrada)', async () => {
        Repo.obtenerPrograma.mockRejectedValue(new Error('BD caída'));
        jest.spyOn(console, 'error').mockImplementation(() => {});
        const r = await FidelizacionService.sellarPorFactura({ tenantId: 1, facturaId: 9, clienteId: 5, total: 20000 });
        expect(r).toEqual({ sellado: false, motivo: 'error' });
    });
});

describe('canjear', () => {
    test('rechaza si no hay premios', async () => {
        Repo.obtenerTarjetaPorId.mockResolvedValue(tarjetaBase);
        await expect(FidelizacionService.canjear(1, 7, 3)).rejects.toThrow(/no tiene premios/);
        expect(conn.rollback).toHaveBeenCalled();
    });

    test('descuenta un premio y suma canjeados', async () => {
        Repo.obtenerTarjetaPorId.mockResolvedValue({ ...tarjetaBase, premios_disponibles: 2 });
        Repo.listarMovimientos.mockResolvedValue([]);
        await FidelizacionService.canjear(1, 7, 3);
        expect(Repo.actualizarContadores).toHaveBeenCalledWith(
            conn,
            7,
            expect.objectContaining({ premiosDisponibles: 1, premiosCanjeados: 1 })
        );
        expect(Repo.registrarMovimiento).toHaveBeenCalledWith(
            conn,
            expect.objectContaining({ tipo: 'canje', usuarioId: 3 })
        );
    });
});

describe('Wallet', () => {
    test('sin Wallet configurado no falla y lo informa', async () => {
        const r = await FidelizacionService.sincronizarWallet(1, 7);
        expect(r).toEqual({ sincronizada: false, motivo: 'wallet_no_configurado' });
    });

    test('crea el pase la primera vez y avisa al ganar premio', async () => {
        Wallet.config.mockReturnValue({});
        Repo.obtenerTarjetaPorId.mockResolvedValue({
            ...tarjetaBase,
            numero: 'GF1',
            token_publico: 't',
            cliente_nombre: 'Ana'
        });
        Repo.obtenerPrograma.mockResolvedValue(programa);
        Wallet.crearTarjeta.mockResolvedValue({ enlace: 'https://pay.google.com/x' });
        Wallet.enviarMensaje.mockResolvedValue({});
        const r = await FidelizacionService.sincronizarWallet(1, 7, { avisar: true });
        expect(r).toEqual({ sincronizada: true, enlace: 'https://pay.google.com/x' });
        expect(Wallet.enviarMensaje).toHaveBeenCalledWith(
            'GF1',
            expect.any(String),
            expect.stringContaining('Postre'),
            true
        );
        expect(Repo.marcarSincronizada).toHaveBeenCalledWith(7);
    });

    test('si ya existía en Google solo actualiza (PATCH)', async () => {
        Wallet.config.mockReturnValue({});
        Repo.obtenerTarjetaPorId.mockResolvedValue({
            ...tarjetaBase,
            numero: 'GF1',
            cliente_nombre: 'Ana',
            wallet_sincronizada_at: new Date()
        });
        Repo.obtenerPrograma.mockResolvedValue(programa);
        Wallet.actualizarTarjeta.mockResolvedValue({});
        Wallet.enlaceDeTarjeta.mockReturnValue('https://pay.google.com/y');
        const r = await FidelizacionService.sincronizarWallet(1, 7);
        expect(r.enlace).toBe('https://pay.google.com/y');
        expect(Wallet.crearTarjeta).not.toHaveBeenCalled();
    });

    test('un fallo de Wallet no lanza excepción', async () => {
        Wallet.config.mockReturnValue({});
        Repo.obtenerTarjetaPorId.mockRejectedValue(new Error('boom'));
        jest.spyOn(console, 'error').mockImplementation(() => {});
        const r = await FidelizacionService.sincronizarWallet(1, 7);
        expect(r.sincronizada).toBe(false);
    });
});

describe('vistas públicas', () => {
    test('rechaza tokens con formato inválido sin tocar la BD', async () => {
        expect(await FidelizacionService.vistaPublica('../etc')).toBeNull();
        expect(Repo.obtenerTarjetaPorToken).not.toHaveBeenCalled();
    });
});

describe('inscripción por QR', () => {
    const TOKEN = 'a'.repeat(36);
    const datos = {
        nombre: ' Ana  Gómez ',
        telefono: '+57 300 123 4567',
        email: '',
        consentimiento: true,
        ip: '1.1.1.1'
    };

    beforeEach(() => {
        Repo.obtenerProgramaPorTokenInscripcion.mockResolvedValue({ ...programa, tenant_id: 4 });
    });

    test('normaliza celulares colombianos y rechaza los inválidos', () => {
        expect(FidelizacionService._normalizarTelefono('+57 300 123 4567')).toBe('3001234567');
        expect(FidelizacionService._normalizarTelefono('300-123-4567')).toBe('3001234567');
        expect(FidelizacionService._normalizarTelefono('123')).toBeNull();
        expect(FidelizacionService._normalizarTelefono('2001234567')).toBeNull();
    });

    test('token inválido o programa inactivo no sirve', async () => {
        expect(await FidelizacionService.vistaInscripcion('xx')).toBeNull();
        Repo.obtenerProgramaPorTokenInscripcion.mockResolvedValue({ ...programa, activo: 0, tenant_id: 4 });
        expect(await FidelizacionService.vistaInscripcion(TOKEN)).toBeNull();
    });

    test('exige consentimiento, nombre, celular y correo válido', async () => {
        await expect(FidelizacionService.inscribirPorQR(TOKEN, { ...datos, consentimiento: false })).rejects.toThrow(
            /autorizar/
        );
        await expect(FidelizacionService.inscribirPorQR(TOKEN, { ...datos, nombre: 'A' })).rejects.toThrow(/nombre/);
        await expect(FidelizacionService.inscribirPorQR(TOKEN, { ...datos, telefono: '123' })).rejects.toThrow(
            /celular/
        );
        await expect(FidelizacionService.inscribirPorQR(TOKEN, { ...datos, email: 'malo' })).rejects.toThrow(/correo/);
        expect(Repo.crearTarjeta).not.toHaveBeenCalled();
    });

    test('crea cliente y tarjeta con origen qr', async () => {
        Repo.buscarClientePorTelefono.mockResolvedValue(null);
        ClienteRepository.create.mockResolvedValue({ insertId: 33 });
        Repo.crearTarjeta.mockResolvedValue(8);
        Repo.obtenerTarjetaPorId.mockResolvedValue({ ...tarjetaBase, id: 8, token_publico: 'tok' });
        const r = await FidelizacionService.inscribirPorQR(TOKEN, datos);
        expect(r).toEqual({ yaInscrito: false, token: 'tok' });
        expect(ClienteRepository.create).toHaveBeenCalledWith(
            4,
            expect.objectContaining({ nombre: 'Ana Gómez', telefono: '3001234567' })
        );
        expect(Repo.crearTarjeta).toHaveBeenCalledWith(
            expect.objectContaining({ tenantId: 4, clienteId: 33, origen: 'qr', ip: '1.1.1.1' })
        );
    });

    test('si el celular ya tiene tarjeta no revela su enlace', async () => {
        Repo.buscarClientePorTelefono.mockResolvedValue({ id: 9 });
        Repo.obtenerTarjetaPorCliente.mockResolvedValue(tarjetaBase);
        const r = await FidelizacionService.inscribirPorQR(TOKEN, datos);
        expect(r).toEqual({ yaInscrito: true });
        expect(Repo.crearTarjeta).not.toHaveBeenCalled();
    });

    test('reutiliza al cliente existente que aún no tiene tarjeta', async () => {
        Repo.buscarClientePorTelefono.mockResolvedValue({ id: 9 });
        Repo.obtenerTarjetaPorCliente.mockResolvedValue(null);
        Repo.crearTarjeta.mockResolvedValue(8);
        Repo.obtenerTarjetaPorId.mockResolvedValue({ ...tarjetaBase, id: 8, token_publico: 'tok' });
        await FidelizacionService.inscribirPorQR(TOKEN, datos);
        expect(ClienteRepository.create).not.toHaveBeenCalled();
        expect(Repo.crearTarjeta).toHaveBeenCalledWith(expect.objectContaining({ clienteId: 9 }));
    });

    test('el QR de inscripción requiere programa y guarda el token una sola vez', async () => {
        Repo.obtenerPrograma.mockResolvedValue(null);
        await expect(FidelizacionService.obtenerInscripcionQR(4)).rejects.toThrow(/programa/);
        Repo.obtenerPrograma.mockResolvedValue({ ...programa, token_inscripcion: 'b'.repeat(36) });
        const r = await FidelizacionService.obtenerInscripcionQR(4);
        expect(r.url).toContain('/tarjeta/unirse/' + 'b'.repeat(36));
        expect(r.qr).toMatch(/^data:image\/png/);
        expect(Repo.guardarTokenInscripcion).not.toHaveBeenCalled();
        await FidelizacionService.obtenerInscripcionQR(4, { regenerar: true });
        expect(Repo.guardarTokenInscripcion).toHaveBeenCalledTimes(1);
    }, 30000);
});

describe('diseño de la tarjeta', () => {
    const base = { sellos_requeridos: 8, premio: 'Postre' };

    test('rechaza un logo que no es de nuestro almacenamiento', async () => {
        await expect(
            FidelizacionService.guardarPrograma(1, { ...base, logo_url: 'https://ajeno.com/logo.png' })
        ).rejects.toThrow(/logo no es válido/);
    });

    test('rechaza un color que no es #RRGGBB', async () => {
        await expect(FidelizacionService.guardarPrograma(1, { ...base, color: 'rojo' })).rejects.toThrow(/#RRGGBB/);
    });

    test('un id de diseño desconocido se guarda como el de por defecto, con lema recortado', async () => {
        Repo.obtenerPrograma.mockResolvedValue(null);
        Repo.guardarPrograma.mockResolvedValue({});
        await FidelizacionService.guardarPrograma(1, { ...base, diseno: 'navidad', lema: `  ${'x'.repeat(80)} ` });
        expect(Repo.guardarPrograma).toHaveBeenCalledWith(
            1,
            expect.objectContaining({ diseno: 'cafe', lema: 'x'.repeat(60), mostrarLogo: true, logoUrl: null })
        );
    });
});
