/**
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 */
define(['N/ui/serverWidget', 'N/search', 'N/log', 'N/record'],
    function (ui, search, log, record) {

        // ================ CONFIG: KEEP IDS IN SYNC WITH CLIENT ================ //
        var CONFIG = {
            sublistId: 'inventory',                 // Inventory Adjustment line sublist id
            lineFields: {
                location: 'location',               // standard
                qty: 'adjustqtyby',                 // standard
                unitCost: 'unitcost',               // Est. Unit Cost
                amount: 'custcol5',                 // Amount (base + tax)
                taxGroup: 'custcol_ste_tax_group',  // custom column: Use Tax Group
                taxRate: 'custcol3',                // custom column: Use Tax Rate (percent)
                taxAmount: 'custcol4',              // custom column: Use Tax Amount
                nonTax: 'custcol_nontaxable'        // custom column: Non Tax Line
            },
            headerFields: {
                estimatedTotal: 'custbody_estimated_total_value',   // header total box
                estimatedFinalTotal: 'custbody_adjustment_final_amount'
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
        // ==================================================================== //

        var cache = {
            locationToTaxGroup: {},
            taxGroupToRate: {}
        };

        // --------------------------- BEFORE SUBMIT --------------------------- //

        function beforeSubmit(context) {
            try {
                var rec = context.newRecord;
                var sublistId = CONFIG.sublistId;
                var f = CONFIG.lineFields;

                var lineCount = rec.getLineCount({ sublistId: sublistId });
                if (!lineCount) return;

                var subtotal = 0;      // <<< NEW
                var totalTax = 0;      // <<< NEW
                var totalAmount = 0;   // <<< NEW

                for (var i = 0; i < lineCount; i++) {

                   var taxable = rec.getSublistValue({
                        sublistId: sublistId,
                        fieldId: f.nonTax,
                        line: i
                    });

                  
                  
                    var locationId = rec.getSublistValue({
                        sublistId: sublistId,
                        fieldId: f.location,
                        line: i
                    });

                    // ensure Tax Group is populated from Location if blank
                    var tgOnLine = rec.getSublistValue({
                        sublistId: sublistId,
                        fieldId: f.taxGroup,
                        line: i
                    });

                    if (!tgOnLine && locationId) {
                        var tgId = getTaxGroupFromLocation(locationId);
                        if (tgId) {
                            rec.setSublistValue({
                                sublistId: sublistId,
                                fieldId: f.taxGroup,
                                line: i,
                                value: tgId
                            });
                            tgOnLine = tgId;
                        }
                    }

                    // ---- calculate rate / tax / amount ---- //
                    var qty = parseFloat(rec.getSublistValue({
                        sublistId: sublistId,
                        fieldId: f.qty,
                        line: i
                    })) || 0;

                    var unitCost = parseFloat(rec.getSublistValue({
                        sublistId: sublistId,
                        fieldId: f.unitCost,
                        line: i
                    })) || 0;

                    var totalRate = 0;
                    if (tgOnLine) {
                        totalRate = getTaxRateFromTaxGroup(tgOnLine); // decimal, e.g. 0.0725
                        totalRate = Number(totalRate * 100);           // percent, e.g. 7.25
                    }

                    // If tax rate is already set (e.g. manually), honor it
                    var existingRate = rec.getSublistValue({
                        sublistId: sublistId,
                        fieldId: f.taxRate,
                        line: i
                    });
                    if (existingRate !== '' && existingRate !== null && !isNaN(existingRate)) {
                        totalRate = parseFloat(existingRate) || 0;
                    }

                  

                    var baseAmt = qty * unitCost;
                    var taxAmt  = round(baseAmt * (totalRate / 100), 2);
                    var lineAmt = round(baseAmt + taxAmt, 2);

                    if (taxable) {
                      taxAmt = 0;
                      lineAmt = baseAmt;
                    }
                  

                    rec.setSublistValue({
                        sublistId: sublistId,
                        fieldId: f.taxRate,
                        line: i,
                        value: totalRate ? totalRate.toFixed(2) : ''
                    });

                    rec.setSublistValue({
                        sublistId: sublistId,
                        fieldId: f.taxAmount,
                        line: i,
                        value: taxAmt
                    });

                    rec.setSublistValue({
                        sublistId: sublistId,
                        fieldId: f.amount,
                        line: i,
                        value: lineAmt
                    });

                    // --- accumulate for header & summary ---  <<< NEW
                    subtotal    += baseAmt;
                    totalTax    += taxAmt;
                    totalAmount += lineAmt;
                }

                // write header estimated total = sum of line amounts (incl. tax)  <<< NEW
                rec.setValue({
                    fieldId: CONFIG.headerFields.estimatedTotal,
                    value: round(totalAmount, 2)
                });
              
                rec.setValue({
                    fieldId: CONFIG.headerFields.estimatedFinalTotal,
                    value: Math.abs(round(totalAmount, 2))
                });

            } catch (e) {
                log.error('beforeSubmit error', e);
            }
        }

        // ---------------------------- BEFORE LOAD --------------------------- //

        function beforeLoad(context) {
            try {
                if (context.type !== context.UserEventType.VIEW) return;

                var rec = context.newRecord;
                var form = context.form;
                var sublistId = CONFIG.sublistId;
                var f = CONFIG.lineFields;

                var lineCount = rec.getLineCount({ sublistId: sublistId });
                if (!lineCount) return;

                var subtotal = 0;
                var totalTax = 0;
                var totalAmount = 0;

                var taxByGroupName = {};

                for (var i = 0; i < lineCount; i++) {

                  var taxable = rec.getSublistValue({
                        sublistId: sublistId,
                        fieldId: f.nonTax,
                        line: i
                    });

                  
                  
                    var qty = parseFloat(rec.getSublistValue({
                        sublistId: sublistId,
                        fieldId: f.qty,
                        line: i
                    })) || 0;

                    var unitCost = parseFloat(rec.getSublistValue({
                        sublistId: sublistId,
                        fieldId: f.unitCost,
                        line: i
                    })) || 0;

                    var baseAmt = qty * unitCost;
                    subtotal += baseAmt;

                    var taxAmt = parseFloat(rec.getSublistValue({
                        sublistId: sublistId,
                        fieldId: f.taxAmount,
                        line: i
                    })) || 0;
                    if (taxable) taxAmt = 0;

                    totalTax += taxAmt;

                    var lineAmt = parseFloat(rec.getSublistValue({
                        sublistId: sublistId,
                        fieldId: f.amount,
                        line: i
                    })) || 0;

                    totalAmount += lineAmt;

                    var groupName = rec.getSublistText({
                        sublistId: sublistId,
                        fieldId: f.taxGroup,
                        line: i
                    });
                    if (groupName) {
                        taxByGroupName[groupName] = (taxByGroupName[groupName] || 0) + taxAmt;
                    }
                }

                if (!subtotal && !totalTax && !totalAmount) return;

                // ---------- SUMMARY BOX HTML (unchanged except data) ----------
                var html = [];

                html.push('<style>');
                html.push('#steSummaryBoxWrapper{');
                html.push('  width:230px;');
                html.push('  font-family: Arial, sans-serif;');
                html.push('}');
                html.push('#steSummaryBox{');
                html.push('  border:1px solid #d3d3d3;');
                html.push('  background:#f5f5f5;');
                html.push('}');
                html.push('#steSummaryHeader{');
                html.push('  background:#4b6983;');
                html.push('  color:#ffffff;');
                html.push('  padding:4px 8px;');
                html.push('  font-weight:bold;');
                html.push('  font-size:11px;');
                html.push('}');
                html.push('#steSummaryTable{');
                html.push('  width:100%;');
                html.push('  border-collapse:collapse;');
                html.push('}');
                html.push('#steSummaryTable td{');
                html.push('  padding:3px 8px;');
                html.push('  font-size:11px;');
                html.push('}');
                html.push('.ste-summary-label{ color:#555555; }');
                html.push('.ste-summary-value{ text-align:right; }');
                html.push('.ste-summary-total-row td{');
                html.push('  border-top:1px solid #cccccc;');
                html.push('  font-weight:bold;');
                html.push('}');
                html.push('</style>');

                html.push('<div id="steSummaryBoxWrapper">');
                html.push('  <div id="steSummaryBox">');
                html.push('    <div id="steSummaryHeader">Summary</div>');
                html.push('    <table id="steSummaryTable">');

                html.push('      <tr>');
                html.push('        <td class="ste-summary-label">SUBTOTAL</td>');
                html.push('        <td class="ste-summary-value">' + formatCurrency(subtotal) + '</td>');
                html.push('      </tr>');

                html.push('      <tr>');
                html.push('        <td class="ste-summary-label">TAX TOTAL</td>');
                html.push('        <td class="ste-summary-value">' + formatCurrency(totalTax) + '</td>');
                html.push('      </tr>');

                html.push('      <tr class="ste-summary-total-row">');
                html.push('        <td class="ste-summary-label">TOTAL</td>');
                html.push('        <td class="ste-summary-value">' + formatCurrency(totalAmount) + '</td>');
                html.push('      </tr>');

                html.push('    </table>');
                html.push('  </div>');
                html.push('</div>');

                // JS: add as NEW COLUMN on same row as ESTIMATED TOTAL VALUE
                html.push('<script>');
                html.push('(function(){');
                html.push('  function placeSteSummary(){');
                html.push('    var box = document.getElementById("steSummaryBoxWrapper");');
                html.push('    if(!box) return;');

                html.push('    var lbl = document.getElementById("estimatedtotalvalue_fs_lbl");');
                html.push('    if(!lbl){');
                html.push('      var cands = document.querySelectorAll("[id$=\'_fs_lbl\']");');
                html.push('      for(var i=0;i<cands.length;i++){');
                html.push('        var t = (cands[i].textContent || "").toUpperCase();');
                html.push('        if(t.indexOf("ESTIMATED TOTAL VALUE") > -1){');
                html.push('          lbl = cands[i];');
                html.push('          break;');
                html.push('        }');
                html.push('      }');
                html.push('    }');
                html.push('    if(!lbl) return;');

                html.push('    var row = lbl.closest("tr");');
                html.push('    if(!row){');
                html.push('      row = lbl.parentNode;');
                html.push('    }');
                html.push('    if(!row) return;');

                html.push('    // create a new cell as a new column on this row');
                html.push('    var cell = document.createElement("td");');
                html.push('    cell.colSpan = 2;'); // label+value width
                html.push('    cell.style.verticalAlign = "top";');
                html.push('    cell.style.textAlign = "right";');
                html.push('    cell.appendChild(box);');

                html.push('    row.appendChild(cell);');
                html.push('  }');

                html.push('  if(document.readyState === "complete" || document.readyState === "interactive"){');
                html.push('    setTimeout(placeSteSummary, 0);');
                html.push('  } else {');
                html.push('    document.addEventListener("DOMContentLoaded", placeSteSummary);');
                html.push('  }');
                html.push('})();');
                html.push('</script>');

                var grp = form.addFieldGroup({
                    id: 'custpage_ste_tax_summary_grp',
                    label: 'Summary'
                });

                var fld = form.addField({
                    id: 'custpage_ste_tax_summary_html',
                    label: ' ',
                    type: ui.FieldType.INLINEHTML,
                    container: 'custpage_ste_tax_summary_grp'
                });

                fld.defaultValue = html.join('');

            } catch (e) {
                log.error('beforeLoad error', e);
            }
        }

        // ---------------------------- AFTER SUBMIT --------------------------- //

        function afterSubmit(context) {
        try {
            if (context.type === context.UserEventType.DELETE) return;

            var iaRec = context.newRecord;
            var iaId  = iaRec.id;

            // >>> set the new cost value you want to push to FAM assets
            var NEW_COST = iaRec.getValue('custbody_estimated_total_value'); 

            // Search FAM assets linked to this IA whose current cost != NEW_COST
            var assetSearch = search.create({
                type: 'customrecord_ncfar_asset',
                filters: [
                    ['custrecord_inventory_adjustment_record', 'anyof', iaId],
                    'AND',
                    ['custrecord_assetcost', 'notequalto', NEW_COST]
                ],
                columns: [
                    search.createColumn({ name: 'internalid' })
                ]
            });

            var count = assetSearch.runPaged().count;
            log.debug('FAM assets to update', count);

            if (!count) {
                return;
            }

            assetSearch.run().each(function (result) {
                var assetId = result.getValue({ name: 'internalid' });

                log.debug('Updating asset', assetId);

                record.submitFields({
                    type: 'customrecord_ncfar_asset',
                    id: assetId,
                    values: {
                        custrecord_assetcost: Math.abs(NEW_COST)
                    },
                    options: {
                        enablesourcing: false,
                        ignoreMandatoryFields: true
                    }
                });

                return true; // continue to next asset
            });

        } catch (e) {
            log.error('afterSubmit error', e);
        }
    }

        // ---------------------------- HELPERS ---------------------------- //

        function getTaxGroupFromLocation(locationId) {
            if (!locationId) return '';

            if (cache.locationToTaxGroup[locationId] != null) {
                return cache.locationToTaxGroup[locationId];
            }

            var locData = search.lookupFields({
                type: 'location',
                id: locationId,
                columns: [CONFIG.locationTaxGroupField]
            });

            var tgVal = locData[CONFIG.locationTaxGroupField];
            var tgId = '';

            if (Array.isArray(tgVal) && tgVal.length) {
                tgId = tgVal[0].value;
            } else if (typeof tgVal === 'string') {
                tgId = tgVal;
            }

            cache.locationToTaxGroup[locationId] = tgId || '';
            return tgId || '';
        }

        function getTaxRateFromTaxGroup(taxGroupId) {
            if (!taxGroupId) return 0;

            if (cache.taxGroupToRate[taxGroupId] != null) {
                return cache.taxGroupToRate[taxGroupId];
            }

            var ste = CONFIG.ste;
            var taxCodeIds = [];

            var tgSearch = search.create({
                type: ste.taxGroupLineRecord,
                filters: [
                    [ste.tgLineTaxGroupField, 'anyof', taxGroupId]
                ],
                columns: [
                    search.createColumn({ name: ste.tgLineTaxCodeField })
                ]
            });

            tgSearch.run().each(function (res) {
                var codeId = res.getValue({ name: ste.tgLineTaxCodeField });
                if (codeId) taxCodeIds.push(codeId);
                return true;
            });

            if (!taxCodeIds.length) {
                cache.taxGroupToRate[taxGroupId] = 0;
                return 0;
            }

            var totalRate = 0;

            var rateSearch = search.create({
                type: ste.taxRateRecord,
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

            rateSearch.run().each(function (res) {
                var v = res.getValue({
                    name: ste.taxRateValueField,
                    summary: search.Summary.SUM
                }) || 0;
                totalRate = parseFloat(v) || 0;
                return false;
            });

            cache.taxGroupToRate[taxGroupId] = totalRate;
            return totalRate;
        }

        function round(v, d) {
            var factor = Math.pow(10, d || 2);
            return Math.round(v * factor) / factor;
        }

        function formatCurrency(num) {
    var n = parseFloat(num) || 0;
    var parts = n.toFixed(2).split(".");
    var intPart = parts[0];
    var decPart = parts[1];

    // Handle negative numbers
    var isNegative = false;
    if (intPart.startsWith("-")) {
        isNegative = true;
        intPart = intPart.substring(1);
    }

    // Apply Indian comma formatting
    if (intPart.length > 3) {
        var last3 = intPart.slice(-3);
        var rest = intPart.slice(0, -3);
        rest = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",");
        intPart = rest + "," + last3;
    }

    return (isNegative ? "-" : "") + intPart + "." + decPart;
}


        function encodeHtml(str) {
            if (!str) return '';
            return String(str)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&quot;')
                .replace(/'/g, '&#39;');
        }

        return {
            beforeSubmit: beforeSubmit,
            beforeLoad:  beforeLoad,
           afterSubmit: afterSubmit
        };
    });
