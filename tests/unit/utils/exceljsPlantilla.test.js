/**
 * exceljs 3.4 reventaba al escribir validaciones de datos sobre rangos largos ("Cannot set properties of
 * undefined (setting 'marked')") y por eso había un parche global (utils/patchExcelJS.js). Con exceljs 4 ya
 * no hace falta: este test fija ese comportamiento con la misma forma de la plantilla de productos.
 */
const ExcelJS = require('exceljs');

describe('exceljs 4: plantilla con validaciones sobre columnas completas (sin parche)', () => {
    async function generarPlantilla() {
        const wb = new ExcelJS.Workbook();
        const table = wb.addWorksheet('Productos');
        table.columns = [
            { header: 'codigo', key: 'codigo', width: 18 },
            { header: 'nombre', key: 'nombre', width: 32 },
            { header: 'categoria', key: 'categoria', width: 20 },
            { header: 'precio_unidad', key: 'precio_unidad', width: 14 }
        ];
        table.addRow({ codigo: 'P001', nombre: 'CocaCola 400ml', categoria: 'Bebidas', precio_unidad: 2500 });
        for (const col of ['A', 'B', 'C']) {
            table.dataValidations.add(`${col}2:${col}1048576`, {
                type: 'textLength',
                operator: 'greaterThan',
                formulae: [0],
                allowBlank: false,
                showErrorMessage: true,
                errorTitle: 'Requerido',
                error: 'Ingrese un valor'
            });
        }
        table.dataValidations.add('D2:D1048576', {
            type: 'decimal',
            operator: 'greaterThanOrEqual',
            formulae: [0],
            allowBlank: true,
            showErrorMessage: true,
            errorTitle: 'Precio inválido',
            error: 'Debe ser número ≥ 0 (use punto decimal)'
        });
        return wb.xlsx.writeBuffer();
    }

    test('se escribe sin reventar y el archivo guarda 4 validaciones como rangos compactos', async () => {
        const buf = await generarPlantilla();
        expect(buf.length).toBeGreaterThan(1000);

        const JSZip = require('jszip');
        const zip = await JSZip.loadAsync(buf);
        const xml = await zip.file('xl/worksheets/sheet1.xml').async('string');
        const bloque = xml.match(/<dataValidations[\s\S]*?<\/dataValidations>/)[0];
        expect(bloque).toContain('count="4"');
        ['A2:A1048576', 'B2:B1048576', 'C2:C1048576', 'D2:D1048576'].forEach(r =>
            expect(bloque).toContain(`sqref="${r}"`)
        );
    }, 30000);

    test('el archivo generado se puede volver a leer (mismo camino que la importación)', async () => {
        const buf = await generarPlantilla();
        const wb = new ExcelJS.Workbook();
        await wb.xlsx.load(buf);
        const ws = wb.getWorksheet('Productos');
        expect(ws.getRow(1).getCell(1).value).toBe('codigo');
        expect(ws.getRow(2).getCell(2).value).toBe('CocaCola 400ml');
        expect(ws.getRow(2).getCell(4).value).toBe(2500);
    }, 30000);
});
