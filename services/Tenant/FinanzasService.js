/**
 * FinanzasService - Lógica de negocio para el control de gastos y ganancias.
 */

const FinanzasRepository = require('../../repositories/Tenant/FinanzasRepository');
const CajaRepository = require('../../repositories/Tenant/CajaRepository');
const ProveedorFacturaRepository = require('../../repositories/Tenant/ProveedorFacturaRepository');
const { hoyColombia, sumarDias, rangoUtcColombia } = require('../../utils/dateHelpers');
const PdfMaker = require('../Shared/PdfMaker');
const {
    formatMoney,
    statCard,
    sectionTitle,
    footerText,
    tableHeaderCell,
    tableCell,
    emptyRow,
    zebraTableLayout,
    encabezadoMarca
} = require('../Shared/PdfDocHelpers');

/** Variación porcentual de `actual` frente a `anterior` (null si no hay base de comparación). */
function variacionPct(actual, anterior) {
    if (!anterior) {
        return actual > 0 ? 100 : 0;
    }
    return ((actual - anterior) / Math.abs(anterior)) * 100;
}

/**
 * Suma las filas de getResumenPeriodo de un tipo. `aporte` (true/false) filtra las entradas
 * manuales de dinero (aportes del dueño, no ventas); undefined suma todas las del tipo.
 */
function sumarResumen(filas, tipo, aporte, metodo) {
    return (filas || [])
        .filter(
            r =>
                r.tipo === tipo &&
                (aporte === undefined || Boolean(Number(r.es_aporte)) === aporte) &&
                (metodo === undefined || r.metodo_pago === metodo)
        )
        .reduce((acc, r) => acc + (Number.parseFloat(r.total) || 0), 0);
}

// Un movimiento manual no puede llevar una fecha más vieja que esto (típico error de digitación).
const MAX_DIAS_ATRAS = 1826;

/**
 * Fecha real de una transacción manual ('YYYY-MM-DD', día Colombia). Vacía = hoy. Debe ser un día
 * real, no futuro y no más de ~5 años atrás.
 */
function resolverFechaMovimiento(fecha) {
    const hoy = hoyColombia();
    if (fecha === undefined || fecha === null || fecha === '') {
        return hoy;
    }
    const f = String(fecha).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(f) || Number.isNaN(Date.parse(`${f}T12:00:00Z`)) || sumarDias(f, 0) !== f) {
        throw new Error('La fecha de la transacción no es válida');
    }
    if (f > hoy) {
        throw new Error('La fecha de la transacción no puede ser futura');
    }
    if (f < sumarDias(hoy, -MAX_DIAS_ATRAS)) {
        throw new Error('La fecha de la transacción es demasiado antigua (máximo 5 años atrás)');
    }
    return f;
}

/** Días 'YYYY-MM-DD' de desde a hasta, ambos inclusive. */
function diasDelRango(desde, hasta) {
    const dias = [];
    for (let d = desde; d <= hasta; d = sumarDias(d, 1)) {
        dias.push(d);
    }
    return dias;
}

class FinanzasService {
    /**
     * Registra un ingreso por venta (automático)
     */
    static async registrarIngresoVenta(tenantId, { monto, factura_id, detalle, esCeramica = false, usuario_id }) {
        // Intentar obtener sesión de caja abierta
        const sesion = await CajaRepository.getSesionAbierta(tenantId);

        // Prioridad de usuario: 1. El que viene en la req, 2. El de la sesión de caja, 3. Usuario 1 (admin)
        const finalUsuarioId = usuario_id || (sesion ? sesion.usuario_id : 1);

        return await FinanzasRepository.createMovimiento(tenantId, {
            sesion_id: sesion ? sesion.id : null,
            usuario_id: finalUsuarioId,
            tipo: 'entrada',
            monto: Number.parseFloat(monto) || 0,
            motivo: detalle || `Venta Factura #${factura_id}`,
            categoria_gasto: esCeramica ? 'Venta Cerámica' : 'Venta General',
            referencia_tipo: 'venta',
            referencia_id: factura_id
        });
    }

