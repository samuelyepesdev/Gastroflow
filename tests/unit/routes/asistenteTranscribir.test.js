// Los límites se leen del entorno al cargar el router: fijarlos ANTES de requerirlo.
process.env.ASISTENTE_LIMITE_TRANSCRIBIR_MIN = '2';

const express = require('express');
const request = require('supertest');

jest.mock('../../../services/Shared/AuthService', () => ({
    hasPermission: (permisos, requerido) => Array.isArray(permisos) && permisos.includes(requerido)
}));
jest.mock('../../../services/Tenant/Asistente/llm', () => ({
    asistenteConfigurado: jest.fn(() => true),
    crearTranscriptor: jest.fn()
}));
jest.mock('../../../services/Tenant/Asistente/AsistenteService', () => ({ comando: jest.fn(), confirmar: jest.fn() }));
jest.mock('../../../services/Admin/TenantAuditService', () => ({ log: jest.fn() }));
jest.mock('../../../repositories/Tenant/AsistenteRepository', () => ({ nombreAsistente: jest.fn() }));

const TenantAuditService = require('../../../services/Admin/TenantAuditService');
const { crearTranscriptor, asistenteConfigurado } = require('../../../services/Tenant/Asistente/llm');
const { LlmError } = require('../../../services/Tenant/Asistente/llm/errores');
const router = require('../../../routes/tenant/asistente');

let contador = 5000;
const identidad = () => {
    contador += 1;
    return { tenantId: contador, userId: contador };
};

function crearApp({ tenantId, userId, permisos = ['asistente.usar'], addons = ['asistente'] } = {}) {
    const app = express();
    // Igual que app.js: el JSON global convive con la ruta de audio, que lee el cuerpo crudo.
    app.use(express.json());
    app.use((req, res, next) => {
        req.user = { id: userId, permisos };
        req.tenant = { id: tenantId, addonSlugs: addons };
        res.locals.allowedByPlan = {};
        next();
    });
    app.use('/api/asistente', router);
    return app;
}

const audio = (bytes = 3000) => Buffer.alloc(bytes, 1);
const enviar = (app, cuerpo = audio(), tipo = 'audio/webm;codecs=opus') =>
    request(app).post('/api/asistente/transcribir').set('Content-Type', tipo).send(cuerpo);

