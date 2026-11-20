/**
 * CalculadoraRepository - Prospectos que usan la calculadora pública de pérdidas.
 * No lleva tenant_id: son personas que aún no son clientes.
 */
const db = require('../../config/database');

class CalculadoraRepository {
    static async crear(lead) {
        const [r] = await db.query(
            `INSERT INTO calculadora_leads
                (restaurante, telefono, email, entradas, perdida_mes, recuperable_mes, consentimiento_at, consentimiento_ip)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                lead.restaurante,
                lead.telefono,
                lead.email,
                JSON.stringify(lead.entradas),
                lead.perdida_mes,
                lead.recuperable_mes,
                lead.consentimiento_at,
                lead.consentimiento_ip
            ]
        );
        return r.insertId;
    }

    static async listar(limite = 300) {
        const [rows] = await db.query(
            `SELECT id, restaurante, telefono, email, entradas, perdida_mes, recuperable_mes, contactado, created_at
             FROM calculadora_leads
             ORDER BY contactado ASC, created_at DESC
             LIMIT ?`,
            [Number(limite)]
        );
        return rows;
    }

    static async setContactado(id, contactado) {
        const [r] = await db.query('UPDATE calculadora_leads SET contactado = ? WHERE id = ?', [contactado ? 1 : 0, id]);
        return r.affectedRows > 0;
    }
}

module.exports = CalculadoraRepository;