    /**
     * Registra un egreso por compra de inventario (automático)
     */
    static async registrarGastoInventario(tenantId, { monto, insumo_nombre, mov_id, categoria_nombre }) {
        const sesion = await CajaRepository.getSesionAbierta(tenantId);

        return await FinanzasRepository.createMovimiento(tenantId, {
            sesion_id: sesion ? sesion.id : null,
            usuario_id: 1,
            tipo: 'salida',
            monto: monto,
            motivo: `Compra de insumo: ${insumo_nombre}`,
            categoria_gasto: categoria_nombre === 'Cerámicas' ? 'Inventario Cerámica' : 'Insumos Generales',
            referencia_tipo: 'compra_inventario',
            referencia_id: mov_id
        });
    }

    /**
     * Registra un movimiento manual (ingreso/egreso) desde el módulo de Finanzas.
     * No requiere una sesión de caja abierta (movimiento administrativo, fuera de turno).
     */
    static async registrarMovimientoManual(
        tenantId,
        { monto, motivo, categoria, tipo, usuario_id, metodo_pago, fecha }
    ) {
        const montoNum = Number.parseFloat(monto);
        if (!montoNum || montoNum <= 0) {
            throw new Error('El monto debe ser mayor a 0');
        }
        if (!['entrada', 'salida'].includes(tipo)) {
            throw new Error('Tipo de operación inválido');
        }
        if (metodo_pago !== undefined && !['efectivo', 'transferencia'].includes(metodo_pago)) {
            throw new Error('Método de pago inválido');
        }

        const fechaMovimiento = resolverFechaMovimiento(fecha);

        // Solo un movimiento de HOY entra al turno de caja abierto: uno con fecha pasada ya ocurrió fuera
        // de este turno y no debe descuadrar el arqueo de hoy.
        const sesion = fechaMovimiento === hoyColombia() ? await CajaRepository.getSesionAbierta(tenantId) : null;

        return await FinanzasRepository.createMovimiento(tenantId, {
            sesion_id: sesion ? sesion.id : null,
            usuario_id: usuario_id || (sesion ? sesion.usuario_id : 1),
            tipo,
            monto: montoNum,
            motivo: motivo || (tipo === 'salida' ? 'Egreso manual' : 'Ingreso manual'),
            categoria_gasto: categoria || 'General',
            referencia_tipo: 'manual',
            referencia_id: null,
            metodo_pago: metodo_pago || 'efectivo',
            fecha_movimiento: fechaMovimiento
        });
    }

