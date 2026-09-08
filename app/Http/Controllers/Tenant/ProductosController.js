const ProductService = require('../../../../services/Tenant/ProductService');
const CategoryService = require('../../../../services/Admin/CategoryService');
const RecetaService = require('../../../../services/Tenant/RecetaService');
let ExcelJS;

class ProductosController {
    // GET /productos
    static async index(req, res) {
        try {
            const tenantId = req.tenant?.id;
            if (!tenantId) {
                return res
                    .status(403)
                    .render('errors/internal', { error: { message: 'Contexto de tenant no disponible' } });
            }
            const { productos, categorias } = await ProductService.getAllForView(tenantId);
            const recetas = await RecetaService.list(tenantId).catch(() => []);
            const recetasPorProducto = {};
            (recetas || []).forEach(r => {
                recetasPorProducto[r.producto_id] = r;
            });
            res.render('productos/index', {
                productos: productos || [],
                categorias: categorias || [],
                recetasPorProducto: recetasPorProducto || {},
                user: req.user,
                tenant: req.tenant,
                allowedByPlan: res.locals.allowedByPlan || {}
            });
        } catch (error) {
            console.error('Error al obtener productos:', error);
            res.status(500).render('errors/internal', {
                error: {
                    message: 'Error al obtener productos',
                    stack: error.stack
                }
            });
        }
    }

    // GET /productos/categorias
    static async getCategorias(req, res) {
        try {
            const tenantId = req.tenant?.id;
            if (!tenantId) {
                return res.status(403).json({ error: 'Contexto de tenant no disponible' });
            }
            const categorias = await CategoryService.getAllActive(tenantId);
            res.json(categorias);
        } catch (error) {
            console.error('Error al obtener categorías:', error);
            res.status(500).json({ error: 'Error al obtener categorías' });
        }
    }

    // GET /productos/buscar
    static async search(req, res) {
        try {
            const tenantId = req.tenant?.id;
            if (!tenantId) {
                return res.status(403).json({ error: 'Contexto de tenant no disponible' });
            }
            const query = req.query.q || '';
            const productos = await ProductService.search(query, tenantId);
            res.json(productos);
        } catch (error) {
            console.error('Error al buscar productos:', error);
            res.status(500).json({ error: 'Error al buscar productos' });
        }
    }

    // GET /productos/:id
    static async show(req, res) {
        try {
            const tenantId = req.tenant?.id;
            if (!tenantId) {
                return res.status(403).json({ error: 'Contexto de tenant no disponible' });
            }
            const producto = await ProductService.getById(parseInt(req.params.id), tenantId);
            res.json(producto);
        } catch (error) {
            console.error('Error al obtener producto:', error);
            if (error.message === 'Producto no encontrado') {
                return res.status(404).json({ error: error.message });
            }
            res.status(500).json({ error: 'Error al obtener producto' });
        }
    }

    // POST /productos
    static async store(req, res) {
        try {
            const tenantId = req.tenant?.id;
            if (!tenantId) {
                return res.status(403).json({ error: 'Contexto de tenant no disponible' });
            }
            const result = await ProductService.create(tenantId, req.body);
            res.status(201).json(result);
        } catch (error) {
            console.error('Error al crear producto:', error);
            if (error.message.includes('requeridos') || error.message.includes('código')) {
                return res.status(400).json({ error: error.message });
            }
            res.status(500).json({ error: 'Error al crear producto' });
        }
    }

    // PUT /productos/:id/precio
    static async updatePrecio(req, res) {
        try {
            const tenantId = req.tenant?.id;
            if (!tenantId) {
                return res.status(403).json({ error: 'Contexto de tenant no disponible' });
            }
            const id = parseInt(req.params.id, 10);
            const precio_unidad = req.body.precio_unidad;
            if (precio_unidad === undefined || precio_unidad === null) {
                return res.status(400).json({ error: 'precio_unidad es requerido' });
            }
            await ProductService.updatePrecio(id, tenantId, precio_unidad);
            res.json({ message: 'Precio actualizado' });
        } catch (error) {
            console.error('Error al actualizar precio:', error);
            if (error.message === 'Producto no encontrado') {
                return res.status(404).json({ error: error.message });
            }
            res.status(500).json({ error: error.message });
        }
    }

