/**
 * Product Routes - Refactored to use Controllers
 * Handles HTTP requests/responses for products
 */

const express = require('express');
const router = express.Router();
const ProductosController = require('../../app/Http/Controllers/Tenant/ProductosController');
const { requirePermission } = require('../../middleware/auth');
const { requirePlanFeature } = require('../../middleware/planFeature');
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
const BaseRequest = require('../../app/Http/Requests/BaseRequest');
const StoreProductoRequest = require('../../app/Http/Requests/Tenant/StoreProductoRequest');

// GET /productos - Show products page (solo del tenant)
router.get('/', requirePermission('productos.ver'), ProductosController.index);

// GET /productos/categorias - Get all categories (del tenant)
router.get('/categorias', ProductosController.getCategorias);

// GET /productos/buscar - Search products (del tenant)
router.get('/buscar', ProductosController.search);

// GET /productos/:id - Get product by ID (del tenant)
router.get('/:id(\\d+)', ProductosController.show);

// POST /productos - Create new product (del tenant)
router.post(
    '/',
    requirePermission('productos.crear'),
    BaseRequest.validate(StoreProductoRequest),
    ProductosController.store
);

// PUT /productos/:id/precio - Update only price (e.g. apply suggested price from costeo)
router.put('/:id/precio', requirePermission('productos.editar'), ProductosController.updatePrecio);

// PUT /productos/:id - Update product (del tenant)
router.put(
    '/:id',
    requirePermission('productos.editar'),
    BaseRequest.validate(StoreProductoRequest),
    ProductosController.update
);

// DELETE /productos/:id
router.delete('/:id', requirePermission('productos.eliminar'), ProductosController.destroy);

// GET /productos/plantilla - Download Excel template
router.get(
    '/plantilla',
    requirePermission('plantillas.ver'),
    requirePlanFeature('plantillas'),
    ProductosController.downloadTemplate
);

// POST /productos/importar - Import products from Excel
router.post(
    '/importar',
    requirePermission('plantillas.ver'),
    requirePlanFeature('plantillas'),
    upload.single('archivo'),
    ProductosController.import
);

// PATCH /productos/:id/favorito - Toggle favorite
router.patch('/:id/favorito', requirePermission('productos.editar'), ProductosController.toggleFavorite);

// PATCH /productos/:id/pide-nota - Toggle "pedir nota para cocina al ordenar"
router.patch('/:id/pide-nota', requirePermission('productos.pide_nota'), ProductosController.togglePideNota);

// POST /productos/upload-image - Upload image to Cloudflare R2
router.post(
    '/upload-image',
    requirePermission('productos.crear'),
    upload.single('imagen'),
    ProductosController.uploadImage
);

module.exports = router;
