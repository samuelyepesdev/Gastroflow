const logger = require('../../../../utils/logger');
const InsumoService = require('../../../../services/Tenant/InsumoService');
const RecetaService = require('../../../../services/Tenant/RecetaService');
const CosteoService = require('../../../../services/Tenant/CosteoService');
const ProductService = require('../../../../services/Tenant/ProductService');
const TemaService = require('../../../../services/Shared/TemaService');
const ParametroService = require('../../../../services/Shared/ParametroService');
const ProductoParametroRepository = require('../../../../repositories/Tenant/ProductoParametroRepository');
const TenantService = require('../../../../services/Admin/TenantService');
const CostosFijosRepository = require('../../../../repositories/Tenant/CostosFijosRepository');
const ExcelJS = require('exceljs');

class CosteoController {
    // GET /costeo
    static async index(req, res) {
        try {
            const isSuperadmin = req.user && String(req.user.rol || '').toLowerCase() === 'superadmin';
            if (isSuperadmin && !req.tenant) {
                const tenants = await TenantService.getAllTenants();
                return res.render('costeo/index', {
                    productos: [],
                    user: req.user,
                    tenant: null,
                    showTenantSelector: true,
                    tenants: tenants || [],
                    costeoPlantillaReposteria: false,
                    tipoNegocio: ''
                });
            }
            const tenantId = req.tenant?.id;
            if (!tenantId) {
                return res
                    .status(403)
                    .render('errors/internal', { error: { message: 'Contexto de tenant no disponible' } });
            }

            const { productos } = await ProductService.getAllForView(tenantId);
            const tipoNegocio =
                req.tenant && req.tenant.config && req.tenant.config.tipo_negocio
                    ? req.tenant.config.tipo_negocio
                    : 'restaurante';
            const costeoPlantillaReposteria = tipoNegocio === 'panaderia' || tipoNegocio === 'pasteleria';

            const TemaRepository = require('../../../../repositories/Shared/TemaRepository');
            const temaCat = await TemaRepository.findByName('CATEGORIAS DE INSUMO', tenantId);
            const temaUni = await TemaRepository.findByName('UNIDADES DE COMPRA', tenantId);
            let categoriasInsumo = [],
                unidadesCompra = [];
            if (temaCat) {
                categoriasInsumo = await ParametroService.getByTemaId(temaCat.id, tenantId);
            }
            if (temaUni) {
                unidadesCompra = await ParametroService.getByTemaId(temaUni.id, tenantId);
            }

            res.render('costeo/index', {
                productos: productos || [],
                user: req.user,
                tenant: req.tenant,
                showTenantSelector: false,
                tenants: [],
                costeoPlantillaReposteria,
                tipoNegocio,
                allowedByPlan: res.locals.allowedByPlan || {},
                categoriasInsumo,
                unidadesCompra
            });
        } catch (error) {
            logger.error('Error al cargar costeo', { error: error.message, stack: error.stack });
            res.status(500).render('errors/internal', {
                error: { message: 'Error al cargar costeo', stack: error.stack }
            });
        }
    }