    // PUT /productos/:id
    static async update(req, res) {
        try {
            const tenantId = req.tenant?.id;
            if (!tenantId) {
                return res.status(403).json({ error: 'Contexto de tenant no disponible' });
            }
            const result = await ProductService.update(parseInt(req.params.id), tenantId, req.body);
            res.json(result);
        } catch (error) {
            console.error('Error al actualizar producto:', error);
            if (
                error.message === 'Producto no encontrado' ||
                error.message.includes('requeridos') ||
                error.message.includes('código')
            ) {
                const statusCode = error.message === 'Producto no encontrado' ? 404 : 400;
                return res.status(statusCode).json({ error: error.message });
            }
            res.status(500).json({ error: 'Error al actualizar producto' });
        }
    }

    // DELETE /productos/:id
    static async destroy(req, res) {
        try {
            const tenantId = req.tenant?.id;
            if (!tenantId) {
                return res.status(403).json({ error: 'Contexto de tenant no disponible' });
            }
            const result = await ProductService.delete(parseInt(req.params.id), tenantId);
            res.json(result);
        } catch (error) {
            console.error('Error al eliminar producto:', error);
            if (error.message === 'Producto no encontrado') {
                return res.status(404).json({ error: error.message });
            }
            res.status(500).json({ error: error.message || 'Error al eliminar producto' });
        }
    }

    // GET /productos/plantilla
    static async downloadTemplate(req, res) {
        try {
            try {
                ExcelJS = ExcelJS || require('exceljs');
            } catch (e) {
                return res.status(500).send('Instale exceljs para generar la plantilla');
            }

            const wb = new ExcelJS.Workbook();
            const ws = wb.addWorksheet('Instrucciones');
            ws.addRow(['PLANTILLA DE PRODUCTOS']).font = { bold: true, size: 16 };
            ws.addRow(['1) No cambie los encabezados de la hoja "Productos".']).font = { color: { argb: 'FF495057' } };
            ws.addRow(['2) Columnas obligatorias: codigo, nombre, categoria. El precio puede ser 0.']).font = {
                color: { argb: 'FF495057' }
            };
            ws.addRow(['3) Use punto como decimal (ej: 1234.56).']).font = { color: { argb: 'FF495057' } };
            ws.addRow(['4) El código debe ser único. Si ya existe, se actualizarán datos.']).font = {
                color: { argb: 'FF495057' }
            };
            ws.addRow(['5) Categorías disponibles: Bebidas, Postres, Comidas, Acompañamientos, Extras']).font = {
                color: { argb: 'FF495057' }
            };
            ws.getColumn(1).width = 80;
            ws.addRow([]);

            const table = wb.addWorksheet('Productos');
            table.columns = [
                { header: 'codigo', key: 'codigo', width: 18 },
                { header: 'nombre', key: 'nombre', width: 32 },
                { header: 'categoria', key: 'categoria', width: 20 },
                { header: 'precio_unidad', key: 'precio_unidad', width: 14 }
            ];
            const headerRow = table.getRow(1);
            headerRow.font = { bold: true };
            headerRow.alignment = { horizontal: 'center' };
            headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE9ECEF' } };
            table.views = [{ state: 'frozen', ySplit: 1 }];

            // Examples
            table.addRow({ codigo: 'P001', nombre: 'CocaCola 400ml', categoria: 'Bebidas', precio_unidad: 2500 });
            table.addRow({ codigo: 'P002', nombre: 'Tres Leches', categoria: 'Postres', precio_unidad: 8000 });
            table.addRow({ codigo: 'P003', nombre: 'Bandeja Paisa', categoria: 'Comidas', precio_unidad: 25000 });

            // Validations
            table.dataValidations.add('A2:A1048576', {
                type: 'textLength',
                operator: 'greaterThan',
                formulae: [0],
                allowBlank: false,
                showErrorMessage: true,
                errorTitle: 'Código requerido',
                error: 'Ingrese un código'
            });
            table.dataValidations.add('B2:B1048576', {
                type: 'textLength',
                operator: 'greaterThan',
                formulae: [0],
                allowBlank: false,
                showErrorMessage: true,
                errorTitle: 'Nombre requerido',
                error: 'Ingrese el nombre'
            });
            table.dataValidations.add('C2:C1048576', {
                type: 'textLength',
                operator: 'greaterThan',
                formulae: [0],
                allowBlank: false,
                showErrorMessage: true,
                errorTitle: 'Categoría requerida',
                error: 'Ingrese una categoría'
            });
            table.dataValidations.add('D2:D1048576', {
                type: 'decimal',
                operator: 'greaterThanOrEqual',
                formulae: [0],
                allowBlank: true,
                showErrorMessage: true,
                errorTitle: 'Precio inválido',
                error: 'Debe ser número ≥ 0 (use punto decimal)'
            });

            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', 'attachment; filename="plantilla_productos.xlsx"');
            await wb.xlsx.write(res);
            res.end();
        } catch (error) {
            console.error('Error al generar plantilla:', error);
            res.status(500).send('No se pudo generar la plantilla');
        }
    }

