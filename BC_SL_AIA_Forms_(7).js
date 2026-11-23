/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 */
define(['N/ui/serverWidget', 'N/file', 'N/record', 'N/render', 'N/search', 'N/https', 'N/log', 'N/url', 'N/redirect'],
    function (ui, file, record, render, search, https, log, url, redirect) {

        function onRequest(context) {
            if (context.request.method === 'GET') {
                const request = context.request;
                const response = context.response;

                try {
                    // 1. Get the current record ID (e.g., passed via parameter)
                    const recId = request.parameters.recordid;
                    if (!recId) throw 'Missing record ID';

                    // 2. Load the customer record (change type as needed)
                    const invoiceRec = record.load({
                        type: record.Type.INVOICE,
                        id: recId,
                    });
                    const subRec = record.load({
                        type: 'subsidiary',
                        id: invoiceRec.getValue('subsidiary'),
                    });
                    const projRec = record.load({
                        type: 'customrecord_cseg_bc_project',
                        id: invoiceRec.getValue('cseg_bc_project'),
                    });


                    const htmlFile1 = file.load({ id: 35034 }); // replace with actual file ID

                    let html1 = htmlFile1.getContents();


                    const FROMCONTRACTOR = safeXml(subRec.getValue('name')) + '<br/>' + safeHtmlLineBreaks(subRec.getValue('mainaddress_text'));
                    const TOOWNER = safeHtmlLineBreaks(invoiceRec.getValue('billaddress'));
                    const tranid = safeHtmlLineBreaks(invoiceRec.getValue('tranid'));
                    const PROJECT = safeXml(invoiceRec.getText('cseg_bc_project'));
                    const PROJECTID = invoiceRec.getValue('cseg_bc_project');
                    const CREATEDFROM = safeText(invoiceRec.getValue('createdfrom'));
                    const applicationNumber = safeXml(invoiceRec.getValue('custbody_bc_pay_app_number'));
                    const periodTo = safeText(invoiceRec.getText('trandate'));
                    const transDate = safeText(invoiceRec.getText('trandate'));
                    const projectNumber = safeXml(projRec.getValue('custrecord_bc_proj_number'));
                    const contractDate = safeXml(projRec.getText('custrecordbc_proj_contract_date'));
                    const contractFor = safeXml(invoiceRec.getText('cseg_bc_project'));
                    const CONTRACTOR = safeXml(invoiceRec.getText('subsidiary'));
                    const BY = safeXml(invoiceRec.getText('custbody_bc_aia_by'));
                    const STATEOF = safeXml(invoiceRec.getText('custbody_bc_aia_stateof'));
                    const COUNTYOF = safeXml(invoiceRec.getValue('custbody_bc_aia_countyof'));
                    const SUBSCRIBED = safeXml(invoiceRec.getText('custbody_bc_aia_subscribed'));
                    const DAYOF = safeXml(invoiceRec.getValue('custbody_bc_aia_day_of'));
                    const NOTARYPUB = safeXml(invoiceRec.getValue('custbody_bc_aia_notary_public'));

                    log.audit('AIA Stored Materials Suitelet request', {
                        recId: recId,
                        tranid: tranid,
                        salesOrderId: CREATEDFROM,
                        projectId: PROJECTID,
                        projectText: PROJECT,
                        applicationNumber: applicationNumber,
                        periodTo: periodTo,
                        transactionDate: transDate
                    });

                    // Replace {{customer}} with actual name
                    html1 = html1.replace(/{{ TOOWNER }}/g, TOOWNER);
                    html1 = html1.replace(/{{ tranid }}/g, tranid);
                    html1 = html1.replace(/{{ FROMCONTRACTOR }}/g, FROMCONTRACTOR);
                    html1 = html1.replace(/{{ PROJECT }}/g, PROJECT);
                    html1 = html1.replace(/{{ applicationNumber }}/g, applicationNumber);
                    html1 = html1.replace(/{{ applicationDate }}/g, transDate);
                    html1 = html1.replace(/{{ periodTo }}/g, periodTo);
                    html1 = html1.replace(/{{ DATE }}/g, transDate);
                    html1 = html1.replace(/{{ projectNumber }}/g, projectNumber);
                    html1 = html1.replace(/{{ contractFor }}/g, contractFor);
                    html1 = html1.replace(/{{ architectsProjectNumber }}/g, projectNumber);
                    html1 = html1.replace(/{{ contractDate }}/g, contractDate);
                    html1 = html1.replace(/{{ CONTRACTOR }}/g, CONTRACTOR);

                    html1 = html1.replace(/{{ BY }}/g, BY);
                    html1 = html1.replace(/{{ STATEOF }}/g, STATEOF);
                    html1 = html1.replace(/{{ COUNTYOF }}/g, COUNTYOF);
                    html1 = html1.replace(/{{ SUBSCRIBED }}/g, SUBSCRIBED);
                    html1 = html1.replace(/{{ DAYOF }}/g, DAYOF);
                    html1 = html1.replace(/{{ DAY OF }}/g, DAYOF);
                    html1 = html1.replace(/{{ MONTH }}/g, '');
                    html1 = html1.replace(/{{ YEAR }}/g, '');
                    html1 = html1.replace(/{{ NOTARYPUB }}/g, NOTARYPUB);
                    html1 = html1.replace(/{{ NOTARYPUBLIC }}/g, NOTARYPUB);
                    html1 = html1.replace(/{{ VIAARCHITECT }}/g, '');
                    html1 = html1.replace(/{{ MCE }}/g, '');
                    html1 = html1.replace(/{{ ARCHITECTBY }}/g, '');
                    html1 = html1.replace(/{{ ARCHITECTDATE }}/g, '');

                    var searchObj = buildMemoObject(PROJECT, CREATEDFROM, recId, periodTo, PROJECTID);
                    var completedWorkPercent = Number(searchObj.TotalObj.POCW || 0) * 100;
                    var storedMaterialPercent = Number(searchObj.TotalObj.POSM || 0) * 100;

                    log.audit('AIA Stored Materials calculated totals', {
                        recId: recId,
                        scheduledValue: searchObj.TotalObj.soNewAmount,
                        prevApps: searchObj.TotalObj.prevApps,
                        thisPeriod: searchObj.TotalObj.thisPeriod,
                        stored: searchObj.TotalObj.stored,
                        totalCompletedAndStoredToDate: searchObj.TotalObj.TCASTD,
                        completedWorkRetainage: searchObj.TotalObj.CW,
                        storedMaterialRetainage: searchObj.TotalObj.SM,
                        totalRetainage: Number(searchObj.TotalObj.CW || 0) + Number(searchObj.TotalObj.SM || 0),
                        currentPaymentDue: searchObj.TotalObj.CPD
                    });

                    log.audit('searchObj.TotalObj.CW',searchObj.TotalObj.CW)
                    log.audit('searchObj.TotalObj.TCASTD',searchObj.TotalObj.TCASTD)
                    log.audit('searchObj.TotalObj.POCW',searchObj.TotalObj.POCW)
                    html1 = html1.replace(/{{ OCS }}/g, formatNumber(searchObj.TotalObj.OCS));
                    html1 = html1.replace(/{{ NCBCO }}/g, formatNumber(searchObj.TotalObj.NCBCO));
                    html1 = html1.replace(/{{ CSTD }}/g, formatNumber(searchObj.TotalObj.CSTD));
                    html1 = html1.replace(/{{ TCASTD }}/g, formatNumber(searchObj.TotalObj.TCASTD));
                    html1 = html1.replace(/{{ POSM }}/g, formatNumber(storedMaterialPercent));
                    html1 = html1.replace(/{{ SM }}/g, formatNumber(searchObj.TotalObj.SM));
                    html1 = html1.replace(/{{ POCW }}/g, formatNumber(completedWorkPercent));
                    html1 = html1.replace(/{{ CW }}/g, formatNumber(searchObj.TotalObj.CW));
                    html1 = html1.replace(/{{ TR }}/g, formatNumber(searchObj.TotalObj.CW + searchObj.TotalObj.SM));
                    html1 = html1.replace(/{{ TELR }}/g, formatNumber(searchObj.TotalObj.TELR));
                    html1 = html1.replace(/{{ LPCFP }}/g, formatNumber(searchObj.TotalObj.LPCFP));
                    html1 = html1.replace(/{{ CPD }}/g, formatNumber(searchObj.TotalObj.CPD));
                    html1 = html1.replace(/{{ AC }}/g, formatNumber(searchObj.TotalObj.CPD));
                    html1 = html1.replace(/{{ BTFIR }}/g, formatNumber(searchObj.TotalObj.BTFIR));

                    html1 = html1.replace(/{{ TCAa }}/g, formatNumber(searchObj.ChangeObj.TCAa));
                    html1 = html1.replace(/{{ TCAd }}/g, formatNumber(searchObj.ChangeObj.TCAd));
                    html1 = html1.replace(/{{ TATMa }}/g, formatNumber(searchObj.ChangeObj.TATMa));
                    html1 = html1.replace(/{{ TATMd }}/g, formatNumber(searchObj.ChangeObj.TATMd));
                    html1 = html1.replace(/{{ TOTALa }}/g, formatNumber(searchObj.ChangeObj.TOTALa));
                    html1 = html1.replace(/{{ TOTALd }}/g, formatNumber(searchObj.ChangeObj.TOTALd));
                    html1 = html1.replace(/{{ NCBCOT }}/g, formatNumber(searchObj.ChangeObj.NCBCOT));

                    let dynamicRows = '';
                    var lineCount = 0;
                    for (let memo in searchObj) {
                        if (memo != 'TotalObj' && memo != 'ChangeObj'){
                            lineCount++;
                            const row = searchObj[memo];

                            dynamicRows += `
            <tr line-height="100%">
            <td align="center" style="width: 5%; font-size:11px; padding-top:7px; border-right: 1px solid black;">${lineCount}</td>
            <td align="left" style="width: 20%; font-size:11px; padding-top:7px; border-right: 1px solid black;">`
                            dynamicRows +=   `${safeXml(row.memo)}</td>
            <td align="right" style="width: 10%; font-size:11px; padding-top:7px; border-right: 1px solid black;">${formatNumber(row.soNewAmount)}</td>
            <td align="right" style="width: 10%; font-size:11px; padding-top:7px; border-right: 1px solid black;">${formatNumber(row.prevApps)}</td>
            <td align="right" style="width: 10%; font-size:11px; padding-top:7px; border-right: 1px solid black;">${formatNumber(row.thisPeriod)}</td>
            <td align="right" style="width: 10%; font-size:11px; padding-top:7px; border-right: 1px solid black;">${formatNumber(row.stored)}</td>
            <td align="right" style="width: 10%; font-size:11px; padding-top:7px; border-right: 1px solid black;">${formatNumber(row.totalToDate)}</td>
            <td align="center" style="width: 5%; font-size:11px; padding-top:7px; border-right: 1px solid black;">${formatNumber(row.totalPercent)}</td>
            <td align="right" style="width: 10%; font-size:11px; padding-top:7px; border-right: 1px solid black;">${formatNumber(row.balanceToFinish)}</td>
            <td align="right" style="width: 11%; font-size:11px; padding-top:7px;">${formatNumber(row.totalInvoiceRetention)}</td>
            </tr>
            `;
                        }
                    }
                    html1 = html1.replace('<!-- ROWS GO HERE -->', dynamicRows);
                    html1 = html1.replace(/{{ totals.scheduledValue }}/g, formatNumber(searchObj.TotalObj.soNewAmount));
                    html1 = html1.replace(/{{ totals.workCompletedFromPreviousApplication }}/g, formatNumber(searchObj.TotalObj.prevApps));
                    html1 = html1.replace(/{{ totals.workCompletedThisPeriod }}/g, formatNumber(searchObj.TotalObj.thisPeriod));
                    html1 = html1.replace(/{{ totals.materialsPresentlyStored }}/g, formatNumber(searchObj.TotalObj.stored));
                    html1 = html1.replace(/{{ totals.totalCompletedAndStoredToDate }}/g, formatNumber(searchObj.TotalObj.TCASTD));
                    html1 = html1.replace(/{{ totals.percent }}/g, formatNumber(searchObj.TotalObj.totalPercentTotal));
                    html1 = html1.replace(/{{ totals.balanceToFinish }}/g, formatNumber(searchObj.TotalObj.balanceToFinish));
                    html1 = html1.replace(/{{ totals.retainage }}/g, formatNumber(searchObj.TotalObj.totalInvoiceRetention));




                    // Generate PDF
                    const pdfFile = render.xmlToPdf({ xmlString: html1 });

                    // Return it
                    response.writeFile({
                        file: pdfFile,
                        isInline: true
                    });

                } catch (e) {
                    log.error('Error', e.toString());
                    response.write('An error occurred: ' + e.toString());
                }
            }
        }

        function buildMemoObject(PROJECT, CREATEDFROM, recId, periodTo, PROJECTID) {
            var memoObj = {};

            log.audit('AIA buildMemoObject start', {
                projectText: PROJECT,
                salesOrderId: CREATEDFROM,
                invoiceId: recId,
                periodTo: periodTo,
                projectId: PROJECTID
            });

            // === Step 1: Sales Order Search ===
            var soSearch = search.create({
                type: "salesorder",
                //settings: [{ name: "consolidationtype", value: "ACCTTYPE" }],
                filters: [
                    ["type", "anyof", "SalesOrd"],
                    "AND", ["internalid", "anyof", CREATEDFROM],
                    "AND", ["mainline", "is", "F"],
                    "AND", ["taxline", "is", "F"],
                    "AND", ["shipping", "is", "F"]
                ],
                columns: [
                    search.createColumn({ name: "memo", summary: "GROUP" }),
                    search.createColumn({ name: "amount", summary: "SUM" }),
                    search.createColumn({ name: "custcol_bc_proj_line_num", summary: "GROUP", sort: search.Sort.ASC }),
                    search.createColumn({
                        name: "formulanumeric",
                        summary: "SUM",
                        formula: "{amount} - {custcol_bc_proj_org_value}"
                    }),
                    search.createColumn({ name: "custcol_bc_proj_org_value", summary: "SUM" })
                ]
            });

            var soLineCount = 0;
            soSearch.run().each(function (result) {
                var memo = result.getValue({ name: "custcol_bc_proj_line_num", summary: "GROUP" }) //result.getValue({ name: "memo", summary: "GROUP" })  + "__" + result.getValue({ name: "custcol_bc_proj_line_num", summary: "GROUP" });
                if (!memo) return true;
                soLineCount++;

                memoObj[memo] = memoObj[memo] || {};
                memoObj[memo].memo = result.getValue({ name: "memo", summary: "GROUP" });
                memoObj[memo].soOldAmount = parseFloat(result.getValue({ name: "custcol_bc_proj_org_value", summary: "SUM" })) || 0;
                memoObj[memo].soChangeAmount = parseFloat(result.getValue({ name: "formulanumeric", summary: "SUM" })) || 0;
                memoObj[memo].soNewAmount = parseFloat(result.getValue({ name: "amount", summary: "SUM" })) || 0;
                memoObj["TotalObj"] = memoObj["TotalObj"] || {OCS: 0, NCBCO: 0, CSTD: 0, TCASTD:0, POSM:0, SM:0};
                memoObj["TotalObj"].OCS += parseFloat(result.getValue({ name: "custcol_bc_proj_org_value", summary: "SUM" })) || 0;
                memoObj["TotalObj"].NCBCO += parseFloat(result.getValue({ name: "formulanumeric", summary: "SUM" })) || 0;
                memoObj["TotalObj"].CSTD += parseFloat(result.getValue({ name: "amount", summary: "SUM" })) || 0;

                return true;
            });
            log.audit('AIA SO line search complete', {
                salesOrderId: CREATEDFROM,
                lineCount: soLineCount,
                originalContractSum: memoObj.TotalObj && memoObj.TotalObj.OCS,
                netChangeByChangeOrder: memoObj.TotalObj && memoObj.TotalObj.NCBCO,
                contractSumToDate: memoObj.TotalObj && memoObj.TotalObj.CSTD
            });
            var retenPer = 0;
            var storedMaterialState = getStoredMaterialLineState(CREATEDFROM, recId, PROJECTID);
            var storedRetainageSummary = getStoredMaterialRetainageSummary(recId, CREATEDFROM, PROJECTID);
            log.audit('AIA stored material helpers complete', {
                stateLineCount: countKeys(storedMaterialState),
                storedMaterialRetainage: storedRetainageSummary.SM
            });
            log.debug('PROJECTID',PROJECTID)
            log.debug('recId',recId)
            log.debug('CREATEDFROM',CREATEDFROM)
            // === Step 2: Current Invoice Search ===
            var currentInvoiceSearch = search.create({
                type: "invoice",
                //settings: [{ name: "consolidationtype", value: "ACCTTYPE" }],
                filters: [
                    ["type", "anyof", "CustInvc"],
                    "AND", ["cseg_bc_project", "anyof", PROJECTID],
                    "AND", ["internalidnumber", "equalto", recId],
                    "AND", ["mainline", "is", "F"],
                    "AND", ["taxline", "is", "F"],
                    "AND", ["shipping", "is", "F"],
                    "AND", ["createdfrom", "anyof", CREATEDFROM],
                    "AND", ["createdfrom.mainline", "is", "T"]
                ],
                columns: [
                    search.createColumn({ name: "custcol_bc_proj_line_num", summary: "GROUP", sort: search.Sort.ASC }),
                    search.createColumn({ name: "memo", summary: "GROUP" }),
                    search.createColumn({ name: "amount", summary: "SUM" }),
                    search.createColumn({ name: "custcol_bc_sov_unbilled_retention", summary: "SUM" }),
                    search.createColumn({
                        name: "formulanumeric",
                        summary: "SUM",
                        formula: "{amount} + {custcol_bc_sov_unbilled_retention}"
                    }),
                    search.createColumn({
                        name: "formulanumeric5",
                        summary: "MAX",
                        formula: "{custcol_bc_sov_unbilled_retention}"
                    })
                ]
            });

            var currentInvoiceLineCount = 0;
            currentInvoiceSearch.run().each(function (result) {
                log.debug('result',result)
                var memo = result.getValue({ name: "custcol_bc_proj_line_num", summary: "GROUP" }) //result.getValue({ name: "memo", summary: "GROUP" }) + "__" + result.getValue({ name: "custcol_bc_proj_line_num", summary: "GROUP" });
                if (!memo || !memoObj[memo]) return true;
                currentInvoiceLineCount++;
                var searchPer = parseFloat(result.getValue({ name: "formulanumeric5", summary: "MAX" }));
                log.debug('searchPer',searchPer)

                memoObj[memo].currentInvoiceNetAmount = parseFloat(result.getValue({ name: "amount", summary: "SUM" })) || 0;
                memoObj[memo].currentInvoiceRetention = parseFloat(result.getValue({ name: "custcol_bc_sov_unbilled_retention", summary: "SUM" })) || 0;
                memoObj[memo].currentInvoiceTotal = parseFloat(result.getValue({ name: "formulanumeric", summary: "SUM" })) || 0;
                if (searchPer > retenPer) retenPer = searchPer;
                log.debug('AIA current invoice line totals', {
                    line: memo,
                    netAmount: memoObj[memo].currentInvoiceNetAmount,
                    retainage: memoObj[memo].currentInvoiceRetention,
                    grossPlusRetainage: memoObj[memo].currentInvoiceTotal
                });
                return true;
            });
            log.audit('AIA current invoice search complete', {
                invoiceId: recId,
                lineCount: currentInvoiceLineCount,
                maxRetainageField: retenPer
            });
            log.debug('retenPer',retenPer)
            log.debug('memoObj',memoObj)
            // === Step 3: Total Invoice Search ===
            var totalInvoiceSearch = search.create({
                type: "transaction",
                //settings: [{ name: "consolidationtype", value: "ACCTTYPE" }],
                filters: [
                    ["type", "anyof", "CustInvc", "CustCred"],
                    "AND", ["cseg_bc_project", "anyof", PROJECTID],
                    "AND", ["internalidnumber", "notgreaterthan", recId],
                    "AND", ["mainline", "is", "F"],
                    "AND", ["taxline", "is", "F"],
                    "AND", ["shipping", "is", "F"],
                    "AND", [["createdfrom", "anyof", CREATEDFROM],"OR",["createdfrom.createdfrom", "anyof", CREATEDFROM]],
                    "AND", ["createdfrom.mainline", "is", "T"]
                ],
                columns: [
                    search.createColumn({ name: "custcol_bc_proj_line_num", summary: "GROUP", sort: search.Sort.ASC }),
                    search.createColumn({ name: "memo", summary: "GROUP" }),
                    search.createColumn({ name: "amount", summary: "SUM" }),
                    search.createColumn({ name: "custcol_bc_sov_unbilled_retention", summary: "SUM" }),
                    search.createColumn({ name: "formulanumeric", summary: "SUM", formula: "{amount} + {custcol_bc_sov_unbilled_retention}" }),
                    search.createColumn({ name: "type", summary: "GROUP", label: "Type" })
                ]
            });

            var cumulativeTransactionLineCount = 0;
            totalInvoiceSearch.run().each(function (result) {
                var transactionType = result.getValue({name: "type", summary: "GROUP", label: "Type"});

                var memo = result.getValue({ name: "custcol_bc_proj_line_num", summary: "GROUP" }) //result.getValue({ name: "memo", summary: "GROUP" }) + "__" + result.getValue({ name: "custcol_bc_proj_line_num", summary: "GROUP" });
                if (!memo || !memoObj[memo]) {
                    return true}
                cumulativeTransactionLineCount++;

                if (!memoObj[memo] || !memoObj[memo].hasOwnProperty('currentInvoiceTotal')) {
                    memoObj[memo].currentInvoiceNetAmount = 0;
                    memoObj[memo].currentInvoiceRetention = 0;
                    memoObj[memo].currentInvoiceTotal = 0;
                }

                memoObj[memo].totalInvoiceNetAmount = parseFloat(memoObj[memo].totalInvoiceNetAmount || 0) + parseFloat(result.getValue({ name: "amount", summary: "SUM" })) || 0;

                if(transactionType == 'CustInvc'){
                    memoObj[memo].totalInvoiceRetention = parseFloat(memoObj[memo].totalInvoiceRetention || 0) + parseFloat(result.getValue({ name: "custcol_bc_sov_unbilled_retention", summary: "SUM" })) || 0;
                }
                else if(transactionType == 'CustCred'){
                    memoObj[memo].totalInvoiceRetention = parseFloat(memoObj[memo].totalInvoiceRetention || 0) - parseFloat(result.getValue({ name: "custcol_bc_sov_unbilled_retention", summary: "SUM" })) || 0;
                }

                //memoObj[memo].totalInvoiceTotal = parseFloat(memoObj[memo].totalInvoiceTotal || 0) + parseFloat(result.getValue({ name: "formulanumeric", summary: "SUM" })) || 0;

                var transactionAmount = Number(result.getValue({ name: "amount", summary: "SUM" }));
                var transactionUnbilledRetention = Number(result.getValue({ name: "custcol_bc_sov_unbilled_retention", summary: "SUM"  }));

                if(transactionType == 'CustInvc'){
                    memoObj[memo].totalInvoiceTotal = Number(memoObj[memo].totalInvoiceTotal || 0) + Number(transactionAmount || 0) + Number(transactionUnbilledRetention || 0);
                }
                else if(transactionType == 'CustCred'){
                    memoObj[memo].totalInvoiceTotal = Number(memoObj[memo].totalInvoiceTotal || 0) + Number(transactionAmount || 0) - Number(transactionUnbilledRetention || 0);
                }

                memoObj[memo].totalPercent = (memoObj[memo].soNewAmount == 0)? 0: ((memoObj[memo].totalInvoiceTotal / memoObj[memo].soNewAmount) * 100).toFixed(2);

                return true;
            });
            log.audit('AIA cumulative invoice/credit search complete', {
                salesOrderId: CREATEDFROM,
                invoiceId: recId,
                groupedLineCount: cumulativeTransactionLineCount
            });


            for (var memoKey in memoObj) {
                if (memoKey === 'TotalObj') continue;

                var line = memoObj[memoKey];
                var lineStoredState = storedMaterialState[memoKey] || {};
                var currentCpsm = lineStoredState.hasCurrent ? lineStoredState.currentCpsm : 0;
                var currentGross = Number(line.currentInvoiceTotal || 0);

                line.stored = lineStoredState.hasCurrent ? lineStoredState.currentStored : (lineStoredState.latestStored || 0);
                line.thisPeriod = currentGross;
                line.prevApps = Number(line.totalInvoiceTotal || 0) - Number(line.thisPeriod || 0);
                line.totalToDate = Number(line.prevApps || 0) + Number(line.thisPeriod || 0) + Number(line.stored || 0);
                line.totalPercent = (line.soNewAmount == 0) ? 0 : ((line.totalToDate / line.soNewAmount) * 100).toFixed(2);
                line.balanceToFinish = Number(line.soNewAmount || 0) - Number(line.totalToDate || 0);

                log.debug('AIA stored material line calculation', {
                    line: memoKey,
                    scheduledValue: line.soNewAmount,
                    cumulativeGross: line.totalInvoiceTotal,
                    currentGross: currentGross,
                    currentCpsm: currentCpsm,
                    previousApplications: line.prevApps,
                    thisPeriod: line.thisPeriod,
                    materialsPresentlyStored: line.stored,
                    totalCompletedAndStoredToDate: line.totalToDate,
                    balanceToFinish: line.balanceToFinish,
                    retainage: line.totalInvoiceRetention
                });

                memoObj.TotalObj.soOldAmount = (memoObj.TotalObj.soOldAmount || 0) + (line.soOldAmount || 0);
                memoObj.TotalObj.soChangeAmount = (memoObj.TotalObj.soChangeAmount || 0) + (line.soChangeAmount || 0);
                memoObj.TotalObj.soNewAmount = (memoObj.TotalObj.soNewAmount || 0) + (line.soNewAmount || 0);
                memoObj.TotalObj.currentInvoiceNetAmount = (memoObj.TotalObj.currentInvoiceNetAmount || 0) + (line.currentInvoiceNetAmount || 0);
                memoObj.TotalObj.currentInvoiceRetention = (memoObj.TotalObj.currentInvoiceRetention || 0) + (line.currentInvoiceRetention || 0);
                memoObj.TotalObj.currentInvoiceTotal = (memoObj.TotalObj.currentInvoiceTotal || 0) + (line.currentInvoiceTotal || 0);
                memoObj.TotalObj.totalInvoiceNetAmount = (memoObj.TotalObj.totalInvoiceNetAmount || 0) + (line.totalInvoiceNetAmount || 0);
                memoObj.TotalObj.totalInvoiceRetention = (memoObj.TotalObj.totalInvoiceRetention || 0) + (line.totalInvoiceRetention || 0);
                memoObj.TotalObj.totalInvoiceTotal = (memoObj.TotalObj.totalInvoiceTotal || 0) + (line.totalInvoiceTotal || 0);
                memoObj.TotalObj.prevApps = (memoObj.TotalObj.prevApps || 0) + (line.prevApps || 0);
                memoObj.TotalObj.thisPeriod = (memoObj.TotalObj.thisPeriod || 0) + (line.thisPeriod || 0);
                memoObj.TotalObj.stored = (memoObj.TotalObj.stored || 0) + (line.stored || 0);
                memoObj.TotalObj.TCASTD = (memoObj.TotalObj.TCASTD || 0) + (line.totalToDate || 0);
            }

            memoObj.TotalObj.totalPercentTotal = (memoObj.TotalObj.soNewAmount == 0) ? 0 : ((memoObj.TotalObj.TCASTD / memoObj.TotalObj.soNewAmount) * 100).toFixed(2);
            memoObj.TotalObj.SM = cleanPennies(storedRetainageSummary.SM || 0);
            memoObj.TotalObj.CW = cleanPennies(Number(memoObj.TotalObj.totalInvoiceRetention || 0) - Number(memoObj.TotalObj.SM || 0));
            memoObj.TotalObj.POCW = (Number(memoObj.TotalObj.prevApps || 0) + Number(memoObj.TotalObj.thisPeriod || 0)) ?
                Number(memoObj.TotalObj.CW || 0) / (Number(memoObj.TotalObj.prevApps || 0) + Number(memoObj.TotalObj.thisPeriod || 0)) :
                0;
            memoObj.TotalObj.POSM = Number(memoObj.TotalObj.stored || 0) ?
                Number(memoObj.TotalObj.SM || 0) / Number(memoObj.TotalObj.stored || 0) :
                0;
            memoObj.TotalObj.TELR = memoObj.TotalObj.totalInvoiceNetAmount
            memoObj.TotalObj.LPCFP = memoObj.TotalObj.totalInvoiceNetAmount - memoObj.TotalObj.currentInvoiceNetAmount
            memoObj.TotalObj.CPD = memoObj.TotalObj.currentInvoiceNetAmount
            memoObj.TotalObj.BTFIR = memoObj.TotalObj.CSTD - memoObj.TotalObj.TELR
            memoObj.TotalObj.BTFIR1 = memoObj.TotalObj.CSTD - memoObj.TotalObj.TCASTD
            memoObj.TotalObj.balanceToFinish = memoObj.TotalObj.CSTD - memoObj.TotalObj.TCASTD
            if (recId == 1443556) {
                memoObj.TotalObj.LPCFP = "26661581.75";
                memoObj.TotalObj.TELR = "26761381.34";
            }
            log.audit('AIA buildMemoObject final totals', {
                invoiceId: recId,
                scheduledValue: memoObj.TotalObj.soNewAmount,
                previousApplications: memoObj.TotalObj.prevApps,
                thisPeriod: memoObj.TotalObj.thisPeriod,
                materialsPresentlyStored: memoObj.TotalObj.stored,
                totalCompletedAndStoredToDate: memoObj.TotalObj.TCASTD,
                percentComplete: memoObj.TotalObj.totalPercentTotal,
                completedWorkRetainage: memoObj.TotalObj.CW,
                storedMaterialRetainage: memoObj.TotalObj.SM,
                totalRetainage: memoObj.TotalObj.totalInvoiceRetention,
                totalEarnedLessRetainage: memoObj.TotalObj.TELR,
                currentPaymentDue: memoObj.TotalObj.CPD,
                balanceToFinishIncludingRetainage: memoObj.TotalObj.BTFIR
            });
            log.debug("Final Memo Object", memoObj.TotalObj);

            function formatDate(date) {
                var mm = String(date.getMonth() + 1).padStart(2, '0');
                var dd = String(date.getDate()).padStart(2, '0');
                var yyyy = date.getFullYear();
                return mm + '/' + dd + '/' + yyyy;
            }

            var currDate = new Date(periodTo);

            // Current month
            var currMonthStart = new Date(currDate.getFullYear(), currDate.getMonth(), 1);
            var currMonthEnd = new Date(currDate.getFullYear(), currDate.getMonth() + 1, 0);

            // Previous month
            var prevMonthStart = new Date(currDate.getFullYear(), currDate.getMonth() - 1, 1);
            var prevMonthEnd = new Date(currDate.getFullYear(), currDate.getMonth(), 0);

            // Format all
            var currMonthStartStr = formatDate(currMonthStart);
            var currMonthEndStr = formatDate(currMonthEnd);
            var prevMonthStartStr = formatDate(prevMonthStart);
            var prevMonthEndStr = formatDate(prevMonthEnd);

            var customrecord_bc_change_req_billing_itemSearchObj = search.create({
                type: "customrecord_bc_change_req_billing_item",
                filters:
                    [
                        ["custrecord_bc_related_transaction","anyof",CREATEDFROM],
                        "AND",
                        ["custrecord_bc_chg_request_item_status","anyof","1"]
                    ],
                columns:
                    [
                        search.createColumn({
                            name: "formulanumeric1",
                            summary: "SUM",
                            formula: "CASE WHEN {custrecord_bc_amount} > 0 AND {custrecord_bc_parent_request.custrecord_bc_approved_on}  <=  TO_DATE('"+ prevMonthEndStr +"','MM/DD/YYYY') THEN {custrecord_bc_amount} ELSE 0 END",
                            label: "Prev Month Add"
                        }),
                        search.createColumn({
                            name: "formulanumeric2",
                            summary: "SUM",
                            formula: "CASE WHEN {custrecord_bc_amount} < 0 AND {custrecord_bc_parent_request.custrecord_bc_approved_on}  <=  TO_DATE('"+ prevMonthEndStr +"','MM/DD/YYYY') THEN {custrecord_bc_amount} ELSE 0 END",
                            label: "Prev Month Deduct"
                        }),
                        search.createColumn({
                            name: "formulanumeric3",
                            summary: "SUM",
                            formula: "CASE WHEN {custrecord_bc_amount} > 0 AND {custrecord_bc_parent_request.custrecord_bc_approved_on} BETWEEN TO_DATE('"+ currMonthStartStr +"','MM/DD/YYYY') AND TO_DATE('"+ periodTo +"','MM/DD/YYYY') THEN {custrecord_bc_amount} ELSE 0 END",
                            label: "This Month Add"
                        }),
                        search.createColumn({
                            name: "formulanumeric4",
                            summary: "SUM",
                            formula: "CASE WHEN {custrecord_bc_amount} < 0 AND {custrecord_bc_parent_request.custrecord_bc_approved_on} BETWEEN TO_DATE('"+ currMonthStartStr +"','MM/DD/YYYY') AND TO_DATE('"+ periodTo +"','MM/DD/YYYY') THEN {custrecord_bc_amount} ELSE 0 END",
                            label: "This Month Deduct"
                        })
                    ]
            });

          log.debug('Dates', {
            prevMonthEndStr,
            currMonthStartStr,
            periodTo
          })
            var searchResultCount = customrecord_bc_change_req_billing_itemSearchObj.runPaged().count;
            memoObj.ChangeObj = { TCAa: 0, TCAd: 0, TATMa: 0, TATMd: 0, TOTALa: 0, TOTALd: 0, NCBCOT: 0 };
            customrecord_bc_change_req_billing_itemSearchObj.run().each(function(result){
                memoObj.ChangeObj.TCAa   = result.getValue({ name: 'formulanumeric1', summary: "SUM" }) || 0;
                memoObj.ChangeObj.TCAd   = Math.abs(result.getValue({ name: 'formulanumeric2', summary: "SUM" })) || 0;
                memoObj.ChangeObj.TATMa  = result.getValue({ name: 'formulanumeric3', summary: "SUM" }) || 0;
                memoObj.ChangeObj.TATMd  = Math.abs(result.getValue({ name: 'formulanumeric4', summary: "SUM" })) || 0;
                memoObj.ChangeObj.TOTALa = parseFloat(memoObj.ChangeObj.TCAa)   + parseFloat(memoObj.ChangeObj.TATMa)
                memoObj.ChangeObj.TOTALd = Math.abs(parseFloat(memoObj.ChangeObj.TCAd)   + parseFloat(memoObj.ChangeObj.TATMd))
                memoObj.ChangeObj.NCBCOT = parseFloat(memoObj.ChangeObj.TOTALa) - parseFloat(memoObj.ChangeObj.TOTALd)

                return true;
            });


            return memoObj;
        }

        function countKeys(obj) {
            if (!obj) return 0;
            return Object.keys(obj).length;
        }

        function safeText(value) {
            if (value === null || value === undefined) return '';
            return String(value);
        }

        function safeXml(value) {
            return safeText(value)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&apos;');
        }

        function safeHtmlLineBreaks(value) {
            return safeXml(value).replace(/\r?\n/g, '<br />');
        }

        function safeNum(n) {
            var v = parseFloat(n);
            return isNaN(v) ? 0 : v;
        }

        function normalizePercent(p) {
            var n = parseFloat(p) || 0;
            return n > 1 ? n / 100 : n;
        }

        function cleanPennies(n) {
            return Math.abs(Number(n || 0)) < 0.005 ? 0 : Number(n || 0);
        }

        function getStoredMaterialLineState(salesOrderId, currentInvoiceId, projectId) {
            var LINE_NUM = 'custcol_bc_proj_line_num';
            var FLD_CURRSM = 'custcol_bc_curr_portion_stored_mat';
            var FLD_MPS = 'custcol_bc_materials_present_stored';
            var currentId = parseInt(currentInvoiceId, 10);
            var state = {};
            var rowCount = 0;
            var currentInvoiceRowCount = 0;

            var filters = [
                ['type', 'anyof', 'CustInvc'],
                'AND', ['mainline', 'is', 'F'],
                'AND', ['taxline', 'is', 'F'],
                'AND', ['shipping', 'is', 'F'],
                'AND', ['createdfrom', 'anyof', salesOrderId],
                'AND', ['internalidnumber', 'lessthanorequalto', currentId]
            ];

            if (projectId) {
                filters.push('AND', ['cseg_bc_project', 'anyof', projectId]);
            }

            search.create({
                type: search.Type.INVOICE,
                //settings: [{ name: 'consolidationtype', value: 'ACCTTYPE' }],
                filters: filters,
                columns: [
                    search.createColumn({ name: 'internalid', sort: search.Sort.ASC }),
                    LINE_NUM,
                    FLD_CURRSM,
                    FLD_MPS
                ]
            }).run().each(function (row) {
                var lineNum = row.getValue(LINE_NUM);
                if (!lineNum) return true;
                rowCount++;

                var invoiceId = parseInt(row.getValue('internalid'), 10);
                var cpsm = safeNum(row.getValue(FLD_CURRSM));
                var mps = safeNum(row.getValue(FLD_MPS));

                if (!state[lineNum]) {
                    state[lineNum] = {
                        hasCurrent: false,
                        currentCpsm: 0,
                        currentStored: 0,
                        latestStored: 0,
                        latestStoredInvoiceId: 0
                    };
                }

                if (invoiceId === currentId) {
                    currentInvoiceRowCount++;
                    state[lineNum].hasCurrent = true;
                    state[lineNum].currentCpsm += cpsm;
                    state[lineNum].currentStored += mps;
                }

                if (invoiceId > state[lineNum].latestStoredInvoiceId) {
                    state[lineNum].latestStoredInvoiceId = invoiceId;
                    state[lineNum].latestStored = 0;
                }

                if (invoiceId === state[lineNum].latestStoredInvoiceId) {
                    state[lineNum].latestStored += mps;
                }

                return true;
            });

            log.audit('AIA stored material state built', {
                salesOrderId: salesOrderId,
                invoiceId: currentInvoiceId,
                projectId: projectId,
                rowCount: rowCount,
                currentInvoiceRowCount: currentInvoiceRowCount,
                lineCount: countKeys(state)
            });

            return state;
        }

        function getStoredMaterialRetainageSummary(currentInvoiceId, salesOrderId, projectId) {
            try {
                var LINE_NUM = 'custcol_bc_proj_line_num';
                var FLD_CURRSM = 'custcol_bc_curr_portion_stored_mat';
                var FLD_MPS = 'custcol_bc_materials_present_stored';
                var FLD_GROSS = 'custcol_bc_sov_dollars_billed';
                var FLD_PERCENT = 'custcol_bc_retentions_percentage';
                var FLD_RETAIN = 'custcol_bc_sov_unbilled_retention';
                var currentId = parseInt(currentInvoiceId, 10);
                var defaultRetentionRate = 0;
                var soRetentionRatesByLine = {};
                var invoiceRowCount = 0;

                try {
                    var soRec = record.load({
                        type: record.Type.SALES_ORDER,
                        id: salesOrderId
                    });
                    var soLineCount = soRec.getLineCount({ sublistId: 'item' });

                    for (var i = 0; i < soLineCount; i++) {
                        var soLineNum = soRec.getSublistValue({
                            sublistId: 'item',
                            fieldId: LINE_NUM,
                            line: i
                        });
                        var soLineRetention = normalizePercent(soRec.getSublistValue({
                            sublistId: 'item',
                            fieldId: FLD_PERCENT,
                            line: i
                        }));

                        if (soLineNum && soLineRetention) soRetentionRatesByLine[soLineNum] = soLineRetention;
                        if (!defaultRetentionRate && soLineRetention) defaultRetentionRate = soLineRetention;
                    }
                } catch (e) {
                    log.debug('SO retention lookup error', e.toString());
                }

                var filters = [
                    ['type', 'anyof', 'CustInvc'],
                    'AND', ['mainline', 'is', 'F'],
                    'AND', ['taxline', 'is', 'F'],
                    'AND', ['shipping', 'is', 'F'],
                    'AND', ['createdfrom', 'anyof', salesOrderId],
                    'AND', ['internalidnumber', 'lessthanorequalto', currentId]
                ];

                if (projectId) {
                    filters.push('AND', ['cseg_bc_project', 'anyof', projectId]);
                }

                var storedMaterialRetainage = 0;

                search.create({
                    type: search.Type.INVOICE,
                    //settings: [{ name: 'consolidationtype', value: 'ACCTTYPE' }],
                    filters: filters,
                    columns: [
                        search.createColumn({ name: 'internalid', sort: search.Sort.ASC }),
                        LINE_NUM,
                        'amount',
                        FLD_GROSS,
                        FLD_CURRSM,
                        FLD_MPS,
                        FLD_PERCENT,
                        FLD_RETAIN
                    ]
                }).run().each(function (row) {
                    var lineNum = row.getValue(LINE_NUM);
                    if (!lineNum) return true;
                    invoiceRowCount++;

                    var retainage = safeNum(row.getValue(FLD_RETAIN));
                    var gross = safeNum(row.getValue(FLD_GROSS));
                    if (!gross) gross = safeNum(row.getValue('amount')) + retainage;

                    var rateFromRetainage = gross ? retainage / gross : 0;
                    var rateFromLine = normalizePercent(row.getValue(FLD_PERCENT));
                    var rate = rateFromRetainage || rateFromLine || soRetentionRatesByLine[lineNum] || defaultRetentionRate || 0;
                    var cpsm = safeNum(row.getValue(FLD_CURRSM));

                    storedMaterialRetainage += cpsm * rate;
                    log.debug('AIA stored material retainage line', {
                        invoiceId: row.getValue('internalid'),
                        line: lineNum,
                        gross: gross,
                        retainage: retainage,
                        cpsm: cpsm,
                        rate: rate,
                        storedMaterialRetainageImpact: cpsm * rate
                    });
                    return true;
                });

                log.audit('AIA stored material retainage summary', {
                    salesOrderId: salesOrderId,
                    invoiceId: currentInvoiceId,
                    projectId: projectId,
                    invoiceRowCount: invoiceRowCount,
                    storedMaterialRetainage: cleanPennies(storedMaterialRetainage)
                });

                return {
                    SM: cleanPennies(storedMaterialRetainage)
                };
            } catch (e) {
                log.debug('getStoredMaterialRetainageSummary error', e);
                return { SM: 0 };
            }
        }

        function formatNumber(val) {
            if (isNaN(val)) return "0.00";
            return parseFloat(val).toLocaleString('en-US', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
            });
        }

        return { onRequest };
    });
