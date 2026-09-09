/**
 * ModificadorService - Business logic for modifier/topping groups
 * Related to: ModificadorRepository, FacturaService, AgregarItemService
 */

const ModificadorRepository = require('../../repositories/Tenant/ModificadorRepository');
const ProductRepository = require('../../repositories/Tenant/ProductRepository');

const TIPOS_SELECCION = new Set(['unica', 'multiple']);

class ModificadorService {
    static async listGrupos(tenantId, filters = {}) {
        const grupos = await ModificadorRepository.findAllGrupos(tenantId, filters);
        return Promise.all(
            grupos.map(async g => {
                g.opciones = await ModificadorRepository.getOpciones(g.id);
                return g;
            })
        );
    }

    static async getGrupo(id, tenantId) {
        const grupo = await ModificadorRepository.findGrupoById(id, tenantId);
        if (!grupo) {
            return null;
        }
        grupo.opciones = await ModificadorRepository.getOpciones(id);
        return grupo;
    }

    static validarDatosGrupo(data) {
        if (!data.nombre?.trim()) {
            throw new Error('El nombre del grupo es requerido');
        }
        const tipoSeleccion = data.tipo_seleccion || 'unica';
        if (!TIPOS_SELECCION.has(tipoSeleccion)) {
            throw new Error('Tipo de selección inválido');
        }
        let minimo = Number.parseInt(data.minimo_selecciones, 10) || 0;
        let maximo =
            data.maximo_selecciones !== undefined && data.maximo_selecciones !== null && data.maximo_selecciones !== ''
                ? Number.parseInt(data.maximo_selecciones, 10)
                : null;

        if (tipoSeleccion === 'unica') {
            maximo = 1;
            minimo = data.obligatorio ? 1 : 0;
        } else if (maximo !== null && minimo > maximo) {
            throw new Error('El mínimo de selecciones no puede ser mayor que el máximo');
        }
        if (data.obligatorio && minimo < 1) {
            minimo = 1;
        }

        return {
            nombre: data.nombre.trim(),
            descripcion: data.descripcion ? data.descripcion.trim() : null,
            tipo_seleccion: tipoSeleccion,
            obligatorio: !!data.obligatorio,
            descuenta_inventario: !!data.descuenta_inventario,
            minimo_selecciones: minimo,
            maximo_selecciones: maximo,
            activo: data.activo
        };
    }

    static async createGrupo(tenantId, data) {
        const validado = this.validarDatosGrupo(data);
        const grupoId = await ModificadorRepository.createGrupo(tenantId, validado);
        if (data.opciones !== undefined) {
            await ModificadorRepository.setOpciones(grupoId, tenantId, data.opciones);
        }
        return grupoId;
    }

    static async updateGrupo(id, tenantId, data) {
        const grupo = await ModificadorRepository.findGrupoById(id, tenantId);
        if (!grupo) {
            throw new Error('Grupo de modificadores no encontrado');
        }
        const validado = this.validarDatosGrupo(data);
        await ModificadorRepository.updateGrupo(id, tenantId, validado);
        if (data.opciones !== undefined) {
            await ModificadorRepository.setOpciones(id, tenantId, data.opciones);
        }
        return { message: 'Grupo actualizado' };
    }

    static async deleteGrupo(id, tenantId) {
        const grupo = await ModificadorRepository.findGrupoById(id, tenantId);
        if (!grupo) {
            throw new Error('Grupo de modificadores no encontrado');
        }
        await ModificadorRepository.deleteGrupo(id, tenantId);
        return { message: 'Grupo eliminado' };
    }

    static async getGruposParaProducto(productoId, tenantId) {
        return ModificadorRepository.findGruposByProductoId(productoId, tenantId);
    }

    static async getGruposDeProducto(productoId, tenantId) {
        const rows = await ModificadorRepository.getGruposIdsDeProducto(productoId, tenantId);
        return rows.map(r => r.grupo_id);
    }

    static async setGruposDeProducto(productoId, tenantId, grupoIds) {
        const producto = await ProductRepository.findById(productoId, tenantId);
        if (!producto) {
            throw new Error('Producto no encontrado');
        }
        await ModificadorRepository.setGruposDeProducto(productoId, grupoIds || []);
        return { message: 'Grupos de modificadores actualizados' };
    }

    /**
     * Fuente de verdad del precio: recarga desde BD los grupos/opciones del producto
     * (nunca confía en nombres/precios que mande el cliente), valida las reglas de
     * cada grupo (obligatorio, mínimo/máximo) y devuelve el snapshot a persistir.
     *
     * @param {number} tenantId
     * @param {number} productoId
     * @param {Array<{grupo_id:number, opciones:number[]}>} seleccion
     * @param {{permitido?: boolean}} [opciones] - permitido=false si el usuario no tiene el
     *   permiso modificadores.ver: el producto se trata como si no tuviera grupos configurados
     *   (no se exige nada, no suma precio), en vez de rechazar la venta por un obligatorio
     *   que el usuario nunca pudo ver ni completar.
     * @returns {Promise<{precioAdicionalTotal:number, lineasSnapshot:Array, modificadoresHash:string}>}
     */
    static async validarYCalcularSeleccion(tenantId, productoId, seleccion, { permitido = true } = {}) {
        if (!permitido) {
            return { precioAdicionalTotal: 0, lineasSnapshot: [], modificadoresHash: null };
        }

        const gruposProducto = await ModificadorRepository.findGruposByProductoId(productoId, tenantId);

        if ((!seleccion || seleccion.length === 0) && gruposProducto.length === 0) {
            return { precioAdicionalTotal: 0, lineasSnapshot: [], modificadoresHash: null };
        }

        const seleccionPorGrupo = this._mapearSeleccionPorGrupo(seleccion);
        const { precioAdicionalTotal, lineasSnapshot, opcionIdsOrdenados } = this._procesarGrupos(
            gruposProducto,
            seleccionPorGrupo
        );

        this._validarGruposNoAsignados(seleccionPorGrupo, gruposProducto);

        const modificadoresHash = this._calcularModificadoresHash(opcionIdsOrdenados);

        return { precioAdicionalTotal, lineasSnapshot, modificadoresHash };
    }