    // POST /productos/importar
    static async import(req, res) {
        try {
            if (!req.file) {
                return res.status(400).json({ error: 'Archivo requerido' });
            }

            try {
                ExcelJS = ExcelJS || require('exceljs');
            } catch (e) {
                return res.status(500).json({ error: 'Instale exceljs para importar' });
            }

            const wb = new ExcelJS.Workbook();
            await wb.xlsx.load(req.file.buffer);
            const ws = wb.getWorksheet('Productos') || wb.worksheets[0];
            if (!ws) {
                return res.status(400).json({ error: 'Hoja Productos no encontrada' });
            }

            const header = ['codigo', 'nombre', 'categoria', 'precio_unidad'];
            const rows = [];
            ws.eachRow((row, idx) => {
                if (idx === 1) {
                    return;
                } // Skip header
                const r = header.reduce((acc, key, i) => {
                    acc[key] = row.getCell(i + 1).value || '';
                    return acc;
                }, {});
                if (!r.codigo || !r.nombre || !r.categoria) {
                    return;
                }
                rows.push({
                    codigo: String(r.codigo).trim(),
                    nombre: String(r.nombre).trim(),
                    categoria: String(r.categoria).trim(),
                    precio_unidad: Number(r.precio_unidad || 0)
                });
            });

            const tenantId = req.tenant?.id;
            if (!tenantId) {
                return res.status(403).json({ error: 'Contexto de tenant no disponible' });
            }
            const result = await ProductService.importFromExcel(tenantId, rows);
            res.json(result);
        } catch (error) {
            console.error('Error al importar:', error);
            res.status(500).json({ error: error.message || 'Error al importar productos' });
        }
    }

    // PATCH /productos/:id/favorito
    static async toggleFavorite(req, res) {
        try {
            const tenantId = req.tenant?.id;
            if (!tenantId) {
                return res.status(403).json({ error: 'Contexto de tenant no disponible' });
            }
            const id = parseInt(req.params.id, 10);
            const { es_favorito } = req.body;
            await ProductService.toggleFavorite(id, tenantId, es_favorito);
            res.json({ message: 'Estado de favorito actualizado' });
        } catch (error) {
            console.error('Error al actualizar favorito:', error);
            res.status(500).json({ error: 'Error al actualizar favorito' });
        }
    }

    // PATCH /productos/:id/pide-nota
    static async togglePideNota(req, res) {
        try {
            const tenantId = req.tenant?.id;
            if (!tenantId) {
                return res.status(403).json({ error: 'Contexto de tenant no disponible' });
            }
            const id = parseInt(req.params.id, 10);
            const { pide_nota } = req.body;
            await ProductService.togglePideNota(id, tenantId, pide_nota);
            res.json({ message: 'Preferencia de nota actualizada' });
        } catch (error) {
            console.error('Error al actualizar pide_nota:', error);
            res.status(500).json({ error: 'Error al actualizar la preferencia de nota' });
        }
    }

    // POST /productos/upload-image
    static async uploadImage(req, res) {
        try {
            if (!req.file) {
                return res.status(400).json({ error: 'No se recibió ningún archivo de imagen' });
            }
            const R2StorageService = require('../../../../services/Tenant/R2StorageService');
            const url = await R2StorageService.uploadFile(req.file.buffer, req.file.originalname, req.file.mimetype);
            res.json({ url });
        } catch (error) {
            console.error('Error al subir imagen:', error);
            res.status(500).json({ error: error.message || 'Error al subir imagen' });
        }
    }
}

module.exports = ProductosController;
