/**
 * ComboArmableService - Combos armables ("arma tu combo").
 *
 * Un combo tiene un precio base y una lista de grupos (pasos); cada grupo ofrece
 * opciones (productos, con recargo opcional) y exige entre `minimo` y `maximo`
 * elecciones. Un combo fijo es el caso particular de grupos con una sola opción
 * obligatoria. Pedidos, POS y QR solo llaman a `resolverSeleccion`, que valida lo
 * elegido y devuelve el precio final y el snapshot listo para guardar en la línea.
 *
 * Related to: repositories/Tenant/ComboArmableRepository.js
 */

const ComboArmableRepository = require('../../repositories/Tenant/ComboArmableRepository');

// Tasa que corresponde a cada tributo cuando el combo no trae una propia.
const TASA_POR_TRIBUTO = { iva_19: 19, iva_5: 5, impoconsumo_8: 8, exento: 0, excluido: 0 };
const TRIBUTOS = Object.keys(TASA_POR_TRIBUTO);

const esNulo = v => v === null || v === undefined;
const aCentavos = n => Math.round(Number(n) * 100);
const deCentavos = c => c / 100;

class ComboArmableService {
    static async listar(tenantId) {
        return ComboArmableRepository.findAll(tenantId);
    }

    static async getDetalle(id, tenantId) {
        const combo = await ComboArmableRepository.findById(id, tenantId);
        if (!combo) {
            throw new Error('Combo no encontrado');
        }
        const grupos = await ComboArmableRepository.getGrupos(id);
        return { ...combo, grupos };
    }

    /**
     * Catálogo para vender (Mesas, POS, QR): combos activos con sus grupos y solo las opciones
     * disponibles. Un combo al que le falta stock de opciones para cumplir algún mínimo no se
     * ofrece. `forzado` marca los grupos que el cliente no elige (ver validarSeleccion).
     */
    static async listarParaVenta(tenantId) {
        const combos = await ComboArmableRepository.findAll(tenantId);
        const grupos = await ComboArmableRepository.getGruposPorCombos(combos.map(c => c.id));

        return combos
            .map(c => ({
                id: c.id,
                nombre: c.nombre,
                descripcion: c.descripcion,
                imagen_url: c.imagen_url,
                precio_base: Number(c.precio_base),
                grupos: grupos
                    .filter(g => g.combo_id === c.id)
                    .map(g => {
                        const opciones = g.opciones
                            .filter(o => o.activo && o.producto_activo)
                            .map(o => ({
                                id: o.id,
                                producto_id: o.producto_id,
                                nombre: o.producto_nombre,
                                cantidad: Number(o.cantidad),
                                recargo: Number(o.recargo),
                                es_default: Boolean(o.es_default)
                            }));
                        return {
                            id: g.id,
                            nombre: g.nombre,
                            minimo: g.minimo,
                            maximo: g.maximo,
                            forzado: g.minimo > 0 && opciones.length <= g.minimo,
                            opciones
                        };
                    })
            }))
            .filter(c => c.grupos.length > 0 && c.grupos.every(g => g.opciones.length >= g.minimo));
    }

    // ---------------------------------------------------------------- catálogo

    static async crear(tenantId, data) {
        const datos = await this._validarDatos(tenantId, data);
        const grupos = await this._validarGrupos(tenantId, data.grupos);
        const id = await ComboArmableRepository.create(tenantId, datos, grupos);
        return { id, message: 'Combo creado exitosamente' };
    }

    static async actualizar(id, tenantId, data) {
        if (!(await ComboArmableRepository.findById(id, tenantId))) {
            throw new Error('Combo no encontrado');
        }
        const datos = await this._validarDatos(tenantId, data);
        const grupos = await this._validarGrupos(tenantId, data.grupos);
        await ComboArmableRepository.replace(id, tenantId, datos, grupos);
        return { id, message: 'Combo actualizado exitosamente' };
    }

    static async eliminar(id, tenantId) {
        if (!(await ComboArmableRepository.softDelete(id, tenantId))) {
            throw new Error('Combo no encontrado');
        }
        return { message: 'Combo eliminado exitosamente' };
    }

