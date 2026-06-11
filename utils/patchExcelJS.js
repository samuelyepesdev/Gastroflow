/**
 * Patch to fix exceljs bug where data validations on ranges crash when writing
 * because dvMap[otherAddress] is undefined.
 */
try {
    const DataValidationsXform = require('exceljs/lib/xlsx/xform/sheet/data-validations-xform');
    if (DataValidationsXform && !DataValidationsXform.prototype._patchedForMarked) {
        const _ = require('exceljs/lib/utils/under-dash');
        const utils = require('exceljs/lib/utils/utils');
        const colCache = require('exceljs/lib/utils/col-cache');

        function patchedOptimiseDataValidations(model) {
            const dvList = _.map(model, (dataValidation, address) => ({
                address,
                dataValidation,
                marked: false
            })).sort((a, b) => _.strcmp(a.address, b.address));
            const dvMap = _.keyBy(dvList, 'address');
            const matchCol = (addr, height, col) => {
                for (let i = 0; i < height; i++) {
                    const otherAddress = colCache.encodeAddress(addr.row + i, col);
                    if (!model[otherAddress] || !_.isEqual(model[addr.address], model[otherAddress])) {
                        return false;
                    }
                }
                return true;
            };
            return dvList
                .map(dv => {
                    if (!dv.marked) {
                        const addr = colCache.decodeAddress(dv.address);

                        let height = 1;
                        let otherAddress = colCache.encodeAddress(addr.row + height, addr.col);
                        while (model[otherAddress] && _.isEqual(dv.dataValidation, model[otherAddress])) {
                            height++;
                            otherAddress = colCache.encodeAddress(addr.row + height, addr.col);
                        }

                        let width = 1;
                        while (matchCol(addr, height, addr.col + width)) {
                            width++;
                        }

                        for (let i = 0; i < height; i++) {
                            for (let j = 0; j < width; j++) {
                                otherAddress = colCache.encodeAddress(addr.row + i, addr.col + j);
                                // FIX: Check if dvMap[otherAddress] is defined before setting marked
                                if (dvMap[otherAddress]) {
                                    dvMap[otherAddress].marked = true;
                                }
                            }
                        }

                        if (height > 1 || width > 1) {
                            const bottom = addr.row + (height - 1);
                            const right = addr.col + (width - 1);
                            return {
                                ...dv.dataValidation,
                                sqref: `${dv.address}:${colCache.encodeAddress(bottom, right)}`
                            };
                        }
                        return {
                            ...dv.dataValidation,
                            sqref: dv.address
                        };
                    }
                    return null;
                })
                .filter(Boolean);
        }

        DataValidationsXform.prototype.render = function (xmlStream, model) {
            const optimizedModel = patchedOptimiseDataValidations(model);
            if (optimizedModel.length) {
                xmlStream.openNode('dataValidations', { count: optimizedModel.length });

                optimizedModel.forEach(value => {
                    xmlStream.openNode('dataValidation');

                    if (value.type !== 'any') {
                        xmlStream.addAttribute('type', value.type);

                        if (value.operator && value.type !== 'list' && value.operator !== 'between') {
                            xmlStream.addAttribute('operator', value.operator);
                        }
                        if (value.allowBlank) {
                            xmlStream.addAttribute('allowBlank', '1');
                        }
                    }
                    if (value.showInputMessage) {
                        xmlStream.addAttribute('showInputMessage', '1');
                    }
                    if (value.promptTitle) {
                        xmlStream.addAttribute('promptTitle', value.promptTitle);
                    }
                    if (value.prompt) {
                        xmlStream.addAttribute('prompt', value.prompt);
                    }
                    if (value.showErrorMessage) {
                        xmlStream.addAttribute('showErrorMessage', '1');
                    }
                    if (value.errorStyle) {
                        xmlStream.addAttribute('errorStyle', value.errorStyle);
                    }
                    if (value.errorTitle) {
                        xmlStream.addAttribute('errorTitle', value.errorTitle);
                    }
                    if (value.error) {
                        xmlStream.addAttribute('error', value.error);
                    }
                    xmlStream.addAttribute('sqref', value.sqref);
                    (value.formulae || []).forEach((formula, index) => {
                        xmlStream.openNode(`formula${index + 1}`);
                        if (value.type === 'date') {
                            xmlStream.writeText(utils.dateToExcel(new Date(formula)));
                        } else {
                            xmlStream.writeText(formula);
                        }
                        xmlStream.closeNode();
                    });
                    xmlStream.closeNode();
                });
                xmlStream.closeNode();
            }
        };

        DataValidationsXform.prototype._patchedForMarked = true;
    }
} catch (error) {
    console.error('Failed to apply ExcelJS data validation patch:', error);
}
