const nodemailer = require('nodemailer');

// Marca Cloche (docs/branding): Tinta #0E1B2C, Coral #FF5A36, Crema #FFF4E8, Arena #F3EDE4.
const URL_BASE = () => (process.env.APP_URL || process.env.BASE_URL || 'https://gastroflow.digital').replace(/\/$/, '');

/** Envuelve el cuerpo de un correo con la cabecera (logotipo) y el pie de marca. */
function envolverConMarca(cuerpo) {
    return `
<div style="background:#f3ede4;padding:24px 12px;font-family:Poppins,Arial,sans-serif;color:#0e1b2c;">
  <div style="max-width:560px;margin:0 auto;background:#fff4e8;border-radius:14px;overflow:hidden;">
    <div style="background:#0e1b2c;padding:18px 24px;border-bottom:4px solid #ff5a36;">
      <img src="${URL_BASE()}/brand/logotipo/logotipo-horizontal-oscuro.png" alt="GastroFlow" height="40" style="display:block;height:40px;width:auto;border:0;">
    </div>
    <div style="padding:24px;line-height:1.55;">${cuerpo}</div>
    <div style="padding:14px 24px;background:#f3ede4;color:#5b6b7e;font-size:12px;text-align:center;">
      GastroFlow · Gestión de restaurantes
    </div>
  </div>
</div>`;
}

class MailerService {
    static async getTransporter() {
        console.log(
            `Buscando configuración SMTP: HOST=${process.env.SMTP_HOST}, PORT=${process.env.SMTP_PORT}, USER=${process.env.SMTP_USER}`
        );
        if (process.env.SMTP_HOST) {
            console.log('--- Usando TRANSPORE SMTP REAL ---');
            return nodemailer.createTransport({
                host: process.env.SMTP_HOST || 'smtp.gmail.com',
                port: Number(process.env.SMTP_PORT) || 587,
                secure: String(process.env.SMTP_SECURE) === 'true',
                auth: {
                    user: process.env.SMTP_USER,
                    pass: process.env.SMTP_PASS
                },
                connectionTimeout: 40000, // 40 segundos para conectar
                greetingTimeout: 30000, // 30 segundos para el saludo
                socketTimeout: 60000, // 60 segundos de lectura total
                family: 4,
                debug: false,
                logger: false,
                tls: {
                    rejectUnauthorized: false,
                    minVersion: 'TLSv1.2'
                }
            });
        }

        // Ethereal test account if no real config
        const testAccount = await nodemailer.createTestAccount();
        return nodemailer.createTransport({
            host: 'smtp.ethereal.email',
            port: 587,
            secure: false, // true for 465, false for other ports
            auth: {
                user: testAccount.user, // generated ethereal user
                pass: testAccount.pass // generated ethereal password
            }
        });
    }

    static async sendMail({ to, subject, html, attachments }) {
        console.log(`Iniciando envío de correo a: ${to}`);
        try {
            const transporter = await this.getTransporter();
            const info = await transporter.sendMail({
                from: process.env.SMTP_FROM || '"GastroFlow" <no-reply@gastroflow.digital>',
                to,
                subject,
                html: envolverConMarca(html),
                attachments
            });

            console.log(`¡Mensaje enviado! ID: ${info.messageId}`);

            if (info.messageId && !process.env.SMTP_HOST) {
                console.log('-----------------------------------------');
                console.log('¡CORREO ENVIADO EN MODO PRUEBA (ETHEREAL)!');
                console.log('URL de vista previa del correo: %s', nodemailer.getTestMessageUrl(info));
                console.log('-----------------------------------------');
                return { ok: true, previewUrl: nodemailer.getTestMessageUrl(info) };
            }
            return { ok: true };
        } catch (error) {
            console.error('Error detallado en MailerService:', error);
            throw error;
        }
    }
}
module.exports = MailerService;