    /**
     * Obtiene el resumen para el dashboard financiero.
     *
     * "egresos"/"utilidad" son las cifras REALES: además de los egresos de caja
     * (caja_movimientos) incluyen los costos fijos activos (prorrateados sobre
     * 30 días -- costos_fijos no tiene fecha, es un valor mensual recurrente) y
     * las facturas de proveedor emitidas en el periodo (proveedor_facturas).
     * Antes de este cambio esos dos se ignoraban por completo y la "utilidad"
     * mostrada podía ser positiva aunque el restaurante estuviera en rojo.
     */
    static async getDashboardData(tenantId, dias = 30) {
        const hoyDia = hoyColombia();
        const inicioDia = sumarDias(hoyDia, -(dias - 1));
        const { utcDesde, utcHasta } = rangoUtcColombia(inicioDia, hoyDia);

        // Periodo anterior, de la misma longitud, inmediatamente antes -- para las comparativas.
        const finAnteriorDia = sumarDias(inicioDia, -1);
        const inicioAnteriorDia = sumarDias(finAnteriorDia, -(dias - 1));

        const [
            resumen,
            resumenAnterior,
            porCategoria,
            historicoCaja,
            costosFijosMensual,
            proveedoresPeriodo,
            proveedoresPeriodoAnterior,
            desglosePago,
            cuentasPorPagar,
            movimientos,
            proveedoresPorDia
        ] = await Promise.all([
            FinanzasRepository.getResumenPeriodo(tenantId, inicioDia, hoyDia),
            FinanzasRepository.getResumenPeriodo(tenantId, inicioAnteriorDia, finAnteriorDia),
            FinanzasRepository.getPorCategoria(tenantId, 'salida', inicioDia, hoyDia),
            FinanzasRepository.getHistoricoDiario(tenantId, inicioDia, hoyDia),
            FinanzasRepository.getCostosFijosActivosMensual(tenantId),
            ProveedorFacturaRepository.sumaPorPeriodo(tenantId, inicioDia, hoyDia),
            ProveedorFacturaRepository.sumaPorPeriodo(tenantId, inicioAnteriorDia, finAnteriorDia),
            FinanzasRepository.getDesglosePorFormaPago(tenantId, utcDesde, utcHasta),
            ProveedorFacturaRepository.findPendientes(tenantId),
            FinanzasRepository.getMovimientosPeriodo(tenantId, inicioDia, hoyDia),
            ProveedorFacturaRepository.sumaPorDia(tenantId, inicioDia, hoyDia)
        ]);

        // Serie diaria por la fecha REAL de cada movimiento (y de cada factura de proveedor), con los
        // días sin movimiento en cero para que el eje del tiempo sea fiel.
        const caja = new Map(historicoCaja.map(h => [h.fecha, h]));
        const provDia = new Map(proveedoresPorDia.map(p => [p.dia, p.total]));
        const historico = diasDelRango(inicioDia, hoyDia).map(fecha => ({
            fecha,
            ingresos: caja.get(fecha)?.ingresos || 0,
            egresos: (caja.get(fecha)?.egresos || 0) + (provDia.get(fecha) || 0)
        }));

        const costosFijosPeriodo = (costosFijosMensual / 30) * dias;

        const ingresos = sumarResumen(resumen, 'entrada', false);
        const aportes = sumarResumen(resumen, 'entrada', true);
        const egresosCaja = sumarResumen(resumen, 'salida');
        // Gastos y aportes manuales de dinero, separados por cómo se pagaron/recibieron.
        const egresosPorMetodo = {
            efectivo: sumarResumen(resumen, 'salida', undefined, 'efectivo'),
            transferencia: sumarResumen(resumen, 'salida', undefined, 'transferencia')
        };
        const aportesPorMetodo = {
            efectivo: sumarResumen(resumen, 'entrada', true, 'efectivo'),
            transferencia: sumarResumen(resumen, 'entrada', true, 'transferencia')
        };
        const egresos = egresosCaja + costosFijosPeriodo + proveedoresPeriodo;
        const utilidad = ingresos - egresos;

        const ingresosAnt = sumarResumen(resumenAnterior, 'entrada', false);
        const egresosCajaAnt = sumarResumen(resumenAnterior, 'salida');
        const egresosAnt = egresosCajaAnt + costosFijosPeriodo + proveedoresPeriodoAnterior;
        const utilidadAnt = ingresosAnt - egresosAnt;

        return {
            ingresos,
            aportes,
            egresosPorMetodo,
            aportesPorMetodo,
            egresosCaja,
            costosFijosPeriodo,
            proveedoresPeriodo,
            egresos,
            utilidad,
            variacionIngresos: variacionPct(ingresos, ingresosAnt),
            variacionEgresos: variacionPct(egresos, egresosAnt),
            variacionUtilidad: variacionPct(utilidad, utilidadAnt),
            desglosePago,
            cuentasPorPagar,
            gastosPorCategoria: porCategoria,
            historico,
            movimientos,
            desde: inicioDia,
            hasta: hoyDia,
            dias
        };
    }

