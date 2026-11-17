/**
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 */
define(['N/ui/serverWidget', 'N/search', 'N/log', 'N/record', 'N/query', 'N/runtime'],
    function (ui, search, log, record, query, runtime) {

        // ================ CONFIG: KEEP IDS IN SYNC WITH CLIENT ================ //
        var CONFIG = {
            sublistId: 'inventory',                 // Inventory Adjustment line sublist id
            lineFields: {
                location: 'location',               // standard
                qty: 'adjustqtyby',                 // standard
                unitCost: 'unitcost',               // Est. Unit Cost
                amount: 'custcol5',                 // Amount (base + tax)
                taxGroup: 'custcol_ste_tax_group',  // custom column: Use Tax Group
                overrideRate: 'custcol_bc_override_flag',
                taxRate: 'custcol3',                // custom column: Use Tax Rate (percent)
                taxAmount: 'custcol4',              // custom column: Use Tax Amount
                nonTax: 'custcol_nontaxable',        // custom column: Non Tax Line
                taxBreakdown: 'custcol_bc_tax_object' 
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
                taxRateValueField: 'custrecord_ste_taxrate_rate',
                taxRateAuthorityField: 'custrecord_ste_taxcode_imposeauthority',
                taxRateAuthorityJoin: 'CUSTRECORD_STE_TAXRATE_TAXCODE',
                taxRateStateField: 'custrecord_ste_taxcode_state'
            }
        };
        // ==================================================================== //

        var cache = {
            locationToTaxGroup: {},
            taxGroupToRate: {},
            taxGroupToAuthorityRates: {}
        };

        // --------------------------- BEFORE SUBMIT --------------------------- //

        function beforeSubmit(context) {
            try {
                var rec = context.newRecord;
                var sublistId = CONFIG.sublistId;
                var f = CONFIG.lineFields;

                var lineCount = rec.getLineCount({ sublistId: sublistId });
                log.debug('lineCount', lineCount)
                if (!lineCount) return;

                var jobIssue = isJobIssue(rec);
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
                        log.debug('tgId', tgId)
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
                        totalRate = Number((totalRate * 100).toFixed(10));           // percent, e.g. 7.25
                        log.debug('totalRate', totalRate)
                    }

                    var overrideFlag = valueAt(rec, f.overrideRate, i);
                    var useOverride = overrideFlag === true || overrideFlag === 'T';
                    var hasManualRate = false;
                    if (useOverride) {
                        var input = valueAt(rec, f.taxRate, i);
                        var rateText = String(input == null ? '' : input).trim().replace(/%$/, '').trim();
                        hasManualRate = rateText !== '' && Number.isFinite(Number(rateText));
                        if (hasManualRate) totalRate = Number(rateText);
                    }

                    var baseAmt = qty * unitCost;
                    

                    // NEW — per-authority breakdown, built off the tax group lookup only (not the manual override)
                    var authorityBreakdown = [];
                    if (tgOnLine && cache.taxGroupToAuthorityRates[tgOnLine]) {
                        authorityBreakdown = cache.taxGroupToAuthorityRates[tgOnLine].map(function (ar) {
                            return {
                                authorityId: ar.authorityId,
                                name: ar.name,
                                state: ar.state,
                                rate: ar.rate*100,
                                amount: baseAmt * (ar.rate)   // not rounded, per your #2
                            };
                        });
                    }

                     log.debug('authorityBreakdown', authorityBreakdown)

                  

                    var baseAmt = qty * unitCost;
                    var taxAmt  = round(baseAmt * (totalRate / 100), 2);
                    var lineAmt = round(baseAmt + taxAmt, 2);

                    if (taxable) {
                      taxAmt = 0;
                      lineAmt = baseAmt;
                      for (xy = 0; xy < authorityBreakdown.length; xy++) {
                        authorityBreakdown[xy].amount = 0;
                      }
                    }
                  

                    rec.setSublistValue({
                        sublistId: sublistId,
                        fieldId: f.taxRate,
                        line: i,
                        value: hasManualRate || totalRate ? totalRate : ''
                    });

                    rec.setSublistValue({
                        sublistId: sublistId,
                        fieldId: f.taxAmount,
                        line: i,
                        value: taxAmt
                    });

                    if (jobIssue) lineAmt = Math.abs(lineAmt);
                    rec.setSublistValue({
                        sublistId: sublistId,
                        fieldId: f.amount,
                        line: i,
                        value: lineAmt
                    });
                  
                    rec.setSublistValue({
                        sublistId: sublistId,
                        fieldId: f.taxBreakdown,
                        line: i,
                        value: JSON.stringify(authorityBreakdown)
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

                var jobWithdrawal = isJobIssue(rec);
                var estimatedSummary = false;
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

                if (jobWithdrawal) {
                    var costs = jobCosts(rec);
                    estimatedSummary = costs.estimated;
                    subtotal = costs.materials;
                    totalTax = costs.tax;
                    totalAmount = costs.total;
                    showJobAmounts(form, costs);

                }
                if (!subtotal && !totalTax && !totalAmount && !jobWithdrawal) return;

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
                html.push('    <div id="steSummaryHeader">' + (estimatedSummary ? 'Summary (estimated)' : 'Summary') + '</div>');
                html.push('    <table id="steSummaryTable">');

                html.push('      <tr>');
                html.push('        <td class="ste-summary-label">' + (jobWithdrawal ? 'Materials Cost' : 'SUBTOTAL') + '</td>');
                html.push('        <td class="ste-summary-value">' + formatCurrency(subtotal) + '</td>');
                html.push('      </tr>');

                html.push('      <tr>');
                html.push('        <td class="ste-summary-label">' + (jobWithdrawal ? 'Use Tax Total' : 'TAX TOTAL') + '</td>');
                html.push('        <td class="ste-summary-value">' + formatCurrency(totalTax) + '</td>');
                html.push('      </tr>');

                html.push('      <tr class="ste-summary-total-row">');
                html.push('        <td class="ste-summary-label">' + (jobWithdrawal ? 'Total Job Cost' : 'TOTAL') + '</td>');
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

            // Keep the FAM workflow on its existing valuation basis. Its input
            // was captured above before synchronizing the job reporting fields.
            if (isJobIssue(iaRec) || context.type === context.UserEventType.XEDIT) {
                var saved = record.load({ type: record.Type.INVENTORY_ADJUSTMENT, id: iaId });
                if (isJobIssue(saved)) syncJobAmounts(saved, jobCosts(saved));
            }

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

        function valueAt(rec, id, i) {
            return rec.getSublistValue({ sublistId: 'inventory', fieldId: id, line: i });
        }

        function isJobIssue(rec) {
            if (String(rec.getValue({ fieldId: 'custbody_atlas_inv_adj_reason' })) !== '1') return false;
            var count = rec.getLineCount({ sublistId: 'inventory' });
            for (var i = 0; i < count; i++) {
                if (!(Number(valueAt(rec, 'adjustqtyby', i)) < 0)) return false;
            }
            return count > 0;
        }

        function postedRows(rec) {
            // Aggregate split GL postings by transaction line, never by item or row position.
            var sql = [
                'SELECT ln.uniquekey AS linekey, ln.id AS lineid,',
                'SUM(NVL(gl.credit, 0) - NVL(gl.debit, 0)) AS relief',
                'FROM TransactionAccountingLine gl',
                'JOIN TransactionLine ln ON ln.transaction = gl.transaction AND ln.id = gl.transactionline',
                'JOIN Item it ON it.id = ln.item AND it.assetaccount = gl.account',
                "WHERE gl.transaction = ? AND gl.posting = 'T'"
            ];
            if (runtime.isFeatureInEffect({ feature: 'MULTIBOOK' })) {
                sql.push("AND gl.accountingbook IN (SELECT id FROM AccountingBook WHERE isprimary = 'T')");
            }
            sql.push('GROUP BY ln.uniquekey, ln.id');
            return query.runSuiteQL({ query: sql.join(' '), params: [Number(rec.id)] }).asMappedResults();
        }

        function jobCosts(rec) {
            var rows = [];
            try {
                rows = postedRows(rec);
            } catch (e) {
                log.error('Posted job cost unavailable for IA ' + rec.id, e);
            }
            var byKey = new Map(rows.map(r => [String(r.linekey), r]));
            var byId = new Map(rows.map(r => [String(r.lineid), r]));
            var used = new Set();
            var count = rec.getLineCount({ sublistId: 'inventory' });
            var fields = rec.getSublistFields({ sublistId: 'inventory' });
            var result = { amounts: [], materials: 0, tax: 0, total: 0, estimated: false };
            for (var i = 0; i < count; i++) {
                var row = null;
                if (count === 1 && rows.length === 1) {
                    row = rows[0];
                } else {
                    row = fields.includes('lineuniquekey') && byKey.get(String(valueAt(rec, 'lineuniquekey', i)));
                    if (!row && fields.includes('line')) row = byId.get(String(valueAt(rec, 'line', i)));
                }
                var material;
                if (row && row.relief != null && !used.has(row) && Number.isFinite(Number(row.relief))) {
                    material = round(Number(row.relief), 2);
                    used.add(row);
                } else {
                    result.estimated = true;
                    material = round(Math.abs(Number(valueAt(rec, 'adjustqtyby', i)) *
                        Number(valueAt(rec, 'unitcost', i) || 0)), 2);
                }
                var tax = Math.abs(Number(valueAt(rec, CONFIG.lineFields.taxAmount, i)) || 0);
                result.amounts.push(round(material + tax, 2));
                result.materials += material;
                result.tax += tax;
                result.total += result.amounts[i];
            }
            result.total = round(result.total, 2);
            return result;
        }

        function syncJobAmounts(rec, costs) {
            var changed = false;
            costs.amounts.forEach(function (amount, i) {
                var old = valueAt(rec, CONFIG.lineFields.amount, i);
                if (old == null || old === '' || Number(old) !== amount) {
                    rec.setSublistValue({ sublistId: 'inventory', fieldId: CONFIG.lineFields.amount,
                        line: i, value: amount });
                    changed = true;
                }
            });
            Object.values(CONFIG.headerFields).forEach(function (id) {
                var old = rec.getValue({ fieldId: id });
                if (old == null || old === '' || Number(old) !== costs.total) {
                    rec.setValue({ fieldId: id, value: costs.total });
                    changed = true;
                }
            });
            if (changed) rec.save({ enableSourcing: false });
        }

        function showJobAmounts(form, costs) {
            // Costing can finish between saves. Render the current values even on older records.
            var label = costs.estimated ? 'Estimated Job Cost' : 'Job Cost';
            var list = form.getSublist({ id: 'inventory' });
            var amount = list.addField({ id: 'custpage_bc_job_amount', type: ui.FieldType.CURRENCY,
                label: label + ' (incl. Use Tax)' });
            amount.updateDisplayType({ displayType: ui.FieldDisplayType.INLINE });
            costs.amounts.forEach(function (value, i) {
                list.setSublistValue({ id: amount.id, line: i, value: value.toFixed(2) });
            });
            list.getField({ id: CONFIG.lineFields.amount }).updateDisplayType({ displayType: ui.FieldDisplayType.HIDDEN });
            var total = form.addField({ id: 'custpage_bc_total_job_cost', type: ui.FieldType.CURRENCY,
                label: costs.estimated ? 'Estimated Total Job Cost' : 'Total Job Cost' });
            total.defaultValue = costs.total.toFixed(2);
            total.updateDisplayType({ displayType: ui.FieldDisplayType.INLINE });
            form.insertField({ field: total, nextfield: CONFIG.headerFields.estimatedTotal });
            form.getField({ id: CONFIG.headerFields.estimatedTotal }).updateDisplayType({ displayType: ui.FieldDisplayType.HIDDEN });
        }

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
                    search.createColumn({ name: ste.tgLineTaxCodeField }),
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
            var authorityRates = [];

            var rateSearch = search.create({
                type: ste.taxRateRecord,
                filters: [
                    [ste.taxRateTaxCodeField, 'anyof', taxCodeIds]
                ],
                columns: [
                    search.createColumn({
                        name: ste.taxRateValueField,
                        summary: search.Summary.SUM
                    }),
                    search.createColumn({
                        name: ste.taxRateAuthorityField,
                        join: ste.taxRateAuthorityJoin,
                        summary: "GROUP"
                    }),
                    search.createColumn({
                        name: ste.taxRateStateField,      // NEW
                        join: ste.taxRateAuthorityJoin,
                        summary: 'GROUP'
                    })
                    
                ]
            });

            // rateSearch.run().each(function (res) {
            //     var v = res.getValue({
            //         name: ste.taxRateValueField,
            //         summary: search.Summary.SUM
            //     }) || 0;
            //     totalRate = parseFloat(v) || 0;
            //     return false;
            // });

                     rateSearch.run().each(function (res) {
                var v = res.getValue({
                    name: ste.taxRateValueField,
                    summary: search.Summary.SUM
                }) || 0;
                var rate = parseFloat(v) || 0;

                var authorityId = res.getValue({
                    name: ste.taxRateAuthorityField,
                    join: ste.taxRateAuthorityJoin,
                    summary: 'GROUP'
                });

                var authorityName = res.getText({          // NEW — display name of the authority
                    name: ste.taxRateAuthorityField,
                    join: ste.taxRateAuthorityJoin,
                    summary: 'GROUP'
                });

                var authorityState = res.getValue({         // NEW
                    name: ste.taxRateStateField,
                    join: ste.taxRateAuthorityJoin,
                    summary: 'GROUP'
                });

                totalRate += rate;
                authorityRates.push({
                    authorityId: authorityId,
                    name: authorityName,
                    state: authorityState,
                    rate: rate
                });

                return true;   
            });

            cache.taxGroupToRate[taxGroupId] = totalRate;
            cache.taxGroupToAuthorityRates[taxGroupId] = authorityRates;        
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
