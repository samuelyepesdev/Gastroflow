const db = require('../../../../config/database');
const JobQueueRepository = require('../../../../repositories/Shared/JobQueueRepository');

class SoporteAdminController {
    static async index(req, res) {
        try {
            // Get all tickets with user and tenant details
            const [tickets] = await db.query(`
                SELECT t.*, u.nombre_completo as usuario_nombre, u.email as usuario_email, te.nombre as tenant_nombre 
                FROM soporte_tickets t
                LEFT JOIN usuarios u ON t.usuario_id = u.id
                LEFT JOIN tenants te ON t.tenant_id = te.id
                ORDER BY t.estado ASC, t.created_at DESC
            `);

            res.render('admin/soporte/index', {
                user: req.user,
                tickets,
                title: 'Soporte Técnico',
                path: '/admin/soporte'
            });
        } catch (error) {
            console.error('Error listando soporte admin:', error);
            res.status(500).render('errors/internal', { error: { message: 'Error cargando tickets de soporte' } });
        }
    }

    static async cambiarEstado(req, res) {
        try {
            const { id } = req.params;
            const { estado } = req.body;

            await db.query(
                `
                UPDATE soporte_tickets SET estado = ? WHERE id = ?
            `,
                [estado, id]
            );

            res.json({ success: true, message: 'Estado actualizado correctamente' });
        } catch (error) {
            res.status(500).json({ success: false, message: error.message });
        }
    }

    static async responder(req, res) {
        try {
            const { id } = req.params;
            const { respuesta } = req.body;

            // Save reply to database
            await db.query(
                `
                UPDATE soporte_tickets 
                SET respuesta_admin = ?, estado = 'resuelto' 
                WHERE id = ?
            `,
                [respuesta, id]
            );

            // Try to find the user's email to send the confirmation
            const [rows] = await db.query(
                `
                SELECT t.*, u.email, u.nombre_completo 
                FROM soporte_tickets t 
                JOIN usuarios u ON t.usuario_id = u.id 
                WHERE t.id = ?
            `,
                [id]
            );

            if (rows.length > 0 && rows[0].email) {
                const userEmail = rows[0].email;
                const htmlEmail = `
                    <h2>Actualización en tu caso de Soporte #${id}</h2>
                    <p>Hola ${rows[0].nombre_completo},</p>
                    <p>El administrador ha respondido a tu ticket de soporte.</p>
                    <hr>
                    <p><strong>Tu Ticket:</strong> ${rows[0].descripcion}</p>
                    <blockquote style="background: #e8f4f8; padding: 15px; border-left: 5px solid #17a2b8;">
                        <p><strong>Respuesta de Soporte:</strong></p>
                        ${respuesta}
                    </blockquote>
                    <p>El ticket ha sido marcado como "Resuelto". Si tienes más dudas puedes abrir otro ticket desde el panel.</p>
                `;

                // Encolado async (job_queue): igual que en SoporteController tenant,
                // no bloquea la respuesta al admin ni depende del tiempo de SMTP.
                try {
                    await JobQueueRepository.encolar('email_soporte', {
                        to: userEmail,
                        subject: `Respuesta de Soporte - Ticket #${id}`,
                        html: htmlEmail
                    });
                } catch (e) {
                    console.error('Error encolando email al usuario:', e);
                }
            }

            res.json({ success: true, message: 'Respuesta guardada y enviada correctamente' });
        } catch (error) {
            console.error('Error respondiendo ticket:', error);
            res.status(500).json({ success: false, message: error.message });
        }
    }
}

module.exports = SoporteAdminController;
