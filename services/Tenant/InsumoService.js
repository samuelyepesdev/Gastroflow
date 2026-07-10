/**
 * InsumoService - Business logic for ingredients (insumos)
 * Related to: InsumoRepository, routes/costeo.js
 */

const InsumoRepository = require('../../repositories/Tenant/InsumoRepository');
const { derivarTipoBase } = require('../../utils/unidadesCosteo');

/**
 * Normaliza rendimiento_pct a un rango válido (1-100). 100 = sin merma (default).
 */
function normalizarRendimiento(value, fallback = 100) {
    if (value === undefined || value === null || value === '') {
        return fallback;
    }
    const n = parseFloat(value);
    if (Number.isNaN(n)) {
        return fallback;
    }
    return Math.min(100, Math.max(1, n));
}

class InsumoService {
    static async list(tenantId, filters = {}) {
        return InsumoRepository.findAll(tenantId, filters);
    }

    static async getById(id, tenantId) {
        return InsumoRepository.findById(id, tenantId);
    }

    static async create(tenantId, data) {
        if (!data.codigo || !data.nombre) {
            throw new Error('Código y nombre son requeridos');
        }
        const exists = await InsumoRepository.findByCodigo(data.codigo.trim(), tenantId);
        if (exists) {
            throw new Error('Ya existe un insumo con ese código');
        }
        const unidadCompra = data.unidad_compra || 'UND';
        return InsumoRepository.create(tenantId, {
            codigo: data.codigo.trim(),
            nombre: data.nombre.trim(),
            unidad_compra: unidadCompra,
            cantidad_compra: parseFloat(data.cantidad_compra) || 1,
            precio_compra: parseFloat(data.precio_compra) || 0,
            // unidad_base se deriva de unidad_compra salvo que venga explícita (no depender de que el frontend la envíe)
            unidad_base: data.unidad_base || derivarTipoBase(unidadCompra),
            rendimiento_pct: normalizarRendimiento(data.rendimiento_pct),
            stock_minimo: data.stock_minimo !== undefined ? parseFloat(data.stock_minimo) : 0,
            categoria_id: data.categoria_id ? parseInt(data.categoria_id, 10) : null,
            unidad_medida_id: data.unidad_medida_id ? parseInt(data.unidad_medida_id, 10) : null,
            proveedor_id: data.proveedor_id ? parseInt(data.proveedor_id, 10) : null,
            precio_venta: data.precio_venta !== undefined ? parseFloat(data.precio_venta) : 0
        });
    }

    static async update(id, tenantId, data) {
        const insumo = await InsumoRepository.findById(id, tenantId);
        if (!insumo) {
            throw new Error('Insumo no encontrado');
        }
        if (data.codigo && data.codigo.trim() !== insumo.codigo) {
            const exists = await InsumoRepository.findByCodigo(data.codigo.trim(), tenantId, id);
            if (exists) {
                throw new Error('Ya existe un insumo con ese código');
            }
        }
        const unidadCompra = data.unidad_compra || insumo.unidad_compra;
        const updateData = {
            codigo: (data.codigo || insumo.codigo).trim(),
            nombre: (data.nombre || insumo.nombre).trim(),
            unidad_compra: unidadCompra,
            cantidad_compra:
                data.cantidad_compra !== undefined ? parseFloat(data.cantidad_compra) : insumo.cantidad_compra,
            precio_compra: data.precio_compra !== undefined ? parseFloat(data.precio_compra) : insumo.precio_compra,
            precio_venta: data.precio_venta !== undefined ? parseFloat(data.precio_venta) : insumo.precio_venta
        };
        if (data.unidad_base !== undefined) {
            updateData.unidad_base = data.unidad_base;
        } else if (data.unidad_compra !== undefined && data.unidad_compra !== insumo.unidad_compra) {
            // Cambió la unidad de compra sin especificar unidad_base explícita: re-derivarla.
            updateData.unidad_base = derivarTipoBase(unidadCompra);
        }
        if (data.rendimiento_pct !== undefined) {
            updateData.rendimiento_pct = normalizarRendimiento(data.rendimiento_pct, insumo.rendimiento_pct ?? 100);
        }
        if (data.stock_minimo !== undefined) {
            updateData.stock_minimo = parseFloat(data.stock_minimo);
        }
        if (data.categoria_id !== undefined) {
            updateData.categoria_id = data.categoria_id ? parseInt(data.categoria_id, 10) : null;
        }
        if (data.unidad_medida_id !== undefined) {
            updateData.unidad_medida_id = data.unidad_medida_id ? parseInt(data.unidad_medida_id, 10) : null;
        }
        if (data.proveedor_id !== undefined) {
            updateData.proveedor_id = data.proveedor_id ? parseInt(data.proveedor_id, 10) : null;
        }
        await InsumoRepository.update(id, tenantId, updateData);
        return { message: 'Insumo actualizado' };
    }

    static async delete(id, tenantId) {
        const insumo = await InsumoRepository.findById(id, tenantId);
        if (!insumo) {
            throw new Error('Insumo no encontrado');
        }
        await InsumoRepository.delete(id, tenantId);
        return { message: 'Insumo eliminado' };
    }

    /**
     * Import insumos from Excel rows. If codigo exists, update; otherwise create.
     * @param {number} tenantId
     * @param {Array<{codigo, nombre, unidad_compra?, cantidad_compra?, precio_compra?}>} rows
     * @returns {{ creados: number, actualizados: number, errores: Array<{fila: number, mensaje: string}> }}
     */
    static async importFromExcel(tenantId, rows) {
        if (!rows || rows.length === 0) {
            throw new Error('No hay registros válidos para importar');
        }
        let creados = 0;
        let actualizados = 0;
        const errores = [];
        for (let i = 0; i < rows.length; i++) {
            const fila = i + 2; // 1-based + header
            const r = rows[i];
            const codigo = r.codigo !== null && r.codigo !== undefined ? String(r.codigo).trim() : '';
            const nombre = r.nombre !== null && r.nombre !== undefined ? String(r.nombre).trim() : '';
            if (!codigo || !nombre) {
                errores.push({ fila, mensaje: 'Código y nombre son obligatorios' });
                continue;
            }
            const unidad_compra =
                (r.unidad_compra !== null && r.unidad_compra !== undefined ? String(r.unidad_compra).trim() : '') ||
                'UND';
            const cantidad_compra = parseFloat(r.cantidad_compra) || 1;
            const precio_compra = parseFloat(r.precio_compra) || 0;
            try {
                const existente = await InsumoRepository.findByCodigo(codigo, tenantId);
                if (existente) {
                    await InsumoRepository.update(existente.id, tenantId, {
                        codigo,
                        nombre,
                        unidad_compra,
                        cantidad_compra,
                        precio_compra
                    });
                    actualizados++;
                } else {
                    await InsumoRepository.create(tenantId, {
                        codigo,
                        nombre,
                        unidad_compra,
                        cantidad_compra,
                        precio_compra
                    });
                    creados++;
                }
            } catch (err) {
                errores.push({ fila, mensaje: err.message || 'Error al guardar' });
            }
        }
        return { creados, actualizados, errores };
    }
}

module.exports = InsumoService;
