/**
 * Validación de archivos subidos por su contenido real (magic bytes). El mimetype y el nombre que
 * manda el cliente son datos hostiles: un .html o .svg con "image/png" se serviría con su tipo
 * original desde un origen de confianza (XSS almacenado).
 */

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * @param {Buffer} buffer
 * @returns {{mime: string, ext: string, esImagen: boolean}|null} null si no es JPEG/PNG/WebP/PDF
 */
function detectarMimeReal(buffer) {
    if (!Buffer.isBuffer(buffer) || buffer.length < 12) {
        return null;
    }
    if (buffer.subarray(0, 4).toString('latin1') === '%PDF') {
        return { mime: 'application/pdf', ext: '.pdf', esImagen: false };
    }
    if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
        return { mime: 'image/jpeg', ext: '.jpg', esImagen: true };
    }
    if (buffer.subarray(0, 8).equals(PNG)) {
        return { mime: 'image/png', ext: '.png', esImagen: true };
    }
    if (buffer.subarray(0, 4).toString('latin1') === 'RIFF' && buffer.subarray(8, 12).toString('latin1') === 'WEBP') {
        return { mime: 'image/webp', ext: '.webp', esImagen: true };
    }
    return null;
}

/** Como detectarMimeReal pero lanza un error 400 si no es un tipo permitido. */
function exigirMimeReal(buffer, { soloImagenes = false } = {}) {
    const tipo = detectarMimeReal(buffer);
    if (!tipo || (soloImagenes && !tipo.esImagen)) {
        throw Object.assign(
            new Error(
                soloImagenes
                    ? 'Archivo no válido. Solo se permiten imágenes JPG, PNG o WebP.'
                    : 'Archivo no válido. Solo se permiten PDF, JPG, PNG o WebP.'
            ),
            { status: 400, codigo: 'ARCHIVO_INVALIDO' }
        );
    }
    return tipo;
}

/** Nombre apto para la cabecera Content-Disposition (sin comillas, barras ni saltos de línea). */
function nombreSeguro(nombre, porDefecto = 'archivo') {
    const limpio = String(nombre || porDefecto)
        .replace(/["\\\r\n/]/g, '_')
        .slice(0, 150);
    return limpio || porDefecto;
}

module.exports = { detectarMimeReal, exigirMimeReal, nombreSeguro };
