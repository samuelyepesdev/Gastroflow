const db = require('../../../config/database');
const RealtimeEvents = require('../../Shared/RealtimeEvents');

class CrearMesasMasivasService {
    /**
     * @description Crea mesas en bloque autoincrementando sus números o prefijos de manera transaccional.
     */
    static async execute({ tenantId, cantidad, prefijo }) {
        this.validateInput(cantidad);

        const connection = await db.getConnection();
        try {
            await connection.beginTransaction();

            const [existing] = await connection.query('SELECT numero FROM mesas WHERE tenant_id = ?', [tenantId]);
            const existingNumbers = new Set(existing.map(m => m.numero));

            const startNumber = this.calculateStartNumber(existing, prefijo);
            const { created, errors } = await this.insertMesas({
                connection,
                tenantId,
                cantidad,
                prefijo,
                startNumber,
                existingNumbers
            });

            await connection.commit();
            RealtimeEvents.emitMesasChanged(tenantId);

            return {
                success: true,
                creadas: created.length,
                errores: errors.length,
                mesas: created,
                mensajes: errors,
                desde: prefijo ? `${prefijo}${startNumber}` : startNumber
            };
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }

    static validateInput(cantidad) {
        if (!cantidad || cantidad < 1 || cantidad > 100) {
            throw new Error('La cantidad debe estar entre 1 y 100');
        }
    }

    static calculateStartNumber(existing, prefijo) {
        if (!prefijo) {
            return this.getMaxNumericMesa(existing) + 1;
        }
        return this.getMaxPrefixedMesa(existing, prefijo) + 1;
    }

    static getMaxNumericMesa(existing) {
        const numbers = existing.map(m => Number.parseInt(m.numero, 10)).filter(n => !Number.isNaN(n) && n > 0);

        return numbers.length > 0 ? Math.max(...numbers) : 0;
    }

    static getMaxPrefixedMesa(existing, prefijo) {
        const prefixPattern = new RegExp(String.raw`^${prefijo}(\d+)$`);
        const numbers = existing
            .map(m => {
                const match = m.numero.match(prefixPattern);
                return match ? Number.parseInt(match[1], 10) : 0;
            })
            .filter(n => n > 0);

        return numbers.length > 0 ? Math.max(...numbers) : 0;
    }

    static async insertMesas({ connection, tenantId, cantidad, prefijo, startNumber, existingNumbers }) {
        const created = [];
        const errors = [];

        for (let i = 0; i < cantidad; i++) {
            const numeroMesa = prefijo ? `${prefijo}${startNumber + i}` : String(startNumber + i);
            await this.processSingleMesa({ connection, tenantId, numeroMesa, existingNumbers, created, errors });
        }

        return { created, errors };
    }

    static async processSingleMesa({ connection, tenantId, numeroMesa, existingNumbers, created, errors }) {
        if (existingNumbers.has(numeroMesa)) {
            errors.push(`Mesa ${numeroMesa} ya existe`);
            return;
        }

        try {
            const [result] = await connection.query(
                'INSERT INTO mesas (tenant_id, numero, descripcion, estado) VALUES (?, ?, ?, ?)',
                [tenantId, numeroMesa, null, 'libre']
            );
            created.push({ id: result.insertId, numero: numeroMesa });
            existingNumbers.add(numeroMesa);
        } catch (error) {
            if (error.code === 'ER_DUP_ENTRY') {
                errors.push(`Mesa ${numeroMesa} ya existe`);
                return;
            }
            throw error;
        }
    }
}

module.exports = CrearMesasMasivasService;
