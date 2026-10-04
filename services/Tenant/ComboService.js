/**
 * ComboService - Combos fijos a precio fijo.
 *
 * Un combo es un producto normal (precio, categoría -> estación de cocina,
 * impuesto, promociones, QR, favoritos) con es_combo = 1 y una lista fija de
 * componentes. Se vende como UNA línea; los componentes solo sirven para
 * descontar inventario al facturar (ver InventarioService.descontarPorReceta).
 */

const ComboRepository = require('../../repositories/Tenant/ComboRepository');
const ProductService = require('./ProductService');

class ComboService {
    static async listar(tenantId) {
        return ComboRepository.findAll(tenantId);
    }

    static async getDetalle(id, tenantId) {
        const combo = await ComboRepository.findById(id, tenantId);
        if (!combo) {
            throw new Error('Combo no encontrado');
        }
        const componentes = await ComboRepository.getComponentes(id, tenantId);
        return { ...combo, componentes };
    }

    /**
     * Valida y normaliza los componentes: al menos uno, sin repetir producto,
     * cantidad > 0, y solo productos simples del tenant (un combo no contiene combos).
     */
    static async _validarComponentes(tenantId, componentes) {
        const lista = Array.isArray(componentes) ? componentes : [];
        if (lista.length === 0) {
            throw new Error('El combo debe tener al menos un producto');
        }

        const porProducto = new Map();
        for (const c of lista) {
            const productoId = Number.parseInt(c?.producto_id, 10);
            const cantidad = Number.parseFloat(c?.cantidad);
            if (!productoId || !(cantidad > 0)) {
                throw new Error('Cada producto del combo necesita una cantidad mayor a 0');
            }
            porProducto.set(productoId, (porProducto.get(productoId) || 0) + cantidad);
        }

        const validos = new Set(await ComboRepository.findProductosSimples([...porProducto.keys()], tenantId));
        if (validos.size !== porProducto.size) {
            throw new Error('Algún producto del combo no existe o es otro combo');
        }

        return [...porProducto].map(([producto_id, cantidad]) => ({ producto_id, cantidad }));
    }

    static _validarDatos({ nombre, precio_unidad, categoria_id }) {
        if (!nombre || !String(nombre).trim()) {
            throw new Error('El nombre del combo es requerido');
        }
        if (!(Number.parseFloat(precio_unidad) > 0)) {
            throw new Error('El precio del combo debe ser mayor a 0');
        }
        if (!categoria_id) {
            throw new Error('La categoría es requerida (define a qué estación de cocina llega el combo)');
        }
    }

    static async crear(tenantId, data, usuarioId = null) {
        this._validarDatos(data);
        const componentes = await this._validarComponentes(tenantId, data.componentes);

        // El código es único por tenant; se crea con uno provisional y se
        // reemplaza por CMB-<id> (el id ya es único) para no depender de un contador.
        const provisional = `CMB-TMP-${Date.now()}`;
        const { id } = await ProductService.create(
            tenantId,
            {
                codigo: provisional,
                nombre: data.nombre,
                precio_unidad: data.precio_unidad,
                categoria_id: data.categoria_id,
                descripcion: data.descripcion
            },
            usuarioId
        );
        await ProductService.update(
            id,
            tenantId,
            {
                codigo: `CMB-${id}`,
                nombre: data.nombre,
                precio_unidad: data.precio_unidad,
                categoria_id: data.categoria_id,
                descripcion: data.descripcion
            },
            usuarioId
        );
        await ComboRepository.setComponentes(id, tenantId, componentes);

        return { id, message: 'Combo creado exitosamente' };
    }

    static async actualizar(id, tenantId, data, usuarioId = null) {
        const existente = await ComboRepository.findById(id, tenantId);
        if (!existente) {
            throw new Error('Combo no encontrado');
        }
        this._validarDatos(data);
        const componentes = await this._validarComponentes(tenantId, data.componentes);

        await ProductService.update(
            id,
            tenantId,
            {
                codigo: existente.codigo,
                nombre: data.nombre,
                precio_unidad: data.precio_unidad,
                categoria_id: data.categoria_id,
                descripcion: data.descripcion,
                imagen_url: existente.imagen_url,
                tributo: existente.tributo,
                tasa_impuesto: existente.tasa_impuesto
            },
            usuarioId
        );
        await ComboRepository.setComponentes(id, tenantId, componentes);

        return { id, message: 'Combo actualizado exitosamente' };
    }

    static async eliminar(id, tenantId, usuarioId = null) {
        const existente = await ComboRepository.findById(id, tenantId);
        if (!existente) {
            throw new Error('Combo no encontrado');
        }
        // Borrado lógico del producto (igual que cualquier producto): las ventas
        // históricas que lo referencian no se rompen.
        return ProductService.delete(id, tenantId, usuarioId);
    }
}

module.exports = ComboService;
