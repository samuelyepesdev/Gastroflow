/**
 * Catálogo único de permisos: la fuente de verdad de qué permisos existen.
 *
 * Cada entrada dice:
 *   - nombre / descripcion: lo que se guarda en la tabla `permisos`.
 *   - seccion: cómo se agrupa en el panel de superadmin.
 *   - modulo: módulo del plan que habilita el permiso (slug de `planes.caracteristicas`), o `null` si
 *     el permiso no depende del plan (se gobierna solo por rol y excepciones).
 *   - roles: roles que lo reciben por defecto SOLO cuando el permiso se crea (ver
 *     PermisosCatalogoService). Después los roles se editan a mano y el catálogo no los deshace.
 *
 * Para agregar un permiso nuevo basta con añadirlo aquí: al arrancar el servidor se crea en la BD y se
 * asigna a sus roles por defecto. Ya no hace falta una migración por permiso ni tocar otros mapas.
 * PERMISSION_TO_MODULE y PERMISSION_SECTIONS se derivan de este archivo.
 */

const TODOS = ['admin', 'cajero', 'cocinero', 'mesero', 'superadmin'];
const ADMIN = ['admin', 'superadmin'];
const CAJA = ['admin', 'cajero', 'superadmin'];
const SOLO_ADMIN = ['admin'];
const NINGUNO = [];

