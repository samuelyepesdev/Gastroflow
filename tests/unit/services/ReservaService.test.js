jest.mock('../../../repositories/Tenant/ReservaRepository');
jest.mock('../../../config/database', () => ({ getConnection: jest.fn() }));

const db = require('../../../config/database');
const ReservaRepository = require('../../../repositories/Tenant/ReservaRepository');
const ReservaService = require('../../../services/Tenant/ReservaService');

const { horaAMinutos, generarFranjas, ocupacionMaxima, normalizarTelefono } = ReservaService;

// 2026-12-07 12:00 en Colombia = 17:00 UTC
const AHORA = new Date('2026-12-07T17:00:00Z');

const config = {
    tenant_id: 1,
    aforo_maximo: 10,
    duracion_min: 90,
    intervalo_min: 30,
    hora_apertura: '12:00:00',
    hora_ultima: '21:00:00',
    anticipacion_min_horas: 2,
    dias_max_adelanto: 60,
    max_personas_reserva: 8,
    auto_confirmar: 0
};

const cuerpo = {
    nombre: 'Ana Pérez',
    telefono: '300 123 4567',
    personas: 4,
    fecha: '2026-12-08',
    hora: '19:00',
    consentimiento: '1'
};

describe('ReservaService - helpers puros', () => {
    it('horaAMinutos acepta HH:MM y HH:MM:SS y rechaza lo demás', () => {
        expect(horaAMinutos('19:30')).toBe(1170);
        expect(horaAMinutos('19:30:00')).toBe(1170);
        expect(horaAMinutos('25:00')).toBeNull();
        expect(horaAMinutos('abc')).toBeNull();
    });

    it('generarFranjas va de la apertura a la última hora de inicio', () => {
        const f = generarFranjas({ hora_apertura: '12:00:00', hora_ultima: '13:30:00', intervalo_min: 30 });
        expect(f).toEqual(['12:00', '12:30', '13:00', '13:30']);
    });

    it('ocupacionMaxima suma solo reservas que se cruzan en el mismo instante', () => {
        const reservas = [
            { hora_inicio: '19:00', duracion_min: 90, personas: 4 }, // 19:00-20:30
            { hora_inicio: '20:00', duracion_min: 90, personas: 3 } // 20:00-21:30
        ];
        // Nueva 19:30-21:00 coincide con ambas entre 20:00 y 20:30 => 7
        expect(ocupacionMaxima(reservas, 19 * 60 + 30, 21 * 60)).toBe(7);
        // Nueva 20:30-22:00: la primera ya terminó (termina 20:30), solo cruza la segunda
        expect(ocupacionMaxima(reservas, 20 * 60 + 30, 22 * 60)).toBe(3);
        expect(ocupacionMaxima([], 600, 700)).toBe(0);
    });

    it('normalizarTelefono acepta 10 dígitos o con 57 y rechaza fijos', () => {
        expect(normalizarTelefono('300 123 4567')).toBe('3001234567');
        expect(normalizarTelefono('+57 300 123 4567')).toBe('3001234567');
        expect(normalizarTelefono('6012345678')).toBeNull();
    });
});

describe('ReservaService.crearPublica', () => {
    let connection;

    beforeEach(() => {
        jest.clearAllMocks();
        connection = {
            beginTransaction: jest.fn(),
            commit: jest.fn(),
            rollback: jest.fn(),
            release: jest.fn()
        };
        db.getConnection.mockResolvedValue(connection);
        ReservaRepository.getConfigPorToken.mockResolvedValue(config);
        ReservaRepository.findOcupantesDelDia.mockResolvedValue([]);
        ReservaRepository.create.mockResolvedValue(77);
    });

    it('crea la reserva pendiente, con evidencia de consentimiento y bloqueando el tenant', async () => {
        const r = await ReservaService.crearPublica('tok', cuerpo, '1.2.3.4', AHORA);
        expect(r).toEqual({ id: 77, estado: 'pendiente' });
        expect(ReservaRepository.bloquearTenant).toHaveBeenCalledWith(connection, 1);
        const datos = ReservaRepository.create.mock.calls[0][2];
        expect(datos).toMatchObject({
            telefono: '3001234567',
            fecha: '2026-12-08',
            hora_inicio: '19:00:00',
            estado: 'pendiente',
            origen: 'publica',
            consentimiento_ip: '1.2.3.4'
        });
        expect(datos.consentimiento_at).toBeInstanceOf(Date);
        expect(connection.commit).toHaveBeenCalled();
        expect(connection.release).toHaveBeenCalled();
    });

    it('con auto_confirmar nace confirmada', async () => {
        ReservaRepository.getConfigPorToken.mockResolvedValue({ ...config, auto_confirmar: 1 });
        const r = await ReservaService.crearPublica('tok', cuerpo, null, AHORA);
        expect(r.estado).toBe('confirmada');
    });

    it('rechaza sin consentimiento y no abre transacción', async () => {
        await expect(
            ReservaService.crearPublica('tok', { ...cuerpo, consentimiento: undefined }, null, AHORA)
        ).rejects.toMatchObject({
            code: 'RESERVA_SIN_CONSENTIMIENTO'
        });
        expect(db.getConnection).not.toHaveBeenCalled();
    });

    it('rechaza un enlace inexistente o desactivado', async () => {
        ReservaRepository.getConfigPorToken.mockResolvedValue(null);
        await expect(ReservaService.crearPublica('malo', cuerpo, null, AHORA)).rejects.toMatchObject({
            code: 'RESERVA_ENLACE_INVALIDO'
        });
    });

    it('rechaza más personas que el máximo por reserva', async () => {
        await expect(ReservaService.crearPublica('tok', { ...cuerpo, personas: 9 }, null, AHORA)).rejects.toMatchObject(
            {
                code: 'RESERVA_PERSONAS_INVALIDAS'
            }
        );
    });

    it('rechaza una hora que no está en las franjas ofrecidas', async () => {
        await expect(
            ReservaService.crearPublica('tok', { ...cuerpo, hora: '19:10' }, null, AHORA)
        ).rejects.toMatchObject({
            code: 'RESERVA_HORA_INVALIDA'
        });
    });

    it('rechaza fechas pasadas y más allá del adelanto máximo', async () => {
        await expect(
            ReservaService.crearPublica('tok', { ...cuerpo, fecha: '2026-12-06' }, null, AHORA)
        ).rejects.toMatchObject({
            code: 'RESERVA_FECHA_PASADA'
        });
        await expect(
            ReservaService.crearPublica('tok', { ...cuerpo, fecha: '2027-03-01' }, null, AHORA)
        ).rejects.toMatchObject({
            code: 'RESERVA_FECHA_LEJANA'
        });
    });

    it('hoy exige la anticipación mínima (son las 12:00, mínimo 14:00)', async () => {
        await expect(
            ReservaService.crearPublica('tok', { ...cuerpo, fecha: '2026-12-07', hora: '13:00' }, null, AHORA)
        ).rejects.toMatchObject({ code: 'RESERVA_MUY_PRONTO' });
        await expect(
            ReservaService.crearPublica('tok', { ...cuerpo, fecha: '2026-12-07', hora: '14:00' }, null, AHORA)
        ).resolves.toMatchObject({ id: 77 });
    });

    it('sin cupo responde 409 y revierte la transacción', async () => {
        ReservaRepository.findOcupantesDelDia.mockResolvedValue([
            { hora_inicio: '19:00', duracion_min: 90, personas: 7 }
        ]);
        await expect(ReservaService.crearPublica('tok', cuerpo, null, AHORA)).rejects.toMatchObject({
            code: 'RESERVA_SIN_CUPO',
            statusCode: 409
        });
        expect(ReservaRepository.create).not.toHaveBeenCalled();
        expect(connection.rollback).toHaveBeenCalled();
        expect(connection.release).toHaveBeenCalled();
    });
});