    static async _validarDatos(tenantId, data = {}) {
        const nombre = String(data.nombre ?? '').trim();
        if (!nombre) {
            throw new Error('El nombre del combo es requerido');
        }
        const precioBase = Number.parseFloat(data.precio_base);
        if (!(precioBase > 0)) {
            throw new Error('El precio del combo debe ser mayor a 0');
        }
        if (data.tributo && !TRIBUTOS.includes(data.tributo)) {
            throw new Error('Tributo inválido');
        }
        const estacionId = data.estacion_id ? Number.parseInt(data.estacion_id, 10) : null;
        if (estacionId && !(await ComboArmableRepository.findEstacion(estacionId, tenantId))) {
            throw new Error('La estación no existe o está inactiva');
        }
        return {
            nombre,
            descripcion: data.descripcion ? String(data.descripcion).trim() : null,
            imagen_url: data.imagen_url || null,
            precio_base: precioBase,
            tributo: data.tributo || null,
            tasa_impuesto: data.tributo
                ? !esNulo(data.tasa_impuesto) && data.tasa_impuesto !== ''
                    ? Number(data.tasa_impuesto)
                    : TASA_POR_TRIBUTO[data.tributo]
                : null,
            estacion_id: estacionId,
            orden: Number.parseInt(data.orden, 10) || 0
        };
    }

    /**
     * Normaliza la estructura: al menos un grupo, cada uno con nombre, al menos una
     * opción, mínimo <= máximo <= # de opciones, sin productos repetidos en el grupo
     * y solo productos activos del tenant.
     */
    static async _validarGrupos(tenantId, grupos) {
        const lista = Array.isArray(grupos) ? grupos : [];
        if (lista.length === 0) {
            throw new Error('El combo debe tener al menos un grupo');
        }

        const normalizados = lista.map(g => {
            const nombre = String(g?.nombre ?? '').trim();
            if (!nombre) {
                throw new Error('Cada grupo del combo necesita un nombre');
            }
            const opciones = (Array.isArray(g.opciones) ? g.opciones : []).map(o => {
                const productoId = Number.parseInt(o?.producto_id, 10);
                const cantidad = esNulo(o?.cantidad) ? 1 : Number.parseFloat(o.cantidad);
                const recargo = esNulo(o?.recargo) || o.recargo === '' ? 0 : Number.parseFloat(o.recargo);
                if (!productoId || !(cantidad > 0)) {
                    throw new Error(`Las opciones de "${nombre}" necesitan producto y cantidad mayor a 0`);
                }
                if (!(recargo >= 0)) {
                    throw new Error(`El recargo de una opción de "${nombre}" no puede ser negativo`);
                }
                return { producto_id: productoId, cantidad, recargo, es_default: Boolean(o.es_default) };
            });
            if (opciones.length === 0) {
                throw new Error(`El grupo "${nombre}" necesita al menos una opción`);
            }
            if (new Set(opciones.map(o => o.producto_id)).size !== opciones.length) {
                throw new Error(`El grupo "${nombre}" repite un producto`);
            }

            const minimo = esNulo(g.minimo) ? 1 : Number.parseInt(g.minimo, 10);
            const maximo = esNulo(g.maximo) ? Math.max(minimo, 1) : Number.parseInt(g.maximo, 10);
            if (!(minimo >= 0) || !(maximo >= 1) || minimo > maximo) {
                throw new Error(`El grupo "${nombre}" tiene un mínimo/máximo inválido`);
            }
            if (maximo > opciones.length) {
                throw new Error(`El grupo "${nombre}" permite elegir más opciones de las que ofrece`);
            }
            if (opciones.filter(o => o.es_default).length > maximo) {
                throw new Error(`El grupo "${nombre}" tiene más opciones por defecto que su máximo`);
            }
            return { nombre, minimo, maximo, opciones };
        });

        const ids = [...new Set(normalizados.flatMap(g => g.opciones.map(o => o.producto_id)))];
        const validos = new Set(await ComboArmableRepository.findProductosElegibles(ids, tenantId));
        if (validos.size !== ids.length) {
            throw new Error('Algún producto del combo no existe, está inactivo o es un combo');
        }
        return normalizados;
    }

    // ------------------------------------------------------------------- venta

