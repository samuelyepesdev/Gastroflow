const Repo = require('../../../../repositories/Admin/AsistenteSistemaRepository');
const { textoSeguro, num } = require('../seguro');

module.exports = {
    descripcion: 'Planes de suscripción activos con sus precios por tamaño y el catálogo de add-ons con su precio.',
    parametros: { type: 'object', properties: {} },
    async preparar() {
        const { planes, addons } = await Repo.planesYAddons();
        return {
            planes: planes.map(p => ({
                nombre: textoSeguro(p.nombre),
                pequeno: num(p.precio_pequeno),
                mediano: num(p.precio_mediano),
                grande: num(p.precio_grande)
            })),
            addons: addons.map(a => ({
                slug: textoSeguro(a.slug, 40),
                nombre: textoSeguro(a.nombre),
                precio: num(a.precio)
            }))
        };
    }
};