    static _mapearSeleccionPorGrupo(seleccion) {
        const seleccionPorGrupo = new Map();
        for (const s of seleccion || []) {
            seleccionPorGrupo.set(
                Number.parseInt(s.grupo_id, 10),
                (s.opciones || []).map(id => Number.parseInt(id, 10))
            );
        }
        return seleccionPorGrupo;
    }

    static _procesarGrupos(gruposProducto, seleccionPorGrupo) {
        let precioAdicionalTotal = 0;
        const lineasSnapshot = [];
        const opcionIdsOrdenados = [];

        for (const grupo of gruposProducto) {
            const opcionesElegidas = seleccionPorGrupo.get(grupo.id) || [];
            this._validarReglasGrupo(grupo, opcionesElegidas.length);

            const { subtotal, lineas, opcionIds } = this._procesarOpcionesDeGrupo(grupo, opcionesElegidas);
            precioAdicionalTotal += subtotal;
            lineasSnapshot.push(...lineas);
            opcionIdsOrdenados.push(...opcionIds);
        }

        return { precioAdicionalTotal, lineasSnapshot, opcionIdsOrdenados };
    }

    static _validarReglasGrupo(grupo, cantidadElegida) {
        const minRequerido = Math.max(1, grupo.minimo_selecciones);
        if (grupo.obligatorio && cantidadElegida < minRequerido) {
            throw new Error(`Debes elegir al menos ${minRequerido} opción(es) en "${grupo.nombre}"`);
        }
        if (grupo.minimo_selecciones > 0 && cantidadElegida > 0 && cantidadElegida < grupo.minimo_selecciones) {
            throw new Error(`Debes elegir al menos ${grupo.minimo_selecciones} opción(es) en "${grupo.nombre}"`);
        }
        if (grupo.tipo_seleccion === 'unica' && cantidadElegida > 1) {
            throw new Error(`Solo puedes elegir 1 opción en "${grupo.nombre}"`);
        }

        const maximo = grupo.tipo_seleccion === 'unica' ? 1 : grupo.maximo_selecciones;
        if (maximo !== null && maximo !== undefined && cantidadElegida > maximo) {
            throw new Error(`Puedes elegir máximo ${maximo} opción(es) en "${grupo.nombre}"`);
        }
    }

    static _procesarOpcionesDeGrupo(grupo, opcionesElegidas) {
        let subtotal = 0;
        const lineas = [];
        const opcionIds = [];

        for (const opcionId of opcionesElegidas) {
            const opcion = grupo.opciones.find(o => o.id === opcionId);
            if (!opcion) {
                throw new Error(`La opción seleccionada no pertenece al grupo "${grupo.nombre}"`);
            }
            const precioAdicional = Number.parseFloat(opcion.precio_adicional) || 0;
            subtotal += precioAdicional;
            opcionIds.push(opcion.id);
            // El enlace a inventario solo cuenta si el grupo tiene el descuento activado
            // (opt-in). Así una opción con insumo_id viejo en un grupo sin el flag no
            // mueve stock por accidente.
            const ligaInventario = !!grupo.descuenta_inventario && opcion.insumo_id;
            lineas.push({
                opcion_modificador_id: opcion.id,
                grupo_nombre: grupo.nombre,
                opcion_nombre: opcion.nombre,
                precio_adicional: precioAdicional,
                cantidad: 1,
                insumo_id: ligaInventario ? opcion.insumo_id : null,
                cantidad_insumo: ligaInventario ? opcion.cantidad_insumo || null : null,
                unidad_insumo: ligaInventario ? opcion.unidad_insumo || null : null
            });
        }
        return { subtotal, lineas, opcionIds };
    }

    static _validarGruposNoAsignados(seleccionPorGrupo, gruposProducto) {
        const grupoIdsValidos = new Set(gruposProducto.map(g => g.id));
        for (const grupoId of seleccionPorGrupo.keys()) {
            if (!grupoIdsValidos.has(grupoId)) {
                throw new Error('Uno de los grupos seleccionados no está disponible para este producto');
            }
        }
    }

    static _calcularModificadoresHash(opcionIdsOrdenados) {
        if (opcionIdsOrdenados.length === 0) {
            return null;
        }
        return opcionIdsOrdenados
            .slice()
            .sort((a, b) => a - b)
            .join(',');
    }
}

module.exports = ModificadorService;
