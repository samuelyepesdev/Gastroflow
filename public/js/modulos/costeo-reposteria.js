/**
 * Costeo Repostería - Conversión tazas/cucharadas a gramos y fracciones.
 * Se carga solo cuando el tenant es panadería o pastelería (costeoPlantillaReposteria).
 * Añade ingredientes a la receta convirtiendo a gramos para que el backend no cambie.
 */
(function () {
    if (!window.COSTEO_PLANTILLA_REPOSTERIA) return;

    const CONVERSIONS = {
        flour: { cup: 125, tbsp: 7.8, tsp: 2.6, density: 0.593 },
        sugar: { cup: 200, tbsp: 12.5, tsp: 4.2, density: 0.845 },
        'brown-sugar': { cup: 220, tbsp: 13.75, tsp: 4.6, density: 0.93 },
        'powdered-sugar': { cup: 120, tbsp: 7.5, tsp: 2.5, density: 0.56 },
        butter: { cup: 227, tbsp: 14.2, tsp: 4.7, density: 0.911 },
        milk: { cup: 240, tbsp: 15, tsp: 5, density: 1.03 },
        water: { cup: 240, tbsp: 15, tsp: 5, density: 1 },
        oil: { cup: 220, tbsp: 13.75, tsp: 4.6, density: 0.92 },
        cocoa: { cup: 85, tbsp: 5.3, tsp: 1.8, density: 0.35 },
        salt: { cup: 288, tbsp: 18, tsp: 6, density: 1.2 },
        eggs: { cup: 243, tbsp: 15.2, tsp: 5.1, density: 1.03 },
        cream: { cup: 240, tbsp: 15, tsp: 5, density: 1.01 },
        honey: { cup: 340, tbsp: 21.25, tsp: 7.1, density: 1.42 },
        'custom-solid': { cup: 200, tbsp: 12.5, tsp: 4.2, density: 0.85 },
        'custom-liquid': { cup: 240, tbsp: 15, tsp: 5, density: 1 }
    };

    function parseFraction(text) {
        if (!text || !String(text).trim()) return NaN;
        const amountText = String(text).trim();
        if (amountText.includes('/')) {
            const parts = amountText.split(/\s+/);
            let whole = 0;
            let fraction = amountText;
            if (parts.length > 1) {
                whole = parseFloat(parts[0]) || 0;
                fraction = parts[1];
            }
            const fractionParts = fraction.split('/');
            if (fractionParts.length === 2) {
                const num = parseFloat(fractionParts[0]);
                const den = parseFloat(fractionParts[1]);
                if (den && !isNaN(num)) return whole + (num / den);
            }
            return whole;
        }
        return parseFloat(amountText.replace(',', '.')) || NaN;
    }

    function convertToGrams(amount, fromUnit, ingredientType) {
        const conv = CONVERSIONS[ingredientType] || CONVERSIONS['custom-solid'];
        let grams = 0;
        switch (fromUnit) {
            case 'cup':
                grams = amount * conv.cup;
                break;
            case 'tbsp':
                grams = amount * conv.tbsp;
                break;
            case 'tsp':
                grams = amount * conv.tsp;
                break;
            case 'oz':
                grams = amount * 28.35;
                break;
            case 'lb':
                grams = amount * 453.592;
                break;
            case 'g':
                grams = amount;
                break;
            case 'kg':
                grams = amount * 1000;
                break;
            case 'ml':
                grams = amount * (conv.density || 1);
                break;
            case 'L':
                grams = amount * 1000 * (conv.density || 1);
                break;
            case 'UND':
                grams = amount;
                break;
            default:
                grams = amount;
        }
        return Math.round(grams * 1000) / 1000;
    }

    function updateConvertidoSpan() {
        const amountText = document.getElementById('ingredienteCantidadRep')?.value?.trim() || '';
        const from = document.getElementById('ingredienteUnidadEntrada')?.value || 'g';
        const tipo = document.getElementById('ingredienteTipoRep')?.value || 'custom-solid';
        const span = document.getElementById('ingredienteConvertidoRep');
        if (!span) return;
        if (!amountText) {
            span.textContent = '';
            return;
        }
        const amount = parseFraction(amountText);
        if (isNaN(amount)) {
            span.textContent = 'Cantidad no válida';
            return;
        }
        const grams = convertToGrams(amount, from, tipo);
        span.textContent = '≈ ' + grams + ' g';
    }

    function refreshReposteriaSelect() {
        const selRep = document.getElementById('ingredienteInsumoRep');
        if (!selRep) return;
        selRep.innerHTML = '<option value="">Agregar insumo</option>';
        (window.COSTEO_insumosList || []).forEach(function (i) {
            const opt = document.createElement('option');
            opt.value = i.id;
            opt.textContent = (i.codigo || '') + ' - ' + (i.nombre || '') + ' (' + (i.unidad_compra || '') + ')';
            selRep.appendChild(opt);
        });
    }

    window.COSTEO_refreshReposteriaSelect = refreshReposteriaSelect;

    function initReposteria() {
        const blockRep = document.getElementById('ingredienteAgregarReposteria');
        const blockEst = document.getElementById('ingredienteAgregarEstandar');
        if (blockRep) blockRep.classList.remove('d-none');
        if (blockEst) blockEst.classList.add('d-none');

        refreshReposteriaSelect();

        document.getElementById('ingredienteCantidadRep')?.addEventListener('input', updateConvertidoSpan);
        document.getElementById('ingredienteUnidadEntrada')?.addEventListener('change', updateConvertidoSpan);
        document.getElementById('ingredienteTipoRep')?.addEventListener('change', updateConvertidoSpan);

        document.getElementById('btnAgregarIngredienteRep')?.addEventListener('click', function () {
            const insumoId = parseInt(document.getElementById('ingredienteInsumoRep')?.value, 10);
            const amountText = document.getElementById('ingredienteCantidadRep')?.value?.trim() || '';
            const from = document.getElementById('ingredienteUnidadEntrada')?.value || 'g';
            const tipo = document.getElementById('ingredienteTipoRep')?.value || 'custom-solid';
            if (!insumoId) return;
            const amount = parseFraction(amountText);
            if (isNaN(amount) || amount <= 0) return;
            const grams = convertToGrams(amount, from, tipo);
            const insumosList = window.COSTEO_insumosList || [];
            const ins = insumosList.find(function (i) { return i.id === insumoId; });
            if (!ins) return;
            const agregar = window.COSTEO_agregarIngrediente;
            if (typeof agregar !== 'function') return;
            agregar({
                insumo_id: insumoId,
                cantidad: grams,
                unidad: 'g',
                insumo_nombre: ins.nombre || '',
                insumo_codigo: ins.codigo || ''
            });
            document.getElementById('ingredienteCantidadRep').value = '';
            document.getElementById('ingredienteConvertidoRep').textContent = '';
        });
    }

    function cantidadToUnidadCompra(amount, fromUnit, unidadCompra, ingredientType) {
        var grams = convertToGrams(amount, fromUnit, ingredientType);
        var u = (unidadCompra || 'g').toLowerCase();
        if (u === 'kg') return grams / 1000;
        if (u === 'g' || u === 'gr') return grams;
        if (u === 'lb') return grams / 453.592;
        if (u === 'l' || u === 'l') return grams / 1000;
        if (u === 'ml') return grams;
        if (u === 'und') return amount;
        return grams / 1000;
    }

    function costoConRendimiento(costoUnit, insumo) {
        // Mismo criterio que CosteoService.aplicarRendimiento: rendimiento 100% (sin merma)
        // no cambia el costo; rendimiento menor encarece el costo "limpio" real.
        var r = insumo ? parseFloat(insumo.rendimiento_pct) : NaN;
        var rendimiento = !isNaN(r) && r > 0 && r <= 100 ? r : 100;
        return costoUnit / (rendimiento / 100);
    }

    function costoIngrediente(amount, fromUnit, insumo, ingredientType) {
        if (!insumo) return 0;
        var u = (insumo.unidad_compra || 'g').toLowerCase();
        var costoUnit = costoConRendimiento(parseFloat(insumo.costo_unitario) || 0, insumo);
        if (u === 'und') return (parseFraction(String(amount)) || 0) * costoUnit;
        var qty = cantidadToUnidadCompra(amount, fromUnit, u, ingredientType);
        return Math.round(qty * costoUnit * 100) / 100;
    }

    var calcIngredientes = [];
    var fmt = function (n) {
        if (n == null || isNaN(n)) return '$0';
        return '$' + Number(n).toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
    };

    function renderCalcIngredientes() {
        var tbody = document.getElementById('calcIngredientesBody');
        if (!tbody) return;
        tbody.innerHTML = '';
        calcIngredientes.forEach(function (ing, idx) {
            var tr = document.createElement('tr');
            tr.innerHTML = '<td>' + (ing.insumo_codigo || '') + ' - ' + (ing.insumo_nombre || '') + '</td><td>' + ing.cantidad + '</td><td>' + (ing.unidad || 'g') + '</td><td class="text-end">' + fmt(ing.costo) + '</td><td><button type="button" class="btn btn-sm btn-outline-danger calcQuitarIng" data-idx="' + idx + '">×</button></td>';
            tbody.appendChild(tr);
        });
        tbody.querySelectorAll('.calcQuitarIng').forEach(function (btn) {
            btn.addEventListener('click', function () {
                calcIngredientes.splice(parseInt(btn.getAttribute('data-idx'), 10), 1);
                renderCalcIngredientes();
                recalcularCalc();
            });
        });
    }

    function recalcularCalc() {
        var totalIng = calcIngredientes.reduce(function (s, i) { return s + (i.costo || 0); }, 0);
        var horas = parseFloat(document.getElementById('calcHorasTrabajo')?.value) || 0;
        var valorHora = parseFloat(document.getElementById('calcValorHora')?.value) || 0;
        var manoObra = horas * valorHora;
        var desgaste = Math.round(totalIng * 0.02 * 100) / 100;
        document.getElementById('calcDesgaste').value = desgaste;
        var servicios = parseFloat(document.getElementById('calcServicios')?.value) || 0;
        var empaque = parseFloat(document.getElementById('calcEmpaque')?.value) || 0;
        var envio = parseFloat(document.getElementById('calcEnvio')?.value) || 0;
        var otros = servicios + empaque + envio;
        var total = totalIng + manoObra + desgaste + otros;
        var porciones = parseFloat(document.getElementById('calcPorciones')?.value) || 1;
        if (porciones <= 0) porciones = 1;
        var costoPorcion = total / porciones;
        var margenPct = parseFloat(document.getElementById('calcMargenPct')?.value) || 50;
        var precioPorcion = margenPct >= 100 ? costoPorcion * 2 : costoPorcion / (1 - margenPct / 100);
        var gananciaPorcion = precioPorcion - costoPorcion;
        var margenVentas = precioPorcion > 0 ? (gananciaPorcion / precioPorcion) * 100 : 0;
        var precioVentaTotal = precioPorcion * porciones;
        var gananciaNeta = gananciaPorcion * porciones;

        document.getElementById('calcResumenIngredientes').textContent = fmt(totalIng);
        document.getElementById('calcResumenManoObra').textContent = fmt(manoObra);
        document.getElementById('calcResumenDesgaste').textContent = fmt(desgaste);
        document.getElementById('calcResumenOtros').textContent = fmt(otros);
        document.getElementById('calcResumenTotal').textContent = fmt(total);
        document.getElementById('calcMargenPctVal').textContent = margenPct;
        document.getElementById('calcCostoPorcion').textContent = fmt(costoPorcion);
        document.getElementById('calcPrecioPorcion').textContent = fmt(precioPorcion);
        document.getElementById('calcGananciaPorcion').textContent = fmt(gananciaPorcion);
        document.getElementById('calcMargenVentas').textContent = margenVentas.toFixed(1) + '%';
        document.getElementById('calcPrecioVentaTotal').textContent = fmt(precioVentaTotal);
        document.getElementById('calcGananciaNeta').textContent = fmt(gananciaNeta);
    }

    var fillCalcInsumoSelect = function () {
        var selInsumo = document.getElementById('calcInsumo');
        if (!selInsumo) return;
        selInsumo.innerHTML = '<option value="">Seleccione insumo</option>';
        (window.COSTEO_insumosList || []).forEach(function (i) {
            var opt = document.createElement('option');
            opt.value = i.id;
            opt.textContent = (i.codigo || '') + ' - ' + (i.nombre || '') + ' (' + (i.unidad_compra || '') + ')';
            selInsumo.appendChild(opt);
        });
    };

    function openCalculadoraReposteria(recetaId) {
        var modal = document.getElementById('modalCalculadoraReposteria');
        if (!modal) return;
        document.getElementById('calcRecetaId').value = recetaId || '';
        document.getElementById('calcProductoId').value = '';
        document.getElementById('calcNombreReceta').value = '';
        document.getElementById('calcPorciones').value = '1';
        document.getElementById('calcHorasTrabajo').value = '0';
        document.getElementById('calcValorHora').value = '10000';
        document.getElementById('calcServicios').value = '0';
        document.getElementById('calcEmpaque').value = '0';
        document.getElementById('calcEnvio').value = '0';
        document.getElementById('calcMargenPct').value = '50';
        calcIngredientes = [];
        renderCalcIngredientes();
        recalcularCalc();

        function doOpen() {
            fillCalcInsumoSelect();
            if (!recetaId) {
                bootstrap.Modal.getOrCreateInstance(modal).show();
                return;
            }
            window.COSTEO_api('/api/recetas/' + recetaId).then(function (rec) {
                document.getElementById('calcProductoId').value = rec.producto_id || '';
                document.getElementById('calcNombreReceta').value = rec.nombre_receta || '';
                document.getElementById('calcPorciones').value = rec.porciones || 1;
                var costos = rec.costos_adicionales || {};
                document.getElementById('calcHorasTrabajo').value = costos.horas_trabajo ?? 0;
                document.getElementById('calcValorHora').value = costos.valor_hora ?? 10000;
                document.getElementById('calcServicios').value = costos.servicios ?? 0;
                document.getElementById('calcEmpaque').value = costos.empaque ?? 0;
                document.getElementById('calcEnvio').value = costos.envio ?? 0;
                calcIngredientes = (rec.ingredientes || []).map(function (ing) {
                    var ins = (window.COSTEO_insumosList || []).find(function (i) { return i.id === ing.insumo_id; });
                    var costo = 0;
                    if (ins) {
                        var qty = cantidadToUnidadCompra(ing.cantidad, ing.unidad || 'g', ins.unidad_compra, 'custom-solid');
                        costo = Math.round(qty * costoConRendimiento(parseFloat(ins.costo_unitario) || 0, ins) * 100) / 100;
                    }
                    return {
                        insumo_id: ing.insumo_id,
                        cantidad: ing.cantidad,
                        unidad: ing.unidad || 'g',
                        insumo_nombre: ing.insumo_nombre,
                        insumo_codigo: ing.insumo_codigo,
                        costo_unitario: ins ? ins.costo_unitario : 0,
                        unidad_compra: ins ? ins.unidad_compra : 'g',
                        costo: costo
                    };
                });
                renderCalcIngredientes();
                recalcularCalc();
                bootstrap.Modal.getOrCreateInstance(modal).show();
            }).catch(function () {
                if (window.COSTEO_showToast) window.COSTEO_showToast('Error al cargar receta', 'danger');
                bootstrap.Modal.getOrCreateInstance(modal).show();
            });
        }

        if (!window.COSTEO_insumosList || !window.COSTEO_insumosList.length) {
            window.COSTEO_api('/api/insumos').then(function (list) {
                window.COSTEO_insumosList = list || [];
                doOpen();
            }).catch(function () {
                doOpen();
            });
        } else {
            doOpen();
        }
    }

    window.COSTEO_openCalculadoraReposteria = openCalculadoraReposteria;

    function initCalculadoraModal() {
        var modal = document.getElementById('modalCalculadoraReposteria');
        if (!modal) return;

        if (window.COSTEO_insumosList && window.COSTEO_insumosList.length) fillCalcInsumoSelect();
        if (window.COSTEO_refreshReposteriaSelect) {
            var orig = window.COSTEO_refreshReposteriaSelect;
            window.COSTEO_refreshReposteriaSelect = function () {
                orig();
                fillCalcInsumoSelect();
            };
        }

        document.getElementById('calcBtnAgregarIng')?.addEventListener('click', function () {
            var insumoId = parseInt(document.getElementById('calcInsumo')?.value, 10);
            var amountText = (document.getElementById('calcCantidad')?.value || '').trim();
            var from = document.getElementById('calcUnidad')?.value || 'g';
            var tipo = document.getElementById('calcTipoIngrediente')?.value || 'custom-solid';
            if (!insumoId) {
                if (window.COSTEO_showToast) window.COSTEO_showToast('Elige un insumo', 'warning');
                return;
            }
            var amount = parseFraction(amountText);
            if (isNaN(amount) || amount <= 0) {
                if (window.COSTEO_showToast) window.COSTEO_showToast('Cantidad no válida', 'warning');
                return;
            }
            var insumosList = window.COSTEO_insumosList || [];
            var ins = insumosList.find(function (i) { return i.id === insumoId; });
            if (!ins) return;
            var grams = convertToGrams(amount, from, tipo);
            var costo = costoIngrediente(amount, from, ins, tipo);
            calcIngredientes.push({
                insumo_id: insumoId,
                cantidad: from === 'UND' ? amount : grams,
                unidad: from === 'UND' ? 'UND' : 'g',
                insumo_nombre: ins.nombre || '',
                insumo_codigo: ins.codigo || '',
                costo_unitario: ins.costo_unitario,
                unidad_compra: ins.unidad_compra || 'g',
                costo: costo
            });
            renderCalcIngredientes();
            recalcularCalc();
            document.getElementById('calcCantidad').value = '';
        });

        ['calcPorciones', 'calcHorasTrabajo', 'calcValorHora', 'calcServicios', 'calcEmpaque', 'calcEnvio', 'calcMargenPct'].forEach(function (id) {
            document.getElementById(id)?.addEventListener('input', recalcularCalc);
            document.getElementById(id)?.addEventListener('change', recalcularCalc);
        });

        document.getElementById('calcBtnGuardar')?.addEventListener('click', function () {
            var recetaId = document.getElementById('calcRecetaId')?.value?.trim();
            var productoId = parseInt(document.getElementById('calcProductoId')?.value, 10);
            var nombreReceta = (document.getElementById('calcNombreReceta')?.value || '').trim();
            var porciones = parseFloat(document.getElementById('calcPorciones')?.value) || 1;
            if (!nombreReceta) {
                if (window.COSTEO_showToast) window.COSTEO_showToast('Nombre de receta es requerido', 'warning');
                return;
            }
            var ingredientes = calcIngredientes.map(function (i) {
                return { insumo_id: i.insumo_id, cantidad: i.cantidad, unidad: i.unidad || 'g' };
            });
            var costosAdicionales = {
                horas_trabajo: parseFloat(document.getElementById('calcHorasTrabajo')?.value) || 0,
                valor_hora: parseFloat(document.getElementById('calcValorHora')?.value) || 0,
                servicios: parseFloat(document.getElementById('calcServicios')?.value) || 0,
                empaque: parseFloat(document.getElementById('calcEmpaque')?.value) || 0,
                envio: parseFloat(document.getElementById('calcEnvio')?.value) || 0
            };
            var api = window.COSTEO_api;
            var showToast = window.COSTEO_showToast;
            var loadRecetas = window.COSTEO_loadRecetas;
            if (!api || !showToast) return;

            if (recetaId) {
                api('/api/recetas/' + recetaId, {
                    method: 'PUT',
                    body: JSON.stringify({ nombre_receta: nombreReceta, porciones: porciones, ingredientes: ingredientes, costos_adicionales: costosAdicionales })
                }).then(function () {
                    bootstrap.Modal.getInstance(modal).hide();
                    if (window.COSTEO_quitarBackdropModal) window.COSTEO_quitarBackdropModal();
                    if (loadRecetas) loadRecetas();
                    showToast('Receta actualizada', 'success');
                }).catch(function (err) {
                    showToast(err.message || 'Error al guardar', 'danger');
                });
            } else {
                if (!productoId) {
                    showToast('Selecciona un producto', 'warning');
                    return;
                }
                api('/api/recetas', {
                    method: 'POST',
                    body: JSON.stringify({ producto_id: productoId, nombre_receta: nombreReceta, porciones: porciones, ingredientes: ingredientes, costos_adicionales: costosAdicionales })
                }).then(function (result) {
                    bootstrap.Modal.getInstance(modal).hide();
                    if (window.COSTEO_quitarBackdropModal) window.COSTEO_quitarBackdropModal();
                    if (loadRecetas) loadRecetas();
                    showToast('Receta creada', 'success');
                    if (result && result.id) {
                        document.getElementById('calcRecetaId').value = result.id;
                    }
                }).catch(function (err) {
                    showToast(err.message || 'Error al crear', 'danger');
                });
            }
        });

        document.getElementById('convCalcular')?.addEventListener('click', function () {
            var amountText = (document.getElementById('convCantidad')?.value || '').trim();
            var med = document.getElementById('convMedida')?.value || 'cup';
            var tipo = document.getElementById('convTipo')?.value || 'flour';
            var amount = parseFraction(amountText);
            if (isNaN(amount)) {
                document.getElementById('convResultado').textContent = 'Cantidad no válida';
                return;
            }
            var grams = convertToGrams(amount, med, tipo);
            var ml = med === 'cup' ? amount * 240 : med === 'tbsp' ? amount * 15 : med === 'tsp' ? amount * 5 : (grams / ((CONVERSIONS[tipo] || CONVERSIONS['custom-solid']).density || 1));
            document.getElementById('convResultado').textContent = grams.toFixed(1) + ' g / ' + ml.toFixed(0) + ' ml';
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () {
            initReposteria();
            initCalculadoraModal();
        });
    } else {
        initReposteria();
        initCalculadoraModal();
    }
})();
