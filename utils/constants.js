// System constants and enums
// Centralized constants for the restaurant application

// User roles
const ROLES = {
    SUPERADMIN: 'superadmin',
    ADMIN: 'admin',
    MESERO: 'mesero',
    COCINERO: 'cocinero',
    CAJERO: 'cajero'
};

// Permissions
const PERMISSIONS = {
    // Products
    PRODUCTOS_VER: 'productos.ver',
    PRODUCTOS_CREAR: 'productos.crear',
    PRODUCTOS_EDITAR: 'productos.editar',
    PRODUCTOS_ELIMINAR: 'productos.eliminar',
    PRODUCTOS_IMPORTAR: 'productos.importar',
    PRODUCTOS_PIDE_NOTA: 'productos.pide_nota',

    // Clients
    CLIENTES_VER: 'clientes.ver',
    CLIENTES_CREAR: 'clientes.crear',
    CLIENTES_EDITAR: 'clientes.editar',
    CLIENTES_ELIMINAR: 'clientes.eliminar',

    // Tables
    MESAS_VER: 'mesas.ver',
    MESAS_GESTIONAR: 'mesas.gestionar',
    MESAS_EDITAR: 'mesas.editar',
    MESAS_QR: 'mesas.qr',

    // Kitchen
    COCINA_VER: 'cocina.ver',
    COCINA_VER_TODO: 'cocina.ver_todo',
    COCINA_VER_LISTOS: 'cocina.ver_listos',
    COCINA_GESTIONAR: 'cocina.gestionar',

    // Invoices
    FACTURAS_CREAR: 'facturas.crear',
    FACTURAS_VER: 'facturas.ver',

    // Sales
    VENTAS_VER: 'ventas.ver',
    VENTAS_EXPORTAR: 'ventas.exportar',

    // Configuration
    CONFIGURACION_VER: 'configuracion.ver',
    CONFIGURACION_EDITAR: 'configuracion.editar',

    // Costeo (deshabilitado en UI; se usa inventario + recetas)
    COSTEO_VER: 'costeo.ver',
    COSTEO_EDITAR: 'costeo.editar',
    // Inventario
    INVENTARIO_VER: 'inventario.ver',
    INVENTARIO_EDITAR: 'inventario.editar',
    // Recetas (vinculadas a productos)
    RECETAS_VER: 'recetas.ver',
    RECETAS_EDITAR: 'recetas.editar',
    // Modificadores/Toppings (vinculados a productos)
    MODIFICADORES_VER: 'modificadores.ver',
    MODIFICADORES_EDITAR: 'modificadores.editar',
    // Plantillas Excel (descargas, exportaciones)
    PLANTILLAS_VER: 'plantillas.ver',

    // Users
    USUARIOS_VER: 'usuarios.ver',
    USUARIOS_GESTIONAR: 'usuarios.gestionar',

    // Perfil del Negocio
    PERFIL_VER: 'perfil.ver',
    PERFIL_EDITAR: 'perfil.editar',
    // Reportes
    REPORTE_MENSUAL_TEST: 'reporte_mensual.test',

    // POS
    POS_VER: 'pos.ver',
    POS_VENDER: 'pos.vender',
    POS_NOMBRAR_CLIENTE: 'pos.nombrar_cliente',

    // Clasificación (ranking de productos más vendidos)
    CLASIFICACION_VER: 'clasificacion.ver'
};

// Secciones para agrupar permisos en el panel (derivadas de utils/permisosCatalogo.js)
const { PERMISSION_SECTIONS } = require('./permisosCatalogo');

// Table states
const ESTADO_MESA = {
    LIBRE: 'libre',
    OCUPADA: 'ocupada',
    RESERVADA: 'reservada',
    BLOQUEADA: 'bloqueada'
};

const ESTADO_PEDIDO = {
    ABIERTO: 'abierto',
    EN_COCINA: 'en_cocina',
    PREPARANDO: 'preparando',
    LISTO: 'listo',
    SERVIDO: 'servido',
    CERRADO: 'cerrado',
    CANCELADO: 'cancelado'
};

const ESTADO_ITEM = {
    PENDIENTE: 'pendiente',
    ENVIADO: 'enviado',
    PREPARANDO: 'preparando',
    LISTO: 'listo',
    SERVIDO: 'servido',
    CANCELADO: 'cancelado'
};

// Payment methods
const FORMA_PAGO = {
    EFECTIVO: 'efectivo',
    TRANSFERENCIA: 'transferencia'
};

// Unit measures
const UNIDAD_MEDIDA = {
    KG: 'KG',
    UND: 'UND',
    LB: 'LB'
};

// JWT configuration
const JWT_CONFIG = {
    SECRET: process.env.JWT_SECRET || 'restaurante_secret_key_change_in_production',
    EXPIRES_IN: process.env.JWT_EXPIRES_IN || '24h',
    COOKIE_NAME: 'auth_token'
};

module.exports = {
    ROLES,
    PERMISSIONS,
    PERMISSION_SECTIONS,
    ESTADO_MESA,
    ESTADO_PEDIDO,
    ESTADO_ITEM,
    FORMA_PAGO,
    UNIDAD_MEDIDA,
    JWT_CONFIG
};
