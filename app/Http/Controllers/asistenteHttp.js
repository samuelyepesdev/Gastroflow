// Código de error del servicio -> estado HTTP. Lo no listado es un fallo interno.
const ESTADOS = {
    sesion: 401,
    permisos: 403,
    solicitud: 400,
    formato: 415,
    confirmacion_invalida: 400,
    ejecucion: 400,
    iteraciones: 422,
    limite: 429,
    no_configurado: 503,
    timeout: 504,
    proveedor: 502,
    respuesta_invalida: 502,
    interno: 500
};

/** Solo lo que el cliente necesita: sin `meta` (auditoría interna). */
function responder(res, r) {
    const cuerpo = { tipo: r.tipo, texto: r.texto };
    if (r.confirmationId) {
        cuerpo.confirmationId = r.confirmationId;
        cuerpo.expiraEnSegundos = r.expiraEnSegundos;
    }
    if (r.tipo === 'error') {
        cuerpo.codigo = r.codigo;
        return res.status(ESTADOS[r.codigo] ?? 500).json(cuerpo);
    }
    return res.status(200).json(cuerpo);
}

function falloInterno(res, e) {
    // eslint-disable-next-line no-console
    console.error('[asistente] error en el controlador:', e?.name, e?.message);
    return res.status(500).json({ tipo: 'error', codigo: 'interno', texto: 'No pude procesar tu comando.' });
}

module.exports = { ESTADOS, responder, falloInterno };
