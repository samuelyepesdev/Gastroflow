const SyncService = require('../../../../services/Tenant/SyncService');

class SyncController {
    // GET /sync/pull?since=<ISO timestamp opcional>
    static async pull(req, res) {
        try {
            const tenantId = req.tenant?.id;
            if (!tenantId) {
                return res.status(403).json({ error: 'Contexto de tenant no disponible' });
            }
            const since = req.query.since || null;
            const data = await SyncService.pull(tenantId, since);
            res.json(data);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    // POST /sync/push - body: [{ clientUuid, action, params }, ...]
    static async push(req, res) {
        try {
            const tenantId = req.tenant?.id;
            if (!tenantId) {
                return res.status(403).json({ error: 'Contexto de tenant no disponible' });
            }
            const operations = Array.isArray(req.body) ? req.body : [];
            const results = await SyncService.push(tenantId, operations);
            res.json({ results });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }
}

module.exports = SyncController;
