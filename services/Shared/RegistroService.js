/**
 * RegistroService - Registro público de nuevos propietarios (self-service).
 * El usuario queda pendiente de verificar su correo (activo=FALSE, rol
 * "propietario_pendiente", sin tenant) hasta que abre el link de verificación.
 * Related to: RegistroController, OnboardingService, AuthService
 */

const crypto = require('crypto');
const bcrypt = require('bcrypt');
const db = require('../../config/database');
const MailerService = require('./MailerService');
const logger = require('../../utils/logger');

const TOKEN_TTL_HORAS = 24;
const ROL_PENDIENTE = 'propietario_pendiente';

function getAppUrl() {
    return (process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, '');
}

function generarToken() {
    const token = crypto.randomBytes(32).toString('hex');
    const hash = crypto.createHash('sha256').update(token).digest('hex');
    return { token, hash };
}

class RegistroService {
    static async _getRolPendienteId() {
        const [rows] = await db.query('SELECT id FROM roles WHERE nombre = ?', [ROL_PENDIENTE]);
        if (rows.length === 0) {
            throw new Error('Rol de registro pendiente no configurado');
        }
        return rows[0].id;
    }

    /**
     * Crea el usuario pendiente de verificación y envía el correo con el link.
     * @param {{nombre_completo:string, username:string, email:string, password:string}} data
     */
    static async registrar({ nombre_completo, username, email, password }) {
        const [existentes] = await db.query('SELECT id FROM usuarios WHERE username = ? OR email = ?', [
            username,
            email
        ]);
        if (existentes.length > 0) {
            throw new Error('Ya existe una cuenta con ese usuario o correo');
        }

        const rolPendienteId = await RegistroService._getRolPendienteId();
        const password_hash = await bcrypt.hash(password, 10);
        const { token, hash } = generarToken();
        const expira = new Date(Date.now() + TOKEN_TTL_HORAS * 60 * 60 * 1000);

        const [result] = await db.query(
            `INSERT INTO usuarios
                (username, password_hash, email, nombre_completo, rol_id, tenant_id, activo,
                 verificacion_token_hash, verificacion_token_expira)
             VALUES (?, ?, ?, ?, ?, NULL, FALSE, ?, ?)`,
            [username, password_hash, email, nombre_completo, rolPendienteId, hash, expira]
        );

        await RegistroService._enviarCorreoVerificacion({ email, nombre_completo, token });

        return { id: result.insertId };
    }

    static async _enviarCorreoVerificacion({ email, nombre_completo, token }) {
        const link = `${getAppUrl()}/auth/verificar-email/${token}`;
        try {
            await MailerService.sendMail({
                to: email,
                subject: 'Confirma tu correo - GastroFlow',
                html: `
                    <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;">
                        <h2>¡Hola${nombre_completo ? ', ' + nombre_completo : ''}!</h2>
                        <p>Gracias por registrarte en GastroFlow. Confirma tu correo para activar tu cuenta y crear tu local:</p>
                        <p style="text-align:center;margin:28px 0;">
                            <a href="${link}" style="background:#ff5a36;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;">Verificar mi correo</a>
                        </p>
                        <p>O copia y pega este link en tu navegador:<br>${link}</p>
                        <p style="color:#888;font-size:12px;">Este link vence en ${TOKEN_TTL_HORAS} horas.</p>
                    </div>
                `
            });
        } catch (error) {
            logger.error('Error al enviar correo de verificación', { error: error.message, email });
        }
    }

    /**
     * Verifica el token, activa al usuario y limpia los campos de verificación.
     * @param {string} token
     * @returns {Promise<Object|null>} Usuario activado o null si el token es inválido/expiró
     */
    static async verificarEmail(token) {
        if (!token) {
            return null;
        }
        const hash = crypto.createHash('sha256').update(token).digest('hex');
        const [rows] = await db.query(
            `SELECT id, username, email, nombre_completo, rol_id, tenant_id
             FROM usuarios
             WHERE verificacion_token_hash = ? AND verificacion_token_expira > NOW() AND activo = FALSE`,
            [hash]
        );
        if (rows.length === 0) {
            return null;
        }
        const usuario = rows[0];
        await db.query(
            `UPDATE usuarios
             SET activo = TRUE, email_verificado_at = NOW(), verificacion_token_hash = NULL, verificacion_token_expira = NULL
             WHERE id = ?`,
            [usuario.id]
        );
        return usuario;
    }

    /**
     * Reenvía el correo de verificación a un usuario pendiente (por email).
     * Siempre responde sin filtrar si el correo existe o no.
     */
    static async reenviarVerificacion(email) {
        const [rows] = await db.query(
            `SELECT id, email, nombre_completo FROM usuarios
             WHERE email = ? AND activo = FALSE AND tenant_id IS NULL`,
            [email]
        );
        if (rows.length === 0) {
            return;
        }
        const usuario = rows[0];
        const { token, hash } = generarToken();
        const expira = new Date(Date.now() + TOKEN_TTL_HORAS * 60 * 60 * 1000);
        await db.query('UPDATE usuarios SET verificacion_token_hash = ?, verificacion_token_expira = ? WHERE id = ?', [
            hash,
            expira,
            usuario.id
        ]);
        await RegistroService._enviarCorreoVerificacion({
            email: usuario.email,
            nombre_completo: usuario.nombre_completo,
            token
        });
    }
}

module.exports = RegistroService;