    // --- Insumos API ---
    static async listInsumos(req, res) {
        try {
            const tenantId = req.tenant?.id;
            if (!tenantId) {
                return res.status(403).json({ error: 'Contexto de tenant no disponible' });
            }
            const list = await InsumoService.list(tenantId, { q: req.query.q, unidad: req.query.unidad });
            const listWithCosto = (list || []).map(ins => ({
                ...ins,
                costo_unitario: CosteoService.getCostoUnitarioCalculado(ins)
            }));
            res.json(listWithCosto);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    static async storeInsumo(req, res) {
        try {
            const tenantId = req.tenant?.id;
            if (!tenantId) {
                return res.status(403).json({ error: 'Contexto de tenant no disponible' });
            }
            const created = await InsumoService.create(tenantId, req.body);
            res.status(201).json(created);
        } catch (error) {
            res.status(400).json({ error: error.message });
        }
    }

    static async downloadPlantillaInsumos(req, res) {
        try {
            const wb = new ExcelJS.Workbook();
            const inst = wb.addWorksheet('Instrucciones');
            inst.addRow(['PLANTILLA DE INSUMOS']).font = { bold: true, size: 16 };
            inst.addRow(['1) No cambie los encabezados de la hoja "Insumos".']).font = { color: { argb: 'FF495057' } };
            inst.addRow([
                '2) Columnas obligatorias: codigo, nombre. Unidad compra, cantidad_compra y precio_compra tienen valor por defecto.'
            ]).font = { color: { argb: 'FF495057' } };
            inst.addRow([
                '3) Unidad compra: UND, kg, g, L, ml, lb. Cantidad compra = presentación (ej: 4 kilos, 8 unidades).'
            ]).font = { color: { argb: 'FF495057' } };
            inst.addRow([
                '4) Precio compra = precio pagado por esa presentación. El costo unitario se calcula: precio_compra / cantidad (en base).'
            ]).font = { color: { argb: 'FF495057' } };
            inst.addRow(['5) Si el código ya existe, se actualizarán nombre, unidad, cantidad y precio.']).font = {
                color: { argb: 'FF495057' }
            };
            inst.getColumn(1).width = 70;

            const sheet = wb.addWorksheet('Insumos');
            sheet.columns = [
                { header: 'codigo', key: 'codigo', width: 18 },
                { header: 'nombre', key: 'nombre', width: 32 },
                { header: 'unidad_compra', key: 'unidad_compra', width: 16 },
                { header: 'cantidad_compra', key: 'cantidad_compra', width: 14 },
                { header: 'precio_compra', key: 'precio_compra', width: 14 }
            ];
            const headerRow = sheet.getRow(1);
            headerRow.font = { bold: true };
            headerRow.alignment = { horizontal: 'center' };
            headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE9ECEF' } };
            sheet.views = [{ state: 'frozen', ySplit: 1 }];
            sheet.addRow({
                codigo: 'INS001',
                nombre: 'Harina 1kg',
                unidad_compra: 'kg',
                cantidad_compra: 1,
                precio_compra: 2500
            });
            sheet.addRow({
                codigo: 'INS002',
                nombre: 'Salsa 4kg',
                unidad_compra: 'kg',
                cantidad_compra: 4,
                precio_compra: 6380
            });

            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', 'attachment; filename="plantilla_insumos.xlsx"');
            await wb.xlsx.write(res);
            res.end();
        } catch (error) {
            logger.error('Error al generar plantilla insumos', { error: error.message });
            res.status(500).send('No se pudo generar la plantilla');
        }
    }

    static async importInsumos(req, res) {
        try {
            if (!req.file) {
                return res.status(400).json({ error: 'Seleccione un archivo Excel' });
            }
            const tenantId = req.tenant?.id;
            if (!tenantId) {
                return res.status(403).json({ error: 'Contexto de tenant no disponible' });
            }

            const wb = new ExcelJS.Workbook();
            await wb.xlsx.load(req.file.buffer);
            const ws = wb.getWorksheet('Insumos') || wb.worksheets[0];
            if (!ws) {
                return res.status(400).json({ error: 'Hoja "Insumos" no encontrada' });
            }

            const headerArr = ['codigo', 'nombre', 'unidad_compra', 'cantidad_compra', 'precio_compra'];
            const rows = [];
            ws.eachRow((row, idx) => {
                if (idx === 1) {
                    return;
                }
                const r = headerArr.reduce((acc, key, i) => {
                    acc[key] = row.getCell(i + 1).value ?? '';
                    return acc;
                }, {});
                if (!r.codigo && !r.nombre) {
                    return;
                }
                rows.push({
                    codigo: String(r.codigo ?? '').trim(),
                    nombre: String(r.nombre ?? '').trim(),
                    unidad_compra: String(r.unidad_compra ?? 'UND').trim() || 'UND',
                    cantidad_compra: Number(r.cantidad_compra) || 1,
                    precio_compra: Number(r.precio_compra) || 0
                });
            });
            if (rows.length === 0) {
                return res.status(400).json({ error: 'No hay filas válidas' });
            }
            const result = await InsumoService.importFromExcel(tenantId, rows);
            res.json(result);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    static async showInsumo(req, res) {
        try {
            const tenantId = req.tenant?.id;
            if (!tenantId) {
                return res.status(403).json({ error: 'Contexto de tenant no disponible' });
            }
            const id = parseInt(req.params.id, 10);
            const insumo = await InsumoService.getById(id, tenantId);
            if (!insumo) {
                return res.status(404).json({ error: 'Insumo no encontrado' });
            }
            const withCosto = { ...insumo, costo_unitario: CosteoService.getCostoUnitarioCalculado(insumo) };
            res.json(withCosto);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    static async updateInsumo(req, res) {
        try {
            const tenantId = req.tenant?.id;
            if (!tenantId) {
                return res.status(403).json({ error: 'Contexto de tenant no disponible' });
            }
            const id = parseInt(req.params.id, 10);
            await InsumoService.update(id, tenantId, req.body);
            res.json({ message: 'Insumo actualizado' });
        } catch (error) {
            const statusCode = error.message === 'Insumo no encontrado' ? 404 : 400;
            res.status(statusCode).json({ error: error.message });
        }
    }

    static async destroyInsumo(req, res) {
        try {
            const tenantId = req.tenant?.id;
            if (!tenantId) {
                return res.status(403).json({ error: 'Contexto de tenant no disponible' });
            }
            const id = parseInt(req.params.id, 10);
            await InsumoService.delete(id, tenantId);
            res.json({ message: 'Insumo eliminado' });
        } catch (error) {
            const statusCode = error.message === 'Insumo no encontrado' ? 404 : 500;
            res.status(statusCode).json({ error: error.message });
        }
    }

    // --- Recetas API ---
    static async listRecetas(req, res) {
        try {
            const tenantId = req.tenant?.id;
            if (!tenantId) {
                return res.status(403).json({ error: 'Contexto de tenant no disponible' });
            }
            const list = await RecetaService.list(tenantId, {
                q: req.query.q,
                tema_id: req.query.tema_id,
                parametro_id: req.query.parametro_id
            });
            res.json(list);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    static async showReceta(req, res) {
        try {
            const tenantId = req.tenant?.id;
            if (!tenantId) {
                return res.status(403).json({ error: 'Contexto de tenant no disponible' });
            }
            const receta = await RecetaService.getById(parseInt(req.params.id), tenantId);
            if (!receta) {
                return res.status(404).json({ error: 'Receta no encontrada' });
            }
            res.json(receta);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    static async storeReceta(req, res) {
        try {
            const tenantId = req.tenant?.id;
            if (!tenantId) {
                return res.status(403).json({ error: 'Contexto de tenant no disponible' });
            }
            const recetaId = await RecetaService.create(tenantId, req.body);
            res.status(201).json({ id: recetaId, message: 'Receta creada' });
        } catch (error) {
            res.status(400).json({ error: error.message });
        }
    }

    static async updateReceta(req, res) {
        try {
            const tenantId = req.tenant?.id;
            if (!tenantId) {
                return res.status(403).json({ error: 'Contexto de tenant no disponible' });
            }
            const id = parseInt(req.params.id, 10);
            await RecetaService.update(id, tenantId, req.body);
            res.json({ message: 'Receta actualizada' });
        } catch (error) {
            const statusCode = error.message === 'Receta no encontrada' ? 404 : 400;
            res.status(statusCode).json({ error: error.message });
        }
    }

    static async destroyReceta(req, res) {
        try {
            const tenantId = req.tenant?.id;
            if (!tenantId) {
                return res.status(403).json({ error: 'Contexto de tenant no disponible' });
            }
            const id = parseInt(req.params.id, 10);
            await RecetaService.delete(id, tenantId);
            res.json({ message: 'Receta eliminada' });
        } catch (error) {
            const statusCode = error.message === 'Receta no encontrada' ? 404 : 500;
            res.status(statusCode).json({ error: error.message });
        }
    }

    // --- Otros Cálculos ---
    static async getCosteoProducto(req, res) {
        try {
            const tenantId = req.tenant?.id;
            if (!tenantId) {
                return res.status(403).json({ error: 'Contexto de tenant no disponible' });
            }
            const costeo = await CosteoService.getCosteoByProductoId(parseInt(req.params.productoId), tenantId);
            if (!costeo) {
                return res.status(404).json({ error: 'Este producto no tiene receta asociada' });
            }
            res.json(costeo);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    static async getCosteoReceta(req, res) {
        try {
            const tenantId = req.tenant?.id;
            if (!tenantId) {
                return res.status(403).json({ error: 'Contexto de tenant no disponible' });
            }
            const costeo = await CosteoService.getCosteoReceta(parseInt(req.params.id), tenantId);
            if (!costeo) {
                return res.status(404).json({ error: 'Receta no encontrada' });
            }
            res.json(costeo);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    static async getAlertas(req, res) {
        try {
            const tenantId = req.tenant?.id;
            if (!tenantId) {
                return res.status(403).json({ error: 'Contexto de tenant no disponible' });
            }
            const alertas = await CosteoService.getAlertas(tenantId);
            res.json(alertas);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    static async getConfig(req, res) {
        try {
            const tenantId = req.tenant?.id;
            if (!tenantId) {
                return res.status(403).json({ error: 'Contexto de tenant no disponible' });
            }
            const config = await CosteoService.getConfig(tenantId);
            res.json(config);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    static async saveConfig(req, res) {
        try {
            const tenantId = req.tenant?.id;
            if (!tenantId) {
                return res.status(403).json({ error: 'Contexto de tenant no disponible' });
            }
            await CosteoService.saveConfig(tenantId, req.body);
            res.json({ message: 'Configuración guardada' });
        } catch (error) {
            res.status(400).json({ error: error.message });
        }
    }

    static async getResumenFinanciero(req, res) {
        try {
            const tenantId = req.tenant?.id;
            if (!tenantId) {
                return res.status(403).json({ error: 'Contexto de tenant no disponible' });
            }
            const resumen = await CosteoService.getResumenFinanciero(tenantId);
            res.json(resumen);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    static async listCostosFijos(req, res) {
        try {
            const tenantId = req.tenant?.id;
            if (!tenantId) {
                return res.status(403).json({ error: 'Contexto de tenant no disponible' });
            }
            const list = await CostosFijosRepository.findAll(tenantId);
            const total = await CostosFijosRepository.getTotalActivo(tenantId);
            res.json({ items: list || [], total: Math.round(total * 100) / 100 });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    static async storeCostoFijo(req, res) {
        try {
            const tenantId = req.tenant?.id;
            if (!tenantId) {
                return res.status(403).json({ error: 'Contexto de tenant no disponible' });
            }
            const { nombre, monto_mensual, activo } = req.body;
            if (!nombre || !nombre.trim()) {
                return res.status(400).json({ error: 'El nombre es obligatorio' });
            }
            const id = await CostosFijosRepository.create(tenantId, {
                nombre: nombre.trim(),
                monto_mensual: parseFloat(monto_mensual) || 0,
                activo: activo !== false
            });
            res.status(201).json({ id, message: 'Costo fijo creado' });
        } catch (error) {
            res.status(400).json({ error: error.message });
        }
    }

    static async updateCostoFijo(req, res) {
        try {
            const tenantId = req.tenant?.id;
            if (!tenantId) {
                return res.status(403).json({ error: 'Contexto de tenant no disponible' });
            }
            const id = parseInt(req.params.id);
            const existente = await CostosFijosRepository.findById(id, tenantId);
            if (!existente) {
                return res.status(404).json({ error: 'Costo fijo no encontrado' });
            }
            await CostosFijosRepository.update(id, tenantId, req.body);
            res.json({ message: 'Costo fijo actualizado' });
        } catch (error) {
            res.status(400).json({ error: error.message });
        }
    }

    static async destroyCostoFijo(req, res) {
        try {
            const tenantId = req.tenant?.id;
            if (!tenantId) {
                return res.status(403).json({ error: 'Contexto de tenant no disponible' });
            }
            const id = parseInt(req.params.id);
            const existente = await CostosFijosRepository.findById(id, tenantId);
            if (!existente) {
                return res.status(404).json({ error: 'Costo fijo no encontrado' });
            }
            await CostosFijosRepository.delete(id, tenantId);
            res.json({ message: 'Costo fijo eliminado' });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    // --- Temas & Parámetros ---
    static async listTemas(req, res) {
        try {
            const tenantId = req.tenant?.id;
            if (!tenantId) {
                return res.status(403).json({ error: 'Contexto de tenant no disponible' });
            }
            const list = await TemaService.list(tenantId);
            res.json(list);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    static async showTema(req, res) {
        try {
            const tenantId = req.tenant?.id;
            if (!tenantId) {
                return res.status(403).json({ error: 'Contexto de tenant no disponible' });
            }
            const tema = await TemaService.getById(parseInt(req.params.id), tenantId);
            if (!tema) {
                return res.status(404).json({ error: 'Tema no encontrado' });
            }
            res.json(tema);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    static async storeTema(req, res) {
        try {
            const tenantId = req.tenant?.id;
            if (!tenantId) {
                return res.status(403).json({ error: 'Contexto de tenant no disponible' });
            }
            const id = await TemaService.create(tenantId, req.body);
            res.status(201).json({ id, message: 'Tema creado' });
        } catch (error) {
            res.status(400).json({ error: error.message });
        }
    }

    static async updateTema(req, res) {
        try {
            const tenantId = req.tenant?.id;
            if (!tenantId) {
                return res.status(403).json({ error: 'Contexto de tenant no disponible' });
            }
            await TemaService.update(parseInt(req.params.id), tenantId, req.body);
            res.json({ message: 'Tema actualizado' });
        } catch (error) {
            const statusCode = error.message === 'Tema no encontrado' ? 404 : 400;
            res.status(statusCode).json({ error: error.message });
        }
    }

    static async destroyTema(req, res) {
        try {
            const tenantId = req.tenant?.id;
            if (!tenantId) {
                return res.status(403).json({ error: 'Contexto de tenant no disponible' });
            }
            await TemaService.delete(parseInt(req.params.id), tenantId);
            res.json({ message: 'Tema eliminado' });
        } catch (error) {
            const statusCode = error.message === 'Tema no encontrado' ? 404 : 500;
            res.status(statusCode).json({ error: error.message });
        }
    }

    static async listParametrosTema(req, res) {
        try {
            const tenantId = req.tenant?.id;
            if (!tenantId) {
                return res.status(403).json({ error: 'Contexto de tenant no disponible' });
            }
            const list = await ParametroService.getByTemaId(parseInt(req.params.id), tenantId);
            res.json(list);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    static async setParametrosTema(req, res) {
        try {
            const tenantId = req.tenant?.id;
            if (!tenantId) {
                return res.status(403).json({ error: 'Contexto de tenant no disponible' });
            }
            await TemaService.setParametros(parseInt(req.params.id), tenantId, req.body.parametro_ids || []);
            res.json({ message: 'Parámetros del tema actualizados' });
        } catch (error) {
            res.status(400).json({ error: error.message });
        }
    }

    static async listParametros(req, res) {
        try {
            const tenantId = req.tenant?.id;
            if (!tenantId) {
                return res.status(403).json({ error: 'Contexto de tenant no disponible' });
            }
            const list = await ParametroService.list(tenantId);
            res.json(list);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    static async showParametro(req, res) {
        try {
            const tenantId = req.tenant?.id;
            if (!tenantId) {
                return res.status(403).json({ error: 'Contexto de tenant no disponible' });
            }
            const param = await ParametroService.getById(parseInt(req.params.id), tenantId);
            if (!param) {
                return res.status(404).json({ error: 'Parámetro no encontrado' });
            }
            res.json(param);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    static async storeParametro(req, res) {
        try {
            const tenantId = req.tenant?.id;
            if (!tenantId) {
                return res.status(403).json({ error: 'Contexto de tenant no disponible' });
            }
            const id = await ParametroService.create(tenantId, req.body);
            res.status(201).json({ id, message: 'Parámetro creado' });
        } catch (error) {
            res.status(400).json({ error: error.message });
        }
    }

    static async updateParametro(req, res) {
        try {
            const tenantId = req.tenant?.id;
            if (!tenantId) {
                return res.status(403).json({ error: 'Contexto de tenant no disponible' });
            }
            await ParametroService.update(parseInt(req.params.id), tenantId, req.body);
            res.json({ message: 'Parámetro actualizado' });
        } catch (error) {
            const statusCode = error.message === 'Parámetro no encontrado' ? 404 : 400;
            res.status(statusCode).json({ error: error.message });
        }
    }

    static async destroyParametro(req, res) {
        try {
            const tenantId = req.tenant?.id;
            if (!tenantId) {
                return res.status(403).json({ error: 'Contexto de tenant no disponible' });
            }
            await ParametroService.delete(parseInt(req.params.id), tenantId);
            res.json({ message: 'Parámetro eliminado' });
        } catch (error) {
            const statusCode = error.message === 'Parámetro no encontrado' ? 404 : 500;
            res.status(statusCode).json({ error: error.message });
        }
    }

    static async listParametrosProducto(req, res) {
        try {
            const tenantId = req.tenant?.id;
            if (!tenantId) {
                return res.status(403).json({ error: 'Contexto de tenant no disponible' });
            }
            const list = await ProductoParametroRepository.getParametrosByProductoId(parseInt(req.params.id), tenantId);
            res.json(list);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    static async setParametrosProducto(req, res) {
        try {
            const tenantId = req.tenant?.id;
            if (!tenantId) {
                return res.status(403).json({ error: 'Contexto de tenant no disponible' });
            }
            const productoId = parseInt(req.params.id);
            const producto = await ProductService.getById(productoId, tenantId);
            if (!producto) {
                return res.status(404).json({ error: 'Producto no encontrado' });
            }
            await ProductoParametroRepository.setParametrosForProducto(productoId, req.body.parametro_ids || []);
            res.json({ message: 'Parámetros del producto actualizados' });
        } catch (error) {
            res.status(400).json({ error: error.message });
        }
    }
}

module.exports = CosteoController;
