const Repo = require('../../../../repositories/Admin/AsistenteSistemaRepository');
const { ToolError, AclaracionError } = require('../../../Tenant/Asistente/tools/errores');
const { textoSeguro } = require('../seguro');

const MAX_RESULTADOS = 5;
const MIN_NOMBRE = 2;
const MAX_NOMBRE = 60;

module.exports = {
    descripcion:
        'Busca un restaurante por nombre (o parte del nombre) y devuelve su plan, estado, cobro, add-ons y número de usuarios.',
    parametros: {
        type: 'object',
        properties: { nombre: { type: 'string', description: 'Nombre o parte del nombre del restaurante.' } },
        required: ['nombre']
    },
    async preparar(args) {
        const nombre = typeof args?.nombre === 'string' ? args.nombre.trim() : '';
        if (nombre.length < MIN_NOMBRE || nombre.length > MAX_NOMBRE) {
            throw new AclaracionError(`Dime el nombre del restaurante (entre ${MIN_NOMBRE} y ${MAX_NOMBRE} letras).`);
        }
        const filas = await Repo.buscarRestaurantes(nombre, MAX_RESULTADOS);
        if (filas.length === 0) {
            throw new ToolError(`No encontré restaurantes que coincidan con "${textoSeguro(nombre)}".`);
        }
        return {
            restaurantes: filas.map(f => ({
                id: f.id,
                nombre: textoSeguro(f.nombre),
                plan: textoSeguro(f.plan || ''),
                activo: !!f.activo,
                aprobacion: textoSeguro(f.estado_aprobacion || ''),
                tamano: textoSeguro(f.tamano || ''),
                suspendido_por_pago: !!f.suspendido_por_pago,
                intentos_fallidos_pago: Number(f.intentos_fallidos_pago) || 0,
                proximo_cobro: f.proximo_cobro || null,
                es_sucursal: f.tenant_padre_id !== null && f.tenant_padre_id !== undefined,
                cupo_sucursales: Number(f.max_sucursales) || 0,
                usuarios: Number(f.usuarios) || 0,
                addons: f.addons ? String(f.addons).split(',') : [],
                creado: f.created_at || null
            }))
        };
    }
};
