/**
 * Catálogo de los enlaces de la barra de navegación que un usuario puede ocultar ("Personalizar menú").
 *
 * Ocultar es SOLO visual: el permiso, el plan y las rutas no cambian, y el enlace sigue funcionando si se entra
 * por su dirección. Cada `clave` es la misma de `nav.can` (middleware/navbarLocals.js), que a su vez decide si el
 * usuario puede ver el módulo. Quedan fuera a propósito Configuración y el menú del usuario, para que nadie pierda
 * el acceso a cómo restablecer su menú.
 *
 * Varias claves cubren más de un enlace visible: `cocina` incluye «Estaciones de Cocina» y `proveedores`
 * incluye «Órdenes de Compra» (así lo evalúa la barra).
 */

const GRUPOS = [
    {
        titulo: 'Operación',
        items: [
            { clave: 'dashboard', etiqueta: 'Dashboard', icono: 'bi-speedometer2' },
            { clave: 'mesas', etiqueta: 'Mesas', icono: 'bi-grid-3x3-gap' },
            { clave: 'reservas', etiqueta: 'Reservas', icono: 'bi-calendar2-check' },
            { clave: 'pos', etiqueta: 'POS', icono: 'bi-lightning-charge' },
            { clave: 'ventas', etiqueta: 'Ventas', icono: 'bi-receipt' },
            { clave: 'caja', etiqueta: 'Caja', icono: 'bi-wallet2' },
            { clave: 'cocina', etiqueta: 'Cocina y estaciones', icono: 'bi-fire' }
        ]
    },
    {
        titulo: 'Comercial y gestión',
        items: [
            { clave: 'finanzas', etiqueta: 'Finanzas', icono: 'bi-pie-chart' },
            { clave: 'bonos', etiqueta: 'Bonos', icono: 'bi-gift' },
            { clave: 'fidelizacion', etiqueta: 'Fidelización', icono: 'bi-stars' },
            { clave: 'sucursales', etiqueta: 'Sucursales', icono: 'bi-diagram-3' },
            { clave: 'promociones', etiqueta: 'Promociones', icono: 'bi-percent' },
            { clave: 'combos', etiqueta: 'Combos', icono: 'bi-box-seam' },
            { clave: 'temporada', etiqueta: 'Temporada', icono: 'bi-snow2' },
            { clave: 'resenas', etiqueta: 'Reseñas', icono: 'bi-star-half' }
        ]
    },
    {
        titulo: 'Catálogo y clientes',
        items: [
            { clave: 'productos', etiqueta: 'Productos', icono: 'bi-box-seam' },
            { clave: 'clientes', etiqueta: 'Clientes', icono: 'bi-people' },
            { clave: 'inventario', etiqueta: 'Inventario', icono: 'bi-boxes' }
        ]
    },
    {
        titulo: 'Más',
        items: [
            { clave: 'recetas', etiqueta: 'Recetas', icono: 'bi-journal-text' },
            { clave: 'modificadores', etiqueta: 'Modificadores', icono: 'bi-list-check' },
            { clave: 'proveedores', etiqueta: 'Proveedores y órdenes de compra', icono: 'bi-truck' },
            { clave: 'servicios', etiqueta: 'Servicios', icono: 'bi-gear-wide-connected' },
            { clave: 'eventos', etiqueta: 'Eventos', icono: 'bi-calendar-event' },
            { clave: 'analitica', etiqueta: 'Analítica', icono: 'bi-graph-up-arrow' },
            { clave: 'clasificacion', etiqueta: 'Clasificación', icono: 'bi-trophy' }
        ]
    }
];

const CLAVES = new Set(GRUPOS.flatMap(g => g.items.map(i => i.clave)));
const MAX_OCULTOS = CLAVES.size;

/** Lista de claves válidas, sin repetir, a partir de un array o de su JSON. Lo desconocido se ignora. */
function normalizarOcultos(valor) {
    let lista = valor;
    if (typeof lista === 'string') {
        try {
            lista = JSON.parse(lista);
        } catch {
            return [];
        }
    }
    if (!Array.isArray(lista)) {
        return [];
    }
    return [...new Set(lista.filter(c => typeof c === 'string' && CLAVES.has(c)))].slice(0, MAX_OCULTOS);
}

/** Copia de `can` con los enlaces ocultos en false. `can` original (permisos reales) no se toca. */
function menuVisible(can, ocultos) {
    const visible = { ...can };
    for (const clave of ocultos || []) {
        if (CLAVES.has(clave)) {
            visible[clave] = false;
        }
    }
    return visible;
}

/** ¿Hay algo que mostrar en el desplegable «Más»? (misma regla que la barra, sobre el menú ya filtrado) */
function hayMas(c) {
    return !!(
        c.recetas ||
        c.modificadores ||
        c.eventos ||
        c.analitica ||
        c.proveedores ||
        c.servicios ||
        c.clasificacion ||
        c.cocina
    );
}

/**
 * Lo que ve el usuario en «Personalizar menú»: solo los enlaces a los que TIENE acceso (según `can`), con la
 * marca de si hoy están ocultos. Los grupos sin ningún enlace disponible no aparecen.
 */
function catalogoParaUsuario(can, ocultos) {
    const set = new Set(ocultos || []);
    return GRUPOS.map(g => ({
        titulo: g.titulo,
        items: g.items.filter(i => can[i.clave]).map(i => ({ ...i, oculto: set.has(i.clave) }))
    })).filter(g => g.items.length > 0);
}

module.exports = { GRUPOS, CLAVES, normalizarOcultos, menuVisible, hayMas, catalogoParaUsuario };