    /**
     * Valida lo elegido contra la estructura y calcula el precio. Pura (sin BD):
     * `estructura` es el resultado de getDetalle.
     *
     * Un grupo "forzado" (mínimo > 0 y no ofrece más opciones que ese mínimo, como
     * los combos fijos migrados) se completa solo: la caja no tiene que enviarlo.
     *
     * @param {object} estructura combo + grupos[].opciones[]
     * @param {Array<{opcion_id:number}>} selecciones
     * @returns snapshot listo para guardar: precio_final y selecciones congeladas
     */
    static validarSeleccion(estructura, selecciones = []) {
        const elegidas = new Set();
        for (const s of Array.isArray(selecciones) ? selecciones : []) {
            const opcionId = Number.parseInt(s?.opcion_id, 10);
            if (!opcionId) {
                throw new Error('Selección inválida');
            }
            if (elegidas.has(opcionId)) {
                throw new Error('No se puede elegir la misma opción dos veces');
            }
            elegidas.add(opcionId);
        }

        const conocidas = new Set();
        const resultado = [];
        let recargosCent = 0;

        for (const grupo of estructura.grupos) {
            const activas = grupo.opciones.filter(o => o.activo && o.producto_activo);
            activas.forEach(o => conocidas.add(o.id));

            const forzado = grupo.minimo > 0 && activas.length <= grupo.minimo;
            const escogidas = forzado ? activas : activas.filter(o => elegidas.has(o.id));

            if (escogidas.length < grupo.minimo) {
                throw new Error(
                    grupo.minimo === 1
                        ? `Elige una opción en "${grupo.nombre}"`
                        : `Elige al menos ${grupo.minimo} opciones en "${grupo.nombre}"`
                );
            }
            if (escogidas.length > grupo.maximo) {
                throw new Error(`En "${grupo.nombre}" puedes elegir máximo ${grupo.maximo}`);
            }

            for (const o of escogidas) {
                recargosCent += aCentavos(o.recargo);
                resultado.push({
                    combo_opcion_id: o.id,
                    producto_id: o.producto_id,
                    grupo_nombre: grupo.nombre,
                    producto_nombre: o.producto_nombre,
                    cantidad: Number(o.cantidad),
                    recargo: Number(o.recargo)
                });
            }
        }

        for (const id of elegidas) {
            if (!conocidas.has(id)) {
                throw new Error('Una de las opciones elegidas no pertenece a este combo o no está disponible');
            }
        }

        return {
            combo_id: estructura.id,
            nombre: estructura.nombre,
            precio_base: Number(estructura.precio_base),
            recargos: deCentavos(recargosCent),
            precio_final: deCentavos(aCentavos(estructura.precio_base) + recargosCent),
            selecciones: resultado
        };
    }

    /**
     * Normaliza una línea de combo del carrito del POS contra el catálogo. El precio de lista sale
     * siempre del servidor; un precio/subtotal menor enviado por la caja se respeta como descuento
     * manual (igual que con los productos), pero nunca puede quedar por encima del catálogo.
     * @returns la línea lista para facturar: sin producto, con combo_id y `_comboSelecciones`.
     */
    static async resolverLineaVenta(tenantId, linea) {
        const cantidad = Number.parseFloat(linea.cantidad) || 1;
        const combo = await this.resolverSeleccion(linea.combo_id, tenantId, linea.selecciones);

        const precioCliente = Number.parseFloat(linea.precio);
        const precio = precioCliente >= 0 && precioCliente < combo.precio_final ? precioCliente : combo.precio_final;
        const maximo = deCentavos(Math.round(aCentavos(precio) * cantidad));
        const subtotalCliente = Number.parseFloat(linea.subtotal);
        const subtotal =
            Number.isFinite(subtotalCliente) && subtotalCliente >= 0 && subtotalCliente <= maximo
                ? deCentavos(aCentavos(subtotalCliente))
                : maximo;

        return {
            ...linea,
            combo_id: combo.combo_id,
            producto_id: null,
            es_servicio: false,
            nombre: combo.nombre,
            cantidad,
            precio,
            precio_original: combo.precio_final,
            subtotal,
            _comboSelecciones: combo.selecciones
        };
    }

    /** Carga el combo del tenant y valida la selección (punto de entrada de Mesas/POS/QR). */
    static async resolverSeleccion(comboId, tenantId, selecciones) {
        const estructura = await this.getDetalle(comboId, tenantId);
        return this.validarSeleccion(estructura, selecciones);
    }
}

module.exports = ComboArmableService;
