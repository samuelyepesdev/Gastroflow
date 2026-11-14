/**
 * Errores de dominio con código HTTP. Reemplazan al patrón frágil `throw new Error('...')` + en el
 * controlador `if (error.message.includes('no encontrado'))`, que se rompe con solo cambiar una redacción
 * (y deja pasar como 500 errores que son del usuario).
 *
 *   throw new NotFoundError('Cliente no encontrado');
 *   throw new ValidationError('El nombre es requerido');
 *
 * El mensaje de un AppError es seguro de mostrar al usuario: el manejador de errores y `responderError` lo
 * envían tal cual. Cualquier otro error (bug, base de datos caída) sigue siendo un 500 genérico.
 */
class AppError extends Error {
    /**
     * @param {string} message - texto para el usuario
     * @param {number} [statusCode=500]
     * @param {string} [code] - identificador estable para el cliente/tests (p. ej. 'CLIENTE_NO_ENCONTRADO')
     * @param {{cause?: Error}} [opciones]
     */
    constructor(message, statusCode = 500, code = undefined, opciones = undefined) {
        super(message, opciones);
        this.name = this.constructor.name;
        this.statusCode = statusCode;
        // `status` también: parte del código existente (errorHandler, controladores) ya lee `error.status`
        this.status = statusCode;
        this.code = code;
    }
}

class ValidationError extends AppError {
    constructor(message, code = 'VALIDACION', opciones) {
        super(message, 400, code, opciones);
    }
}

class UnauthorizedError extends AppError {
    constructor(message = 'No autorizado', code = 'NO_AUTORIZADO', opciones) {
        super(message, 401, code, opciones);
    }
}

class ForbiddenError extends AppError {
    constructor(message = 'No tienes permiso para realizar esta acción', code = 'PROHIBIDO', opciones) {
        super(message, 403, code, opciones);
    }
}

class NotFoundError extends AppError {
    constructor(message = 'Recurso no encontrado', code = 'NO_ENCONTRADO', opciones) {
        super(message, 404, code, opciones);
    }
}

class ConflictError extends AppError {
    constructor(message, code = 'CONFLICTO', opciones) {
        super(message, 409, code, opciones);
    }
}

/**
 * Respuesta JSON de error para un controlador: un AppError con su código y mensaje; cualquier otra cosa,
 * un 500 con `mensajeGenerico` (el detalle interno no se filtra al cliente).
 * @returns {import('express').Response}
 */
function responderError(res, error, mensajeGenerico = 'Error interno del servidor') {
    if (error instanceof AppError && error.statusCode < 500) {
        const cuerpo = { error: error.message };
        if (error.code) {
            cuerpo.codigo = error.code;
        }
        return res.status(error.statusCode).json(cuerpo);
    }
    return res.status(500).json({ error: mensajeGenerico });
}

module.exports = {
    AppError,
    ValidationError,
    UnauthorizedError,
    ForbiddenError,
    NotFoundError,
    ConflictError,
    responderError
};
