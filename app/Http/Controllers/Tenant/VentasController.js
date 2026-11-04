const VentaService = require('../../../../services/Tenant/VentaService');
const ConfiguracionService = require('../../../../services/Tenant/ConfiguracionService');
const EventoService = require('../../../../services/Tenant/EventoService');
const SalesStatsRepository = require('../../../../repositories/Tenant/Stats/SalesStatsRepository');
const { hoyColombia, toFechaISOUtc, aHoraColombiaParaExcel } = require('../../../../utils/dateHelpers');
let ExcelJS;

class VentasController {
    // GET /ventas
    static async index(req, res) {
        try {
            const tenantId = req.tenant?.id;
            if (!tenantId) {
                return res
                    .status(403)
                    .render('errors/internal', { error: { message: 'Contexto de tenant no disponible' } });
            }
            const filters = {
                desde: req.query.desde,
                hasta: req.query.hasta,
                q: req.query.q,
                evento_id: req.query.evento_id || null
            };
            let eventoFiltro = null;
            if (filters.evento_id) {
                const ev = await EventoService.getById(filters.evento_id, tenantId);
                if (ev) {
                    eventoFiltro = { id: ev.id, nombre: ev.nombre };
                }
            }
            // "Ventas hoy" (siempre el día actual en zona Colombia, independiente del
            // rango de filtro de arriba), desglosado por medio de pago igual que el dashboard.
            const hoy = hoyColombia();

            const [ventas, mesasListas, hoyTotals] = await Promise.all([
                VentaService.getWithFilters(tenantId, filters),
                VentaService.getTablesReadyToPay(tenantId),
                SalesStatsRepository.getTotalsByPaymentMethod(tenantId, { desde: hoy, hasta: hoy })
            ]);
            const ventasHoy = {
                efectivo: hoyTotals.efectivo || 0,
                transferencia: hoyTotals.transferencia || 0,
                serviciosExternos: hoyTotals.serviciosExternos || 0,
                total: (hoyTotals.efectivo || 0) + (hoyTotals.transferencia || 0)
            };
            let totalEfectivo = 0,
                totalTransferencia = 0,
                totalGeneral = 0,
                totalServiciosExternos = 0;
            (ventas || []).forEach(function (v) {
                const totalFactura = Number(v.total) || 0;
                const totalExternos = Number(v.total_servicios_externos) || 0;
                const netSale = totalFactura - totalExternos;

                totalGeneral += netSale; // Solo sumamos la venta neta (productos)
                totalServiciosExternos += totalExternos;

                const fp = String(v.forma_pago || '')
                    .toLowerCase()
                    .trim();
                // Proporcionalmente asignamos a efectivo/transf
                if (fp === 'efectivo') {
                    totalEfectivo += netSale;
                } else if (fp === 'transferencia') {
                    totalTransferencia += netSale;
                }

                v.fechaISO = toFechaISOUtc(v.fecha);
            });

            res.render('ventas/index', {
                ventas,
                mesasListas: mesasListas || [],
                eventoFiltro,
                totalEfectivo,
                totalTransferencia,
                totalGeneral, // Ahora es el total de solo productos
                totalServiciosExternos,
                ventasHoy,
                user: req.user,
                tenant: req.tenant,
                allowedByPlan: res.locals.allowedByPlan || {}
            });
        } catch (error) {
            console.error('Error al obtener ventas:', error);
            res.status(500).render('errors/internal', {
                error: error,
                user: req.user
            });
        }
    }