    /**
     * Genera el PDF del estado financiero del periodo (pdfmake, sin Chromium).
     */
    static async generarPdfMensual(tenant, dias) {
        const data = await this.getDashboardData(tenant.id, dias);
        const hoyStr = new Date().toLocaleDateString('es-CO');

        const variacionTexto = pct => {
            if (pct === null) {
                return '';
            }
            const signo = pct >= 0 ? '+' : '';
            return ` (${signo}${pct.toFixed(1)}% vs. periodo anterior)`;
        };

        const categoriaTable = () => {
            const body = [[tableHeaderCell('Categoría'), tableHeaderCell('Total', 'right')]];
            if (data.gastosPorCategoria && data.gastosPorCategoria.length > 0) {
                for (const c of data.gastosPorCategoria) {
                    body.push([tableCell(c.categoria_gasto), tableCell(formatMoney(c.total), 'right')]);
                }
            } else {
                body.push(emptyRow('Sin egresos de caja en el periodo.', 2));
            }
            return { table: { headerRows: 1, widths: ['*', 'auto'], body }, layout: zebraTableLayout() };
        };

        const cuentasPorPagarTable = () => {
            const body = [
                [
                    tableHeaderCell('Proveedor'),
                    tableHeaderCell('N° Factura'),
                    tableHeaderCell('Vence'),
                    tableHeaderCell('Monto', 'right')
                ]
            ];
            if (data.cuentasPorPagar && data.cuentasPorPagar.length > 0) {
                for (const f of data.cuentasPorPagar) {
                    body.push([
                        tableCell(f.proveedor_nombre),
                        tableCell(f.numero_factura || '-'),
                        tableCell(
                            f.fecha_vencimiento ? new Date(f.fecha_vencimiento).toLocaleDateString('es-CO') : '-'
                        ),
                        tableCell(formatMoney(f.monto_total), 'right')
                    ]);
                }
            } else {
                body.push(emptyRow('No hay cuentas por pagar pendientes.', 4));
            }
            return {
                table: { headerRows: 1, widths: ['*', 'auto', 'auto', 'auto'], body },
                layout: zebraTableLayout()
            };
        };

        const docDefinition = {
            content: [
                ...encabezadoMarca(tenant.nombre, `Estado Financiero - Últimos ${dias} días (al ${hoyStr})`),
                {
                    columns: [
                        statCard('Ingresos', formatMoney(data.ingresos) + variacionTexto(data.variacionIngresos), {
                            valueColor: '#16a34a'
                        }),
                        statCard('Egresos Totales', formatMoney(data.egresos) + variacionTexto(data.variacionEgresos), {
                            valueColor: '#dc2626'
                        }),
                        statCard('Utilidad', formatMoney(data.utilidad) + variacionTexto(data.variacionUtilidad), {
                            valueColor: data.utilidad >= 0 ? '#e8431f' : '#dc2626'
                        })
                    ],
                    columnGap: 12,
                    margin: [0, 0, 0, 10]
                },
                sectionTitle('Desglose de Egresos', '#e8431f'),
                {
                    ul: [
                        `Caja (compras de inventario, gastos manuales): ${formatMoney(data.egresosCaja)}`,
                        `   · pagado en efectivo: ${formatMoney(data.egresosPorMetodo.efectivo)}`,
                        `   · pagado por transferencia: ${formatMoney(data.egresosPorMetodo.transferencia)}`,
                        `Costos fijos del periodo (prorrateado): ${formatMoney(data.costosFijosPeriodo)}`,
                        `Facturas de proveedor del periodo: ${formatMoney(data.proveedoresPeriodo)}`
                    ],
                    margin: [0, 0, 0, 10]
                },
                sectionTitle('Ingresos por Forma de Pago', '#e8431f'),
                {
                    ul: [
                        `Efectivo: ${formatMoney(data.desglosePago.efectivo)}`,
                        `Transferencia: ${formatMoney(data.desglosePago.transferencia)}`,
                        `Bonos redimidos: ${formatMoney(data.desglosePago.bono)}`
                    ],
                    margin: [0, 0, 0, 10]
                },
                sectionTitle('Egresos de Caja por Categoría', '#e8431f'),
                categoriaTable(),
                sectionTitle('Cuentas por Pagar Pendientes', '#e8431f'),
                cuentasPorPagarTable(),
                footerText('Este reporte fue generado de forma automática.')
            ]
        };

        return PdfMaker.renderPdf(docDefinition);
    }
}

module.exports = FinanzasService;
