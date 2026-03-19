/**
 * @NApiVersion 2.1
 * @NScriptType ClientScript
 */
define(['N/search', 'N/log'], function (search, log) {

    // ===================== CONFIG: UPDATE THESE IDS ===================== //
    var CONFIG = {
        sublistId: 'inventory',                 // Inventory Adjustment line sublist id
        lineFields: {
            location: 'location',               // standard
            qty: 'adjustqtyby',                 // standard
            unitCost: 'unitcost',               // Est. Unit Cost
            amount: 'custcol5',                 // custom Amount (base + tax)
            taxGroup: 'custcol_ste_tax_group',  // custom column: Use Tax Group
            taxRate: 'custcol3',                // custom column: Use Tax Rate (percent)
            taxAmount: 'custcol4',              // custom column: Use Tax Amount
            nonTax: 'custcol_nontaxable'        // custom column: Non Tax Line
        },
        headerFields: {
            estimatedTotal: 'custbody_estimated_total_value' // body field to update
        },
        locationTaxGroupField: 'custrecord_ns_pos_taxcode_for_location', // location body field
        ste: {
            taxGroupLineRecord: 'customrecord_ste_tg_line',
            tgLineTaxGroupField: 'custrecord_ste_tg_line_tax_group',
            tgLineTaxCodeField: 'custrecord_ste_tg_line_tax_code',
            taxRateRecord: 'customrecord_ste_taxrate',
            taxRateTaxCodeField: 'custrecord_ste_taxrate_taxcode',
            taxRateValueField: 'custrecord_ste_taxrate_rate'
        }
    };
    // =================================================================== //

    // Simple caches
    var cache = {
        locationToTaxGroup: {}, // locationId -> taxGroupId
        taxGroupToRate: {}      // taxGroupId -> rate
    };

    // -------------------------- EVENT HANDLERS -------------------------- //

    function fieldChanged(context) {
        try {
            var rec = context.currentRecord;

            if (context.sublistId !== CONFIG.sublistId) {
                return;
            }

            // When LOCATION changes
            if (context.fieldId === CONFIG.lineFields.location) {
                applyLocationTaxGroup(rec);
                recalcCurrentLine(rec);
                recalcHeaderTotal(rec);
                return;
            }

            // Recalc on key fields changing
            var recalcFields = [
                CONFIG.lineFields.qty,
                CONFIG.lineFields.unitCost,
                CONFIG.lineFields.taxGroup,
                CONFIG.lineFields.taxRate,
                CONFIG.lineFields.nonTax
            ];

            if (recalcFields.indexOf(context.fieldId) > -1) {
                recalcCurrentLine(rec);
                recalcHeaderTotal(rec);
            }

        } catch (e) {
            log.error('fieldChanged error', e);
        }
    }

    /**
     * Called when user tries to leave a line.
     * We recalc the current line and header before allowing it.
     */
    function validateLine(context) {
        try {
            if (context.sublistId !== CONFIG.sublistId) {
                return true;
            }

            var rec = context.currentRecord;
            recalcCurrentLine(rec);   // ensure current line is up to date
            recalcHeaderTotal(rec);   // then update header total

            return true;
        } catch (e) {
            log.error('validateLine error', e);
            return true; // don't block user if something small goes wrong
        }
    }

    /**
     * Fires after a line is added, edited, or removed.
     * Perfect place to re-sum the header.
     */
    function sublistChanged(context) {
        try {
            if (context.sublistId !== CONFIG.sublistId) {
                return;
            }
            var rec = context.currentRecord;
            recalcHeaderTotal(rec);
        } catch (e) {
            log.error('sublistChanged error', e);
        }
    }

    // ---------------------------- CORE LOGIC ---------------------------- //

    /**
     * When Location changes, pull Tax Group from Location record to line.
     */
    function applyLocationTaxGroup(rec) {
        var sublistId = CONFIG.sublistId;
        var f = CONFIG.lineFields;

        var locationId = rec.getCurrentSublistValue({
            sublistId: sublistId,
            fieldId: f.location
        });

        // Clear if no location
        if (!locationId) {
            rec.setCurrentSublistValue({
                sublistId: sublistId,
                fieldId: f.taxGroup,
                value: '',
                ignoreFieldChange: true
            });
            return;
        }

        var taxGroupId = cache.locationToTaxGroup[locationId];

        if (!taxGroupId) {
            // lookupFields on Location
            var locData = search.lookupFields({
                type: 'location',
                id: locationId,
                columns: [CONFIG.locationTaxGroupField]
            });

            var tgVal = locData[CONFIG.locationTaxGroupField];
            if (Array.isArray(tgVal) && tgVal.length) {
                taxGroupId = tgVal[0].value;
            } else if (typeof tgVal === 'string') {
                taxGroupId = tgVal;
            }

            cache.locationToTaxGroup[locationId] = taxGroupId || '';
        }

        rec.setCurrentSublistValue({
            sublistId: sublistId,
            fieldId: f.taxGroup,
            value: taxGroupId || '',
            ignoreFieldChange: true
        });
    }

    /**
     * Calculate tax rate (via STE tables), tax amount and total amount
     * for the CURRENT line.
     */
    function recalcCurrentLine(rec) {
        var sublistId = CONFIG.sublistId;
        var f = CONFIG.lineFields;


        var taxable = rec.getCurrentSublistValue({
              sublistId: sublistId,
              fieldId: f.nonTax
        });


      var qty = parseFloat(rec.getCurrentSublistValue({
            sublistId: sublistId,
            fieldId: f.qty
        })) || 0;

        var unitCost = parseFloat(rec.getCurrentSublistValue({
            sublistId: sublistId,
            fieldId: f.unitCost
        })) || 0;

        if (taxable) {
          rec.setCurrentSublistValue({
            sublistId: sublistId,
            fieldId: f.taxRate,
            value: 0,
            ignoreFieldChange: true
          });
          rec.setCurrentSublistValue({
            sublistId: sublistId,
            fieldId: f.taxAmount,
            value: 0,
            ignoreFieldChange: true
          });

          var lineAmount = round(qty * unitCost, 2);
          rec.setCurrentSublistValue({
            sublistId: sublistId,
            fieldId: f.amount,
            value: lineAmount,
            ignoreFieldChange: true
          });
          
          return;
        }

        var taxGroupId = rec.getCurrentSublistValue({
            sublistId: sublistId,
            fieldId: f.taxGroup
        });

        // 1) Get total tax rate (%) – STE returns decimal, e.g. 0.0725
        var totalRate = 0;
        if (taxGroupId) {
            totalRate = getTaxRateFromTaxGroup(taxGroupId);
            totalRate = Number(totalRate * 100); // convert to percent (7.25)
        }

        // If user manually typed a rate, allow overriding
        var manualRate = rec.getCurrentSublistValue({
            sublistId: sublistId,
            fieldId: f.taxRate
        });
        if (manualRate !== '' && manualRate !== null && !isNaN(manualRate)) {
            totalRate = parseFloat(manualRate) || 0;
        }

        // 2) Calculate base, tax, total
        var baseAmount = qty * unitCost; // can be negative if qty negative
        var taxAmount = round(baseAmount * (totalRate / 100), 2);
        var lineAmount = round(baseAmount + taxAmount, 2);

        log.debug('line calc', { qty: qty, unitCost: unitCost, totalRate: totalRate, taxAmount: taxAmount, lineAmount: lineAmount });

        // 3) Push back to line
        rec.setCurrentSublistValue({
            sublistId: sublistId,
            fieldId: f.taxRate,
            value: totalRate ? totalRate.toFixed(2) : '',
            ignoreFieldChange: true
        });

        rec.setCurrentSublistValue({
            sublistId: sublistId,
            fieldId: f.taxAmount,
            value: taxAmount,
            ignoreFieldChange: true
        });

        rec.setCurrentSublistValue({
            sublistId: sublistId,
            fieldId: f.amount,
            value: lineAmount,
            ignoreFieldChange: true
        });
    }

    /**
     * Sum all line amounts (base + tax) and push to header estimatedtotalvalue.
     * Works even when one line is "current" in edit mode.
     */
    function recalcHeaderTotal(rec) {
        var sublistId = CONFIG.sublistId;
        var f = CONFIG.lineFields;

        var lineCount = rec.getLineCount({ sublistId: sublistId });
        var total = 0;

        var currentIndex = rec.getCurrentSublistIndex
            ? rec.getCurrentSublistIndex({ sublistId: sublistId })
            : -1;

        for (var i = 0; i < lineCount; i++) {
            var lineAmount;


          

            if (i === currentIndex) {
                // use current line value (not yet committed)
                lineAmount = parseFloat(rec.getCurrentSublistValue({
                    sublistId: sublistId,
                    fieldId: f.amount
                })) || 0;
            } else {
                lineAmount = parseFloat(rec.getSublistValue({
                    sublistId: sublistId,
                    fieldId: f.amount,
                    line: i
                })) || 0;
            }

            total += lineAmount;
        }

        rec.setValue({
            fieldId: CONFIG.headerFields.estimatedTotal,
            value: round(total, 2)
        });
    }

    /**
     * Get total tax rate (decimal, e.g. 0.0725) for a STE Tax Group.
     */
    function getTaxRateFromTaxGroup(taxGroupId) {
        if (!taxGroupId) return 0;

        if (cache.taxGroupToRate[taxGroupId] != null) {
            return cache.taxGroupToRate[taxGroupId];
        }

        var ste = CONFIG.ste;

        // 1) Get list of Tax Codes for this Tax Group
        var taxCodeIds = [];

        var tgLineSearch = search.create({
            type: ste.taxGroupLineRecord, // customrecord_ste_tg_line
            filters: [
                [ste.tgLineTaxGroupField, 'anyof', taxGroupId]
            ],
            columns: [
                search.createColumn({
                    name: ste.tgLineTaxCodeField // custrecord_ste_tg_line_tax_code
                })
            ]
        });

        tgLineSearch.run().each(function (result) {
            var codeId = result.getValue({ name: ste.tgLineTaxCodeField });
            if (codeId) {
                taxCodeIds.push(codeId);
            }
            return true;
        });

        if (!taxCodeIds.length) {
            cache.taxGroupToRate[taxGroupId] = 0;
            return 0;
        }

        // 2) Sum the rates for those Tax Codes
        var totalRate = 0;

        var rateSearch = search.create({
            type: ste.taxRateRecord, // customrecord_ste_taxrate
            filters: [
                [ste.taxRateTaxCodeField, 'anyof', taxCodeIds]
            ],
            columns: [
                search.createColumn({
                    name: ste.taxRateValueField,
                    summary: search.Summary.SUM
                })
            ]
        });

        rateSearch.run().each(function (result) {
            var v = result.getValue({
                name: ste.taxRateValueField,
                summary: search.Summary.SUM
            }) || 0;
            totalRate = parseFloat(v) || 0;
            return false; // summary row, only once
        });

        cache.taxGroupToRate[taxGroupId] = totalRate;
        return totalRate;
    }

    function round(num, decimals) {
        var d = (typeof decimals === 'number') ? decimals : 2;
        var factor = Math.pow(10, d);
        return Math.round(num * factor) / factor;
    }

    return {
        fieldChanged: fieldChanged,
        validateLine: validateLine,
        sublistChanged: sublistChanged
    };
});