describe('ReservaService.crearInterna', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        const connection = { beginTransaction: jest.fn(), commit: jest.fn(), rollback: jest.fn(), release: jest.fn() };
        db.getConnection.mockResolvedValue(connection);
        ReservaRepository.asegurarConfig.mockResolvedValue(config);
        ReservaRepository.findOcupantesDelDia.mockResolvedValue([
            { hora_inicio: '19:00', duracion_min: 90, personas: 9 }
        ]);
        ReservaRepository.create.mockResolvedValue(5);
    });

    it('sin forzar respeta el aforo', async () => {
        await expect(ReservaService.crearInterna(1, cuerpo, AHORA)).rejects.toMatchObject({ code: 'RESERVA_SIN_CUPO' });
    });

    it('forzar permite pasar el aforo y nace confirmada, sin consentimiento', async () => {
        await expect(ReservaService.crearInterna(1, { ...cuerpo, forzar: true }, AHORA)).resolves.toEqual({ id: 5 });
        const datos = ReservaRepository.create.mock.calls[0][2];
        expect(datos).toMatchObject({ estado: 'confirmada', origen: 'interna', consentimiento_at: null });
    });
});

describe('ReservaService.cambiarEstado', () => {
    beforeEach(() => jest.clearAllMocks());

    it('permite pendiente -> confirmada', async () => {
        ReservaRepository.findById.mockResolvedValue({ id: 1, estado: 'pendiente' });
        await expect(ReservaService.cambiarEstado(1, 1, 'confirmada')).resolves.toEqual({
            id: 1,
            estado: 'confirmada'
        });
        expect(ReservaRepository.setEstado).toHaveBeenCalledWith(1, 1, 'confirmada');
    });

    it('bloquea salir de un estado final', async () => {
        ReservaRepository.findById.mockResolvedValue({ id: 1, estado: 'cancelada' });
        await expect(ReservaService.cambiarEstado(1, 1, 'confirmada')).rejects.toMatchObject({
            code: 'RESERVA_TRANSICION_INVALIDA'
        });
        expect(ReservaRepository.setEstado).not.toHaveBeenCalled();
    });

    it('404 si la reserva es de otro tenant o no existe', async () => {
        ReservaRepository.findById.mockResolvedValue(null);
        await expect(ReservaService.cambiarEstado(9, 1, 'confirmada')).rejects.toMatchObject({ statusCode: 404 });
    });
});

describe('ReservaService.disponibilidadPublica', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        ReservaRepository.getConfigPorToken.mockResolvedValue({
            ...config,
            hora_apertura: '12:00:00',
            hora_ultima: '13:00:00'
        });
    });

    it('marca no disponible el horario sin cupo y no expone la cantidad de cupos', async () => {
        ReservaRepository.findOcupantesDelDia.mockResolvedValue([
            { hora_inicio: '12:00', duracion_min: 90, personas: 10 }
        ]);
        const r = await ReservaService.disponibilidadPublica('tok', '2026-12-08', 2, AHORA);
        expect(r).toEqual([
            { hora: '12:00', disponible: false },
            { hora: '12:30', disponible: false },
            { hora: '13:00', disponible: false }
        ]);
    });
});
