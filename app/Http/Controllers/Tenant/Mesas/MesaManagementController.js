const db = require('../../../../config/database');
const CrearMesasMasivasService = require('../../../../services/Tenant/Mesas/CrearMesasMasivasService');

class MesaManagementController {
    // POST /mesas/crear
    static async store(req, res) {
        try {
            const tenantId = req.tenant?.id;
            if (!tenantId) return res.status(403).json({ error: 'Contexto de tenant no disponible' });

            const { numero, descripcion } = req.body || {};
            if (!numero) return res.status(400).json({ error: 'El número de mesa es requerido' });
            if (!descripcion || !String(descripcion).trim()) return res.status(400).json({ error: 'La descripción es requerida' });

            const [result] = await db.query(
                'INSERT INTO mesas (tenant_id, numero, descripcion, estado) VALUES (?, ?, ?, ?)',
                [tenantId, String(numero), String(descripcion).trim(), 'libre']
            );
            res.status(201).json({ id: result.insertId });
        } catch (error) {
            console.error('Error al crear mesa:', error);
            if (error.code === 'ER_DUP_ENTRY') return res.status(400).json({ error: 'Ya existe una mesa con ese número' });
            res.status(500).json({ error: 'Error al crear mesa' });
        }
    }

    // PUT /mesas/:mesaId
    static async update(req, res) {
        try {
            const tenantId = req.tenant?.id;
            if (!tenantId) return res.status(403).json({ error: 'Contexto de tenant no disponible' });
            const { mesaId } = req.params;
            const { numero, descripcion } = req.body || {};

            const [rows] = await db.query('SELECT id FROM mesas WHERE id = ? AND tenant_id = ?', [mesaId, tenantId]);
            if (rows.length === 0) return res.status(404).json({ error: 'Mesa no encontrada' });

            const updates = [];
            const values = [];
            if (numero !== undefined) { updates.push('numero = ?'); values.push(String(numero).trim()); }
            if (descripcion !== undefined) { updates.push('descripcion = ?'); values.push(String(descripcion).trim()); }
            
            if (updates.length === 0) return res.status(400).json({ error: 'Indique datos a actualizar' });
            values.push(mesaId, tenantId);

            await db.query(`UPDATE mesas SET ${updates.join(', ')} WHERE id = ? AND tenant_id = ?`, values);
            res.json({ message: 'Mesa actualizada' });
        } catch (error) {
            console.error('Error al actualizar mesa:', error);
            if (error.code === 'ER_DUP_ENTRY') return res.status(400).json({ error: 'Ya existe una mesa con ese número' });
            res.status(500).json({ error: 'Error al actualizar mesa' });
        }
    }

    // POST /mesas/crear-masivas
    static async storeMasivas(req, res) {
        try {
            const tenantId = req.tenant?.id;
            const { cantidad, prefijo } = req.body || {};
            const resultado = await CrearMesasMasivasService.execute({ tenantId, cantidad, prefijo });
            return res.status(201).json(resultado);
        } catch (error) {
            return res.status(400).json({ error: error.message });
        }
    }

    // DELETE /mesas/:mesaId
    static async destroy(req, res) {
        try {
            const tenantId = req.tenant?.id;
            const { mesaId } = req.params;

            const [pedidos] = await db.query(
                `SELECT id FROM pedidos WHERE mesa_id = ? AND estado NOT IN ('cerrado', 'cancelado') LIMIT 1`,
                [mesaId]
            );
            if (pedidos.length > 0) return res.status(400).json({ error: 'Mesa con pedido activo' });

            const [result] = await db.query('DELETE FROM mesas WHERE id = ? AND tenant_id = ?', [mesaId, tenantId]);
            if (result.affectedRows === 0) return res.status(404).json({ error: 'Mesa no encontrada' });

            res.json({ success: true, message: 'Mesa eliminada' });
        } catch (error) {
            res.status(500).json({ error: 'Error al eliminar mesa' });
        }
    }
}

module.exports = MesaManagementController;