describe('POST /api/asistente/transcribir', () => {
    let transcriptor;
    let errorSpy;

    beforeEach(() => {
        jest.resetAllMocks();
        errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
        asistenteConfigurado.mockReturnValue(true);
        transcriptor = { transcribir: jest.fn().mockResolvedValue('cuatro ramen para la mesa ocho') };
        crearTranscriptor.mockReturnValue(transcriptor);
        TenantAuditService.log.mockResolvedValue();
    });

    afterEach(() => errorSpy.mockRestore());

    it('transcribe el audio y devuelve el texto', async () => {
        const res = await enviar(crearApp(identidad()));

        expect(res.status).toBe(200);
        expect(res.body).toEqual({ tipo: 'transcripcion', texto: 'cuatro ramen para la mesa ocho' });
        const [{ audio: recibido, mime }] = transcriptor.transcribir.mock.calls[0];
        expect(Buffer.isBuffer(recibido)).toBe(true);
        expect(recibido.length).toBe(3000);
        expect(mime).toBe('audio/webm;codecs=opus');
    });

    it('si no se entendió nada devuelve texto vacío (el cliente dirá que no escuchó)', async () => {
        transcriptor.transcribir.mockResolvedValue('');

        const res = await enviar(crearApp(identidad()));

        expect(res.status).toBe(200);
        expect(res.body.texto).toBe('');
    });

    it('mismo control de acceso que el resto del asistente: sin add-on o sin permiso responde 403', async () => {
        const sinAddon = await enviar(crearApp({ ...identidad(), addons: [] }));
        const sinPermiso = await enviar(crearApp({ ...identidad(), permisos: [] }));

        expect(sinAddon.status).toBe(403);
        expect(sinPermiso.status).toBe(403);
        expect(transcriptor.transcribir).not.toHaveBeenCalled();
    });

    it.each([['application/json'], ['text/plain'], ['image/png'], ['application/octet-stream']])(
        'solo acepta tipos de audio: %s responde 415 sin llamar al proveedor',
        async tipo => {
            const res = await enviar(crearApp(identidad()), audio(), tipo);

            expect(res.status).toBe(415);
            expect(transcriptor.transcribir).not.toHaveBeenCalled();
        }
    );

    it.each([['audio/webm'], ['audio/ogg'], ['audio/mp4'], ['audio/mpeg'], ['audio/wav']])('acepta %s', async tipo => {
        const res = await enviar(crearApp(identidad()), audio(), tipo);

        expect(res.status).toBe(200);
    });

    it('un audio vacío o diminuto responde 400', async () => {
        const diminuto = await enviar(crearApp(identidad()), audio(10));
        const vacio = await request(crearApp(identidad()))
            .post('/api/asistente/transcribir')
            .set('Content-Type', 'audio/webm');

        expect(diminuto.status).toBe(400);
        expect(diminuto.body).toMatchObject({ tipo: 'error', codigo: 'solicitud' });
        expect(vacio.status).toBe(400);
        expect(transcriptor.transcribir).not.toHaveBeenCalled();
    });

    it('un audio de más de 1 MB responde 413 sin llegar al proveedor', async () => {
        const res = await enviar(crearApp(identidad()), audio(1024 * 1024 + 1));

        expect(res.status).toBe(413);
        expect(transcriptor.transcribir).not.toHaveBeenCalled();
    });

    it.each([
        ['limite', 429],
        ['proveedor', 502],
        ['timeout', 504],
        ['respuesta_invalida', 502],
        ['no_configurado', 503]
    ])('un error "%s" del proveedor responde %i con un mensaje seguro', async (codigo, estado) => {
        transcriptor.transcribir.mockRejectedValue(new LlmError(codigo, 'mensaje seguro'));

        const res = await enviar(crearApp(identidad()));

        expect(res.status).toBe(estado);
        expect(res.body).toMatchObject({ tipo: 'error', codigo });
        expect(typeof res.body.texto).toBe('string');
    });

    it('un error inesperado responde 500 sin detalles internos', async () => {
        transcriptor.transcribir.mockRejectedValue(new Error('SQL secreto gsk_clave'));

        const res = await enviar(crearApp(identidad()));

        expect(res.status).toBe(500);
        expect(JSON.stringify(res.body)).not.toMatch(/SQL|gsk_|secreto/);
    });

    it('deja auditoría solo con el tamaño y el resultado: ni audio ni texto transcrito', async () => {
        const id = identidad();

        await enviar(crearApp(id));

        expect(TenantAuditService.log).toHaveBeenCalledTimes(1);
        const registro = TenantAuditService.log.mock.calls[0][0];
        expect(registro).toMatchObject({ tenantId: id.tenantId, userId: id.userId, accion: 'asistente.transcribir' });
        const detalles = JSON.parse(registro.detalles);
        expect(detalles).toMatchObject({ bytes: 3000, tipo: 'transcripcion' });
        expect(registro.detalles).not.toContain('ramen');
    });

    it('limita las transcripciones por usuario y por minuto', async () => {
        const app = crearApp(identidad());

        await enviar(app);
        await enviar(app);
        const tercera = await enviar(app);

        expect(tercera.status).toBe(429);
        expect(tercera.body).toMatchObject({ tipo: 'error', codigo: 'limite' });
        expect(transcriptor.transcribir).toHaveBeenCalledTimes(2);
    });

    it('quien no tiene acceso no gasta la cuota del límite', async () => {
        const id = identidad();
        const sinAcceso = crearApp({ ...id, permisos: [] });
        await enviar(sinAcceso);
        await enviar(sinAcceso);
        await enviar(sinAcceso);

        const conAcceso = await enviar(crearApp(id));

        expect(conAcceso.status).toBe(200);
    });
});