/** @type {Array<{seccion: string, permisos: Array<{nombre: string, descripcion: string, modulo: string|null, roles: string[]}>}>} */
const SECCIONES = [
    {
        seccion: 'Productos',
        permisos: [
            { nombre: 'productos.ver', descripcion: 'Ver productos', modulo: 'productos', roles: TODOS },
            { nombre: 'productos.crear', descripcion: 'Crear productos', modulo: 'productos', roles: ADMIN },
            { nombre: 'productos.editar', descripcion: 'Editar productos', modulo: 'productos', roles: ADMIN },
            { nombre: 'productos.eliminar', descripcion: 'Eliminar productos', modulo: 'productos', roles: ADMIN },
            {
                nombre: 'productos.importar',
                descripcion: 'Importar productos desde Excel',
                modulo: 'importar_exportar',
                roles: ADMIN
            },
            {
                nombre: 'productos.pide_nota',
                descripcion: 'Activar/desactivar "pedir nota para cocina" en cada producto',
                modulo: 'productos',
                roles: [...TODOS, 'propietario_pendiente']
            }
        ]
    },
    {
        seccion: 'Clientes',
        permisos: [
            { nombre: 'clientes.ver', descripcion: 'Ver clientes', modulo: 'clientes', roles: CAJA },
            { nombre: 'clientes.crear', descripcion: 'Crear clientes', modulo: 'clientes', roles: CAJA },
            { nombre: 'clientes.editar', descripcion: 'Editar clientes', modulo: 'clientes', roles: ADMIN },
            { nombre: 'clientes.eliminar', descripcion: 'Eliminar clientes', modulo: 'clientes', roles: ADMIN }
        ]
    },
    {
        seccion: 'Mesas',
        permisos: [
            { nombre: 'mesas.ver', descripcion: 'Ver mesas', modulo: 'mesas', roles: [...CAJA, 'mesero'] },
            {
                nombre: 'mesas.gestionar',
                descripcion: 'Gestionar mesas y pedidos',
                modulo: 'mesas',
                roles: [...ADMIN, 'mesero']
            },
            {
                nombre: 'mesas.editar',
                descripcion: 'Editar mesas (número y descripción)',
                modulo: 'mesas',
                roles: NINGUNO
            },
            {
                nombre: 'mesas.qr',
                descripcion: 'Generar e imprimir códigos QR para las mesas',
                modulo: 'mesas',
                roles: ADMIN
            },
            {
                nombre: 'mesas.eliminar',
                descripcion: 'Eliminar mesas definitivamente del sistema',
                modulo: null,
                roles: ADMIN
            },
            {
                nombre: 'mesas.facturar',
                descripcion: 'Facturar y cobrar pedidos desde Mesas (además de aplicar descuento, propina y servicio)',
                modulo: null,
                roles: [...TODOS, 'propietario_pendiente']
            }
        ]
    },
    {
        seccion: 'Cocina',
        permisos: [
            {
                nombre: 'cocina.ver',
                descripcion: 'Ver cola de cocina',
                modulo: 'cocina',
                roles: [...ADMIN, 'cocinero']
            },
            {
                nombre: 'cocina.ver_todo',
                descripcion: 'Ver toda la cola de cocina (En cocina y Listos)',
                modulo: 'cocina',
                roles: [...ADMIN, 'cocinero']
            },
            {
                nombre: 'cocina.ver_listos',
                descripcion: 'Ver solo platos listos en cocina',
                modulo: 'cocina',
                roles: [...ADMIN, 'cocinero', 'mesero']
            },
            {
                nombre: 'cocina.gestionar',
                descripcion: 'Gestionar estados de cocina',
                modulo: 'cocina',
                roles: [...ADMIN, 'cocinero']
            }
        ]
    },
    {
        seccion: 'Facturas',
        permisos: [
            { nombre: 'facturas.crear', descripcion: 'Crear facturas', modulo: 'ventas', roles: [...CAJA, 'mesero'] },
            { nombre: 'facturas.ver', descripcion: 'Ver facturas', modulo: 'ventas', roles: CAJA }
        ]
    },
    {
        seccion: 'Ventas',
        permisos: [
            { nombre: 'ventas.ver', descripcion: 'Ver ventas', modulo: 'ventas', roles: CAJA },
            {
                nombre: 'ventas.exportar',
                descripcion: 'Exportar ventas a Excel',
                modulo: 'importar_exportar',
                roles: CAJA
            }
        ]
    },
    {
        seccion: 'POS',
        permisos: [
            { nombre: 'pos.ver', descripcion: 'Ver y usar el terminal POS', modulo: 'ventas', roles: CAJA },
            { nombre: 'pos.vender', descripcion: 'Realizar ventas en el terminal POS', modulo: 'ventas', roles: CAJA },
            {
                nombre: 'pos.nombrar_cliente',
                descripcion:
                    'Facturar en el POS a nombre del cliente indicado al guardar la orden, en vez de Consumidor final',
                modulo: null,
                roles: ADMIN
            }
        ]
    },
    {
        seccion: 'Clasificación',
        permisos: [
            {
                nombre: 'clasificacion.ver',
                descripcion: 'Ver el ranking de productos más vendidos (Clasificación)',
                modulo: null,
                roles: ADMIN
            }
        ]
    },
    {
        seccion: 'Configuración',
        permisos: [
            { nombre: 'configuracion.ver', descripcion: 'Ver configuración', modulo: 'configuracion', roles: ADMIN },
            {
                nombre: 'configuracion.editar',
                descripcion: 'Editar configuración',
                modulo: 'configuracion',
                roles: ADMIN
            }
        ]
    },
    {
        seccion: 'Costeo',
        permisos: [
            { nombre: 'costeo.ver', descripcion: 'Ver costeo de platos e insumos', modulo: 'costeo', roles: ADMIN },
            {
                nombre: 'costeo.editar',
                descripcion: 'Gestionar insumos, recetas y configuración de costeo',
                modulo: 'costeo',
                roles: ADMIN
            }
        ]
    },
    {
        seccion: 'Inventario',
        permisos: [
            {
                nombre: 'inventario.ver',
                descripcion: 'Ver inventario (insumos y stock)',
                modulo: 'inventario',
                roles: ADMIN
            },
            {
                nombre: 'inventario.editar',
                descripcion: 'Gestionar insumos y movimientos de inventario',
                modulo: 'inventario',
                roles: ADMIN
            }
        ]
    },
    {
        seccion: 'Recetas',
        permisos: [
            { nombre: 'recetas.ver', descripcion: 'Ver recetas', modulo: 'recetas', roles: ADMIN },
            {
                nombre: 'recetas.editar',
                descripcion: 'Crear y editar recetas (vinculadas a productos)',
                modulo: 'recetas',
                roles: ADMIN
            }
        ]
    },
    {
        seccion: 'Modificadores',
        permisos: [
            {
                nombre: 'modificadores.ver',
                descripcion: 'Ver catálogo de grupos de modificadores/toppings',
                modulo: 'productos',
                roles: ADMIN
            },
            {
                nombre: 'modificadores.editar',
                descripcion: 'Crear, editar y eliminar grupos y opciones de modificadores',
                modulo: 'productos',
                roles: ADMIN
            }
        ]
    },
    {
        seccion: 'Usuarios',
        permisos: [
            { nombre: 'usuarios.ver', descripcion: 'Ver usuarios', modulo: 'configuracion', roles: ADMIN },
            {
                nombre: 'usuarios.gestionar',
                descripcion: 'Gestionar usuarios y roles',
                modulo: 'configuracion',
                roles: ADMIN
            }
        ]
    },
    {
        seccion: 'Plantillas',
        permisos: [
            {
                nombre: 'plantillas.ver',
                descripcion: 'Descargar plantillas Excel y exportar reportes (ventas, productos, insumos)',
                modulo: 'plantillas',
                roles: ADMIN
            }
        ]
    },
    {
        seccion: 'Eventos',
        permisos: [
            {
                nombre: 'eventos.ver',
                descripcion: 'Ver listado y detalle de eventos',
                modulo: 'eventos',
                roles: NINGUNO
            },
            { nombre: 'eventos.crear', descripcion: 'Crear eventos', modulo: 'eventos', roles: NINGUNO },
            { nombre: 'eventos.editar', descripcion: 'Editar eventos', modulo: 'eventos', roles: NINGUNO },
            { nombre: 'eventos.eliminar', descripcion: 'Eliminar eventos', modulo: 'eventos', roles: NINGUNO },
            {
                nombre: 'ventas_evento.realizar',
                descripcion: 'Realizar ventas asociadas a un evento',
                modulo: 'eventos',
                roles: NINGUNO
            }
        ]
    },
    {
        seccion: 'Analítica',
        permisos: [
            {
                nombre: 'analitica.ver',
                descripcion: 'Ver analítica y reportes avanzados',
                modulo: 'analitica',
                roles: NINGUNO
            }
        ]
    },
    {
        seccion: 'Predicción',
        permisos: [
            {
                nombre: 'prediccion.ver',
                descripcion: 'Ver predicción y modelos',
                modulo: 'prediccion_ml',
                roles: NINGUNO
            }
        ]
    },
    {
        seccion: 'Perfil',
        permisos: [
            {
                nombre: 'perfil.ver',
                descripcion: 'Ver perfil del negocio y estadísticas',
                modulo: 'configuracion',
                roles: SOLO_ADMIN
            },
            {
                nombre: 'perfil.editar',
                descripcion: 'Editar datos del negocio y cambiar paleta de colores',
                modulo: 'configuracion',
                roles: SOLO_ADMIN
            }
        ]
    },
    {
        seccion: 'Reportes',
        permisos: [
            {
                nombre: 'reporte_mensual.test',
                descripcion: 'Permite generar y enviar reportes mensuales de prueba manualmente',
                modulo: 'configuracion',
                roles: SOLO_ADMIN
            }
        ]
    },
    {
        seccion: 'Proveedores',
        permisos: [
            { nombre: 'proveedores.ver', descripcion: 'Ver lista de proveedores', modulo: 'proveedores', roles: ADMIN },
            {
                nombre: 'proveedores.editar',
                descripcion: 'Crear, editar y eliminar proveedores',
                modulo: 'proveedores',
                roles: ADMIN
            },
            {
                nombre: 'proveedores.ordenes',
                descripcion: 'Crear y recibir órdenes de compra a proveedores',
                modulo: 'proveedores',
                roles: ADMIN
            },
            {
                nombre: 'proveedores.facturas',
                descripcion: 'Gestionar facturas y documentos de proveedores',
                modulo: null,
                roles: ADMIN
            }
        ]
    },
    {
        seccion: 'Alertas',
        permisos: [
            {
                nombre: 'alertas.configurar',
                descripcion: 'Configurar alertas proactivas (stock bajo, ventas, mesas)',
                modulo: 'configuracion',
                roles: ADMIN
            }
        ]
    },
    {
        seccion: 'Caja',
        permisos: [
            {
                nombre: 'caja.ver',
                descripcion: 'Ver historial de arqueos y sesiones de caja',
                modulo: 'caja',
                roles: ADMIN
            },
            { nombre: 'caja.abrir_cerrar', descripcion: 'Abrir y cerrar turnos de caja', modulo: 'caja', roles: ADMIN },
            {
                nombre: 'caja.movimientos',
                descripcion: 'Registrar entradas y salidas manuales de efectivo',
                modulo: 'caja',
                roles: ADMIN
            }
        ]
    },
    {
        seccion: 'Servicios',
        permisos: [
            {
                nombre: 'servicios.ver',
                descripcion: 'Ver catálogo de servicios',
                modulo: 'servicios',
                roles: [...CAJA, 'mesero']
            },
            { nombre: 'servicios.crear', descripcion: 'Crear nuevos servicios', modulo: 'servicios', roles: CAJA },
            {
                nombre: 'servicios.editar',
                descripcion: 'Editar servicios existentes',
                modulo: 'servicios',
                roles: CAJA
            },
            { nombre: 'servicios.eliminar', descripcion: 'Eliminar servicios', modulo: 'servicios', roles: CAJA },
            {
                nombre: 'servicios.gestionar',
                descripcion: 'Agregar servicios a pedidos/facturas',
                modulo: null,
                roles: [...CAJA, 'mesero']
            }
        ]
    },
    {
        seccion: 'Finanzas',
        permisos: [
            { nombre: 'finanzas.ver', descripcion: 'Ver dashboard de gastos y ganancias', modulo: null, roles: ADMIN }
        ]
    },
    {
        seccion: 'Bonos',
        permisos: [
            {
                nombre: 'bonos.ver',
                descripcion: 'Ver bonos redimibles y su historial de movimientos',
                modulo: null,
                roles: ADMIN
            },
            { nombre: 'bonos.gestionar', descripcion: 'Emitir y anular bonos redimibles', modulo: null, roles: ADMIN }
        ]
    },
    {
        seccion: 'Promociones',
        permisos: [
            { nombre: 'promociones.ver', descripcion: 'Ver promociones configuradas', modulo: null, roles: ADMIN },
            {
                nombre: 'promociones.gestionar',
                descripcion: 'Crear, editar y desactivar promociones',
                modulo: null,
                roles: ADMIN
            }
        ]
    },
    {
        seccion: 'Combos',
        permisos: [
            { nombre: 'combos.ver', descripcion: 'Ver combos configurados', modulo: null, roles: ADMIN },
            { nombre: 'combos.gestionar', descripcion: 'Crear, editar y eliminar combos', modulo: null, roles: ADMIN }
        ]
    },
    {
        seccion: 'Fidelización',
        permisos: [
            {
                nombre: 'fidelizacion.ver',
                descripcion: 'Ver tarjetas de sellos y su historial',
                modulo: null,
                roles: CAJA
            },
            {
                nombre: 'fidelizacion.gestionar',
                descripcion: 'Configurar el programa, inscribir clientes y canjear premios',
                modulo: null,
                roles: CAJA
            }
        ]
    },
    {
        seccion: 'Facturación',
        permisos: [
            {
                nombre: 'facturacion.ver',
                descripcion: 'Ver estado de la suscripción y el historial de cobros',
                modulo: null,
                roles: SOLO_ADMIN
            },
            {
                nombre: 'facturacion.editar',
                descripcion: 'Actualizar el método de pago de la suscripción',
                modulo: null,
                roles: SOLO_ADMIN
            }
        ]
    },
    {
        seccion: 'Sucursales',
        permisos: [
            {
                nombre: 'sucursales.gestionar',
                descripcion: 'Crear y consultar las sucursales del restaurante',
                modulo: null,
                roles: ADMIN
            }
        ]
    }
];

/** Lista plana de permisos con su sección. */
const PERMISOS_CATALOGO = SECCIONES.flatMap(({ seccion, permisos }) => permisos.map(p => ({ ...p, seccion })));

/** { 'productos.ver': 'productos', ... } solo para los permisos que dependen de un módulo del plan. */
const PERMISSION_TO_MODULE = Object.fromEntries(PERMISOS_CATALOGO.filter(p => p.modulo).map(p => [p.nombre, p.modulo]));

/** { Productos: ['productos.ver', ...], ... } para agrupar el panel de permisos. */
const PERMISSION_SECTIONS = Object.fromEntries(
    SECCIONES.map(({ seccion, permisos }) => [seccion, permisos.map(p => p.nombre)])
);

module.exports = { PERMISOS_CATALOGO, PERMISSION_TO_MODULE, PERMISSION_SECTIONS };