    // GET /ventas/export
    static async export(req, res) {
        try {
            try {
                ExcelJS = ExcelJS || require('exceljs');
            } catch (e) {
                return res
                    .status(500)
                    .send('Exportación a Excel no disponible. Instale la dependencia con: npm install exceljs');
            }

            const tenantId = req.tenant?.id;
            if (!tenantId) {
                return res.status(403).send('Contexto de tenant no disponible');
            }
            const filters = {
                desde: req.query.desde,
                hasta: req.query.hasta,
                q: req.query.q,
                evento_id: req.query.evento_id || null
            };
            const rows = await VentaService.getForExport(tenantId, filters);

            const wb = new ExcelJS.Workbook();
            const ws = wb.addWorksheet('Ventas');

            let config = null;
            try {
                config = await ConfiguracionService.getForPreview(tenantId);
            } catch (_) {
                /* intentional */
            }

            const titulo = config?.nombre_negocio || 'Reporte de Ventas';
            const subInfo = [
                config?.direccion ? config.direccion : null,
                config?.telefono ? `Tel: ${config.telefono}` : null,
                config?.nit ? `NIT: ${config.nit}` : null
            ]
                .filter(Boolean)
                .join('  •  ');
            const rango = `Rango: ${req.query.desde || '-'} a ${req.query.hasta || '-'}${req.query.q ? '  •  Filtro: ' + req.query.q : ''}`;

            const COLUMNAS = [
                { header: 'Factura #', key: 'numero', width: 11 },
                { header: 'Fecha', key: 'fecha', width: 18, numFmt: 'dd/mm/yyyy hh:mm' },
                { header: 'Cliente', key: 'cliente', width: 28 },
                { header: 'Tipo de venta', key: 'tipo', width: 24 },
                { header: 'Forma de pago', key: 'forma_pago', width: 15 },
                { header: 'Efectivo', key: 'efectivo', width: 14, numFmt: '#,##0.00' },
                { header: 'Transferencia', key: 'transferencia', width: 15, numFmt: '#,##0.00' },
                { header: 'Bono', key: 'bono', width: 13, numFmt: '#,##0.00' },
                { header: 'Total', key: 'total', width: 15, numFmt: '#,##0.00' }
            ];
            const ultimaCol = String.fromCharCode(64 + COLUMNAS.length);
            const TINTA = 'FF0E1B2C';
            const CORAL = 'FFFF5A36';
            const GRIS = 'FF5B6B7E';

            ws.columns = COLUMNAS.map(({ key, width }) => ({ key, width }));
            [1, 2, 3].forEach(n => ws.mergeCells(`A${n}:${ultimaCol}${n}`));
            ws.getCell('A1').value = titulo;
            ws.getCell('A2').value = subInfo;
            ws.getCell('A3').value = rango;
            ws.getRow(1).font = { bold: true, size: 16, color: { argb: 'FFFFFFFF' } };
            ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TINTA } };
            ws.getRow(2).font = { size: 10, color: { argb: GRIS } };
            ws.getRow(3).font = { size: 9, color: { argb: GRIS } };
            ws.getRow(1).alignment = { horizontal: 'center', vertical: 'middle' };
            ws.getRow(1).height = 25;

            const FILA_ENCABEZADO = 5;
            const headerRow = ws.getRow(FILA_ENCABEZADO);
            headerRow.values = COLUMNAS.map(c => c.header);
            headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
            headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: CORAL } };
            headerRow.alignment = { horizontal: 'center' };

            const totales = { efectivo: 0, transferencia: 0, bono: 0, total: 0 };
            rows.forEach(row => {
                const pago = VentaService.desglosePago(row);
                const total = parseFloat(row.total || 0);
                totales.efectivo += pago.efectivo;
                totales.transferencia += pago.transferencia;
                totales.bono += pago.bono;
                totales.total += total;
                ws.addRow({
                    numero: row.numero !== null && row.numero !== undefined ? row.numero : row.id,
                    fecha: aHoraColombiaParaExcel(row.fecha),
                    cliente: row.cliente,
                    tipo: row.tipo_venta,
                    forma_pago: row.forma_pago,
                    efectivo: pago.efectivo,
                    transferencia: pago.transferencia,
                    bono: pago.bono,
                    total
                });
            });
            COLUMNAS.forEach((c, i) => {
                if (c.numFmt) {
                    ws.getColumn(i + 1).numFmt = c.numFmt;
                }
            });

            // Fila de totales con fórmulas SUM (las hojas se recalculan al editar) y el valor ya calculado.
            const primera = FILA_ENCABEZADO + 1;
            const ultima = ws.rowCount;
            const filaTotal = ws.addRow({ forma_pago: 'TOTAL:' });
            ['efectivo', 'transferencia', 'bono', 'total'].forEach(key => {
                const idx = COLUMNAS.findIndex(c => c.key === key) + 1;
                const col = String.fromCharCode(64 + idx);
                filaTotal.getCell(idx).value = rows.length
                    ? { formula: `SUM(${col}${primera}:${col}${ultima})`, result: totales[key] }
                    : 0;
                filaTotal.getCell(idx).numFmt = '#,##0.00';
            });
            filaTotal.font = { bold: true };
            filaTotal.getCell(COLUMNAS.findIndex(c => c.key === 'forma_pago') + 1).alignment = { horizontal: 'right' };
            ws.views = [{ state: 'frozen', ySplit: FILA_ENCABEZADO }];

            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader(
                'Content-Disposition',
                `attachment; filename="ventas_${req.query.desde || 'all'}_${req.query.hasta || 'all'}.xlsx"`
            );
            await wb.xlsx.write(res);
            res.end();
        } catch (error) {
            console.error('Error al exportar ventas:', error);
            res.status(500).send('Error al exportar ventas');
        }
    }
}

module.exports = VentasController;
