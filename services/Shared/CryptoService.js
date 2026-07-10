/**
 * CryptoService - Cifrado simétrico en reposo (AES-256-GCM) para credenciales
 * sensibles de integraciones externas (p. ej. credenciales Factus por tenant).
 * La clave se deriva de JWT_SECRET, que ya se valida como obligatorio y fuerte
 * al arranque (config/env.js).
 */

const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;

function getKey() {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
        throw new Error('JWT_SECRET no está configurado; no se puede cifrar/descifrar');
    }
    return crypto.createHash('sha256').update(`gastroflow-credentials:${secret}`).digest();
}

class CryptoService {
    /**
     * Cifra un texto plano. Devuelve un string "iv:authTag:ciphertext" en base64.
     * @param {string} plaintext
     * @returns {string|null}
     */
    static encrypt(plaintext) {
        if (plaintext === null || plaintext === undefined || plaintext === '') {
            return null;
        }
        const iv = crypto.randomBytes(IV_LENGTH);
        const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
        const ciphertext = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
        const authTag = cipher.getAuthTag();
        return [iv.toString('base64'), authTag.toString('base64'), ciphertext.toString('base64')].join(':');
    }

    /**
     * Descifra un valor generado por encrypt().
     * @param {string} payload
     * @returns {string|null}
     */
    static decrypt(payload) {
        if (!payload) {
            return null;
        }
        const [ivB64, authTagB64, ciphertextB64] = String(payload).split(':');
        if (!ivB64 || !authTagB64 || !ciphertextB64) {
            throw new Error('Formato de valor cifrado inválido');
        }
        const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), Buffer.from(ivB64, 'base64'));
        decipher.setAuthTag(Buffer.from(authTagB64, 'base64'));
        const plaintext = Buffer.concat([decipher.update(Buffer.from(ciphertextB64, 'base64')), decipher.final()]);
        return plaintext.toString('utf8');
    }
}

module.exports = CryptoService;
