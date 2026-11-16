/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 * @NModuleScope SameAccount
 * Query-only sales tax report. Upload this single file; no client script or saved search required.
 */
define(['N/query','N/runtime','N/log','N/render','N/url'], (query,runtime,log,pdfRender,recordUrl) => {
    'use strict';
    // Supplied query with the user-requested line key; formulas, joins and original filters are unchanged.
    const BASE_QUERY = "SELECT \n  \"TRANSACTION\".id AS transactionInternalId,\n  \"TRANSACTION\".\"TYPE\" AS transactionType,\n  transactionLine.uniquekey AS transactionLineUniqueKey /*{transactionlines.uniquekey#RAW}*/, \n  Nexus.state AS nexusState /*{nexus.state#RAW}*/, \n  transactionTaxDetail_SUB.custrecord_ste_taxauthority_level_0 AS imposingTaxAuthorityInfoLevel /*{transactionlines.transactiontaxdetail.taxcode.custrecord_ste_taxcode_imposeauthority.custrecord_ste_taxauthority_level#RAW}*/, \n  transactionTaxDetail_SUB.name_0 AS imposingTaxAuthorityInfoName /*{transactionlines.transactiontaxdetail.taxcode.custrecord_ste_taxcode_imposeauthority.name#RAW}*/, \n  transactionTaxDetail_SUB.taxrate AS taxRate /*{transactionlines.transactiontaxdetail.taxrate#RAW}*/, \n  \"TRANSACTION\".trandate AS transactionDate /*{trandate#RAW}*/, \n  transactionLine.subsidiary AS subsidiary /*{transactionlines.subsidiary#RAW}*/, \n  (CASE WHEN NOT(\n    \"TRANSACTION\".\"TYPE\" IN ('CustInvc', 'CashSale', 'CustCred', 'CashRfnd')\n  ) THEN TO_NUMBER(NULL) ELSE TO_NUMBER(TransactionAccountingLine.netamount) * -1 END * Subsidiary_SUB.exchangerate) * 1 AS totalSales /*(CASE \n    WHEN NOT {type} IN ('CustInvc', 'CashSale', 'CustCred', 'CashRfnd')\n        THEN TO_NUMBER(null)\n    ELSE\n        -TO_NUMBER({transactionlines.accountingimpact.netamount})\nEND)*{transactionlines.subsidiary.currency.exchangerate}*1*/, \n  (CASE WHEN NOT(\n    \"TRANSACTION\".\"TYPE\" IN ('CustInvc', 'CashSale', 'CustCred', 'CashRfnd')\n  ) THEN TO_NUMBER(NULL) WHEN NVL(TO_NUMBER(transactionLine.taxamount), 0) = 0 THEN TO_NUMBER(TransactionAccountingLine.netamount) * -1 ELSE 0 END * Subsidiary_SUB.exchangerate) * 1 AS nonTaxableSales /*(CASE\n    WHEN NOT {type} IN ('CustInvc', 'CashSale', 'CustCred', 'CashRfnd')\n        THEN TO_NUMBER(null) \n    WHEN NVL(TO_NUMBER({transactionlines.taxamount}), 0) = 0\n        THEN -TO_NUMBER({transactionlines.accountingimpact.netamount})\n    ELSE\n        0\nEND)*{transactionlines.subsidiary.currency.exchangerate}*1*/, \n  (CASE WHEN NOT(\n    \"TRANSACTION\".\"TYPE\" IN ('CustInvc', 'CashSale', 'CustCred', 'CashRfnd')\n  ) THEN TO_NUMBER(NULL) WHEN NVL(TO_NUMBER(transactionLine.taxamount), 0) = 0 THEN 0 ELSE TO_NUMBER(TransactionAccountingLine.netamount) * -1 END * Subsidiary_SUB.exchangerate) * 1 AS taxableSales /*(CASE\n    WHEN NOT {type} IN ('CustInvc', 'CashSale', 'CustCred', 'CashRfnd')\n        THEN TO_NUMBER(null) \n    WHEN NVL(TO_NUMBER({transactionlines.taxamount}), 0) = 0\n        THEN 0\n    ELSE\n        -TO_NUMBER({transactionlines.accountingimpact.netamount})\nEND)*{transactionlines.subsidiary.currency.exchangerate}*1*/, \n  ((transactionTaxDetail_SUB.basetaxamount * -1) * Subsidiary_SUB.exchangerate) * 1 AS taxCollected /*(-{transactionlines.transactiontaxdetail.basetaxamount})*{transactionlines.subsidiary.currency.exchangerate}*1*/, \n  \"TRANSACTION\".tranid AS tranid /*{tranid#RAW}*/\nFROM \n  \"TRANSACTION\", \n  Nexus, \n  \"ACCOUNT\", \n  TransactionAccountingLine, \n  (SELECT \n    transactionTaxDetail.\"TRANSACTION\" AS transaction_join, \n    transactionTaxDetail.line AS line_join, \n    salesTaxItem_SUB.custrecord_ste_taxauthority_level AS custrecord_ste_taxauthority_level_0, \n    salesTaxItem_SUB.name AS name_0, \n    transactionTaxDetail.taxrate AS taxrate, \n    transactionTaxDetail.basetaxamount AS basetaxamount\n  FROM \n    transactionTaxDetail, \n    (SELECT \n      salesTaxItem.\"ID\" AS \"ID\", \n      salesTaxItem.\"ID\" AS id_join, \n      CUSTOMRECORD_STE_TAXAUTHORITY.custrecord_ste_taxauthority_level AS custrecord_ste_taxauthority_level, \n      CUSTOMRECORD_STE_TAXAUTHORITY.name AS name\n    FROM \n      salesTaxItem, \n      CUSTOMRECORD_STE_TAXAUTHORITY\n    WHERE \n      salesTaxItem.custrecord_ste_taxcode_imposeauthority = CUSTOMRECORD_STE_TAXAUTHORITY.\"ID\"(+)\n    ) salesTaxItem_SUB\n  WHERE \n    transactionTaxDetail.taxcode = salesTaxItem_SUB.\"ID\"(+)\n  ) transactionTaxDetail_SUB, \n  (SELECT \n    Subsidiary.\"ID\" AS id_join, \n    currency.exchangerate AS exchangerate\n  FROM \n    Subsidiary, \n    currency\n  WHERE \n    Subsidiary.currency = currency.\"ID\"(+)\n  ) Subsidiary_SUB, \n  transactionLine\nWHERE \n  ((((((\"TRANSACTION\".nexus = Nexus.\"ID\"(+) AND TransactionAccountingLine.\"ACCOUNT\" = \"ACCOUNT\".\"ID\"(+)) AND (transactionLine.\"TRANSACTION\" = TransactionAccountingLine.\"TRANSACTION\" AND transactionLine.\"ID\" = TransactionAccountingLine.transactionline)) AND (transactionLine.\"TRANSACTION\" = transactionTaxDetail_SUB.transaction_join(+) AND transactionLine.\"ID\" = transactionTaxDetail_SUB.line_join(+))) AND transactionLine.subsidiary = Subsidiary_SUB.id_join(+)) AND \"TRANSACTION\".\"ID\" = transactionLine.\"TRANSACTION\"))\n   AND ((\"TRANSACTION\".\"TYPE\" IN ('CashRfnd', 'CashSale', 'CustCred', 'InvAdjst', 'CustInvc') AND \"TRANSACTION\".posting = ? AND NVL(\"TRANSACTION\".legacytax, 'F') = ? AND NVL(transactionLine.mainline, 'F') = ? AND NVL(transactionLine.taxline, 'F') = ? AND transactionLine.itemtype IN ('Assembly', 'InvtPart', 'NonInvtPart', 'Kit', 'Group', 'Service', 'OthCharge', 'ShipItem') AND UPPER(Nexus.country) = ? AND TransactionAccountingLine.amount IS NOT NULL AND NOT(\n    UPPER(\"ACCOUNT\".accttype) IS NULL OR UPPER(\"ACCOUNT\".accttype) IN ('NONPOSTING')\n  )))\n";
    const MAX_ROWS=20000;
    // Inventory Adjustment "use tax" lines. One row per adjustment detail line; the per-authority
    // breakdown that beforeSubmit (BC_UE_IA_Tax_Calculation) wrote to custcol_bc_tax_object is
    // parsed in JS, not here — this stays a plain, non-fan-out join so no duplicate-row safety
    // check is needed the way BASE_QUERY needs one.
    const ADJ_QUERY = "SELECT \n  \"TRANSACTION\".id AS transactionInternalId,\n  \"TRANSACTION\".\"TYPE\" AS transactionType,\n  TransactionLine.uniquekey AS transactionLineUniqueKey, \n  \"TRANSACTION\".tranid AS tranid, \n  \"TRANSACTION\".trandate AS transactionDate, \n  TransactionLine.subsidiary AS subsidiary, \n  TransactionLine.amount AS baseAmount, \n  TransactionLine.custcol_bc_tax_object AS taxObject \nFROM \n  \"TRANSACTION\", \n  TransactionLine \nWHERE \n  \"TRANSACTION\".\"ID\" = TransactionLine.\"TRANSACTION\" \n  AND \"TRANSACTION\".\"TYPE\" = 'InvAdjst' \n  AND \"TRANSACTION\".posting = 'T' \n  AND NVL(TransactionLine.mainline,'F') = 'F' \n  AND TransactionLine.amount <> 0 \n  AND TransactionLine.custcol_bc_tax_object IS NOT NULL";
    function transactionLink(id, type) {
        const types={CustInvc:'invoice',CashSale:'cashsale',CustCred:'creditmemo',CashRfnd:'cashrefund',InvAdjst:'inventoryadjustment'};
        if(!/^\d+$/.test(String(id||'')) || !types[type])return '';
        return recordUrl.resolveRecord({recordType:types[type],recordId:String(id),isEditMode:false});
    }
    function buildAdjQuery(f) {
        let where="q.transactionDate >= TO_DATE(?, 'YYYY-MM-DD') AND q.transactionDate < TO_DATE(?, 'YYYY-MM-DD') + 1";
        const params=[f.from,f.to];
        if(f.subsidiary){where+=' AND q.subsidiary = ?';params.push(Number(f.subsidiary));}
        return {source:' FROM ('+ADJ_QUERY+') q WHERE '+where,params};
    }
    const esc=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const json=v=>JSON.stringify(v).replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
    function checkDate(value) {
        if(!/^\d{4}-\d{2}-\d{2}$/.test(value||''))throw Error('Enter a valid date range.');
        const d=new Date(value+'T00:00:00Z');
        if(isNaN(d.getTime())||d.toISOString().slice(0,10)!==value)throw Error('Enter a valid date range.');
        return value;
    }
    function buildQuery(f) {
        // Only outer report constraints are applied. No conversion or custom inventory logic is added.
        let where="q.transactionDate >= TO_DATE(?, 'YYYY-MM-DD') AND q.transactionDate < TO_DATE(?, 'YYYY-MM-DD') + 1";
        const params=['T','F','F','F',f.country,f.from,f.to];
        if(f.subsidiary){where+=' AND q.subsidiary = ?';params.push(Number(f.subsidiary));}
        return {source:' FROM ('+BASE_QUERY+') q WHERE '+where,params};
    }
    function fetchReport(f) {
        const q=buildQuery(f);
        // The unchanged projection lacks tax-detail/accounting-row IDs. Reject an ambiguous grain
        // BEFORE paging rather than silently dropping valid rows or multiplying tax.
        const ambiguous=query.runSuiteQL({query:'SELECT * FROM (SELECT q.transactionLineUniqueKey'+q.source+
            ' GROUP BY q.transactionLineUniqueKey, q.imposingTaxAuthorityInfoName, q.taxRate HAVING COUNT(*) > 1) WHERE ROWNUM <= 1',params:q.params}).results;
        if(ambiguous.length)throw Error('Line '+ambiguous[0].values[0]+' repeats within one authority and rate. The query needs tax-detail/accounting identifiers to resolve it safely. No partial totals are shown.');
        const sql=`SELECT q.transactionLineUniqueKey,q.nexusState,q.imposingTaxAuthorityInfoLevel,
            q.imposingTaxAuthorityInfoName,q.taxRate,TO_CHAR(q.transactionDate,'YYYY-MM-DD'),
            q.subsidiary,q.totalSales,q.nonTaxableSales,q.taxableSales,q.taxCollected,q.tranid,q.transactionInternalId,q.transactionType`+q.source+
            ' ORDER BY q.transactionLineUniqueKey,q.imposingTaxAuthorityInfoName,q.taxRate';
        const paged=query.runSuiteQLPaged({query:sql,params:q.params,pageSize:1000});
        if(paged.count>MAX_ROWS)throw Error('More than '+MAX_ROWS.toLocaleString()+' tax rows match. Narrow the date range or subsidiary to load a complete report.');
        const levels=new Map();
        if(paged.count){
            // Display labels are queried separately to leave the supplied dataset query untouched.
            query.runSuiteQL({query:`SELECT DISTINCT custrecord_ste_taxauthority_level,
                BUILTIN.DF(custrecord_ste_taxauthority_level)
                FROM CUSTOMRECORD_STE_TAXAUTHORITY
                WHERE custrecord_ste_taxauthority_level IS NOT NULL`}).results.forEach(r=>levels.set(String(r.values[0]),String(r.values[1]||'')));
        }
        const rows=[];
        paged.pageRanges.forEach(p=>{
            if(runtime.getCurrentScript().getRemainingUsage()<100)throw Error('The report exceeds available processing capacity. Narrow the date range.');
            paged.fetch({index:p.index}).data.results.forEach(result=>{
                const v=result.values,n=taxReportCore().amount;
                rows.push({key:String(v[0]==null?'':v[0]),state:String(v[1]||''),level:levels.get(String(v[2]))||String(v[2]||''),
                    authority:String(v[3]||''),rate:v[4]==null?null:Number((n(v[4])*100).toFixed(2)),date:String(v[5]||''),subsidiary:String(v[6]||''),
                    sales:n(v[7]),nonTaxable:n(v[8]),taxable:n(v[9]),tax:n(v[10]),document:String(v[11]||''),transactionUrl:transactionLink(v[12],v[13]),nonTaxableAdj:0,taxableAdj:0});
            });
        });
        const allRows=rows.concat(fetchAdjustmentRows(f));
        taxReportCore().validate(allRows);
        return allRows;
    }
    // Inventory Adjustment "use tax" rows, exploded from custcol_bc_tax_object per authority so they
    // slot into the same State -> Authority -> Rate -> Transaction tree as sales rows. A line with no
    // breakdown (custcol_bc_tax_object empty) has no authority to hang off, so it posts as one row with
    // state/authority blank — the same (Blank) bucket blank-state sales rows already land in.
    function fetchAdjustmentRows(f) {
        const q=buildAdjQuery(f);
        const sql='SELECT q.transactionLineUniqueKey,q.tranid,TO_CHAR(q.transactionDate,\'YYYY-MM-DD\'),q.subsidiary,q.baseAmount,q.taxObject,q.transactionInternalId'+q.source+
            ' ORDER BY q.transactionLineUniqueKey';
        const paged=query.runSuiteQLPaged({query:sql,params:q.params,pageSize:1000});
        if(paged.count>MAX_ROWS)throw Error('More than '+MAX_ROWS.toLocaleString()+' inventory adjustment rows match. Narrow the date range or subsidiary to load a complete report.');
        const num=v=>{const x=Number(v);return Number.isFinite(x)?x:0;};
        const rows=[];
        paged.pageRanges.forEach(p=>{
            if(runtime.getCurrentScript().getRemainingUsage()<100)throw Error('The report exceeds available processing capacity. Narrow the date range.');
            paged.fetch({index:p.index}).data.results.forEach(result=>{
                const v=result.values;
                const key=String(v[0]==null?'':v[0]),tranid=String(v[1]||''),date=String(v[2]||''),subsidiary=String(v[3]||'');
                const baseAmt=num(v[4]);
                let breakdown=[];
                if(v[5]){
                    try{breakdown=JSON.parse(v[5]);if(!Array.isArray(breakdown))breakdown=[];}
                    catch(e){log.error({title:'Sales Tax Liability: unreadable tax object',details:{key:key,tranid:tranid,raw:v[5]}});breakdown=[];}
                }
                const base={key:key,date:date,subsidiary:subsidiary,document:tranid,transactionUrl:transactionLink(v[6],'InvAdjst'),sales:0,nonTaxable:0,taxable:0};
                if(!breakdown.length){
                    rows.push(Object.assign({},base,{state:'',authority:'',level:'',rate:null,nonTaxableAdj:baseAmt,taxableAdj:0,tax:0}));
                    return;
                }
                breakdown.forEach(entry=>{
                    const rate=entry&&entry.rate!=null?Number(num(entry.rate).toFixed(2)):null;
                    const taxAmt=num(entry&&entry.amount);
                    rows.push(Object.assign({},base,{
                        state:String((entry&&entry.state)||''),authority:String((entry&&entry.name)||''),level:'',rate:rate,
                        nonTaxableAdj:taxAmt===0?baseAmt:0,taxableAdj:taxAmt!==0?baseAmt:0,tax:taxAmt
                    }));
                });
            });
        });
        return rows;
    }
    function renderPage(payload,subsidiaries) {
        const f=payload;
        const optionHtml='<option value="">All accessible subsidiaries</option>'+subsidiaries.map(s=>'<option value="'+esc(s.id)+'"'+(String(s.id)===f.subsidiary?' selected':'')+'>'+esc(s.name)+'</option>').join('');
        const filterButton=(field,label)=>'<button type="button" class="header-filter" data-filter="'+field+'" data-label="'+label+'" aria-expanded="false" aria-haspopup="dialog">'+label+'<span aria-hidden="true">▾</span></button>';
        const disabled=payload.error?' disabled':'';
        return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sales Tax Liability</title><style>*{box-sizing:border-box}body{margin:0;background:#f5f6f8;color:#203344;font:13px -apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif}main{max-width:1720px;margin:auto;padding:32px 34px 24px}button,input,select{font:inherit}button{cursor:pointer;border:1px solid #d8e0e5;border-radius:6px;background:#fff;padding:9px 13px;color:#365263;font-weight:550}button:hover{background:#f0f5f5}button:disabled{opacity:.45;cursor:default}button:focus-visible,input:focus-visible,select:focus-visible{outline:3px solid #7bb7b1;outline-offset:2px}[hidden]{display:none!important}.primary{background:#176a62;border-color:#176a62;color:white}.primary:hover{background:#12564f}header{display:flex;justify-content:space-between;align-items:center;margin-bottom:24px}.eyebrow{font-size:10px;font-weight:700;letter-spacing:1.8px;color:#819099}h1{font-size:29px;letter-spacing:-.8px;font-weight:650;margin:10px 0 7px}header p{color:#75858e;margin:0}header .primary{padding:11px 18px}.filters{display:flex;gap:16px;align-items:end;border:1px solid #e0e5e9;background:#fff;border-radius:9px;padding:18px 20px}.filters label{display:flex;flex-direction:column;gap:7px;color:#6c7d86;font-size:11px;font-weight:600}input,select{border:1px solid #d8e1e7;border-radius:5px;height:36px;padding:0 10px;background:#fff;color:#263e4b}input[type=date]{width:155px}.subsidiary{flex:1;max-width:400px;min-width:190px}.country{width:80px}.load{height:36px;background:#edf4f2;border-color:#cbded9;color:#1c665d;padding:0 20px}.metrics{display:flex;margin:24px 0;gap:0;padding:2px 0}.metrics>div{min-width:220px;padding:0 34px;border-right:1px solid #dce3e6}.metrics>div:first-child{padding-left:0}.metrics>div:last-child{border:0}.metrics small{font-size:11px;color:#7a8b93}.metrics strong{display:block;font-size:25px;font-weight:600;letter-spacing:-.5px;margin-top:8px;font-variant-numeric:tabular-nums}.report{background:#fff;border:1px solid #dfe5e8;border-radius:9px;margin-top:22px;overflow:hidden}.report-toolbar{display:flex;justify-content:space-between;align-items:center;padding:20px 22px 15px;gap:16px}h2{font-size:15px;margin:0 0 6px;font-weight:650}.report-toolbar p{margin:0;font-size:11px;color:#7b8d97}.actions{display:flex;gap:7px}.actions button{font-size:11px;padding:7px 10px}.filter-status{display:flex;justify-content:space-between;gap:12px;padding:10px 22px;background:#fafcfc;border-top:1px solid #edf1f3;font-size:11px;color:#748892;align-items:center}.filter-status button{border:0;padding:0;background:transparent;font-size:11px;color:#246e65}.table-scroll{overflow:auto;max-height:65vh}table{border-collapse:separate;border-spacing:0;width:100%;min-width:1310px;table-layout:fixed}.state-col{width:165px}.authority-col{width:270px}.rate-col{width:105px}.document-col{width:185px}th,td{padding:13px 14px;text-align:left;border-bottom:1px solid #e9eef1;vertical-align:middle}th{font-size:10px;letter-spacing:.2px;color:#6f828e;background:#f3f6f8;position:sticky;top:0;z-index:1;font-weight:650}th small{display:block;font-size:9px;color:#95a2ab;margin-top:4px}.header-filter{border:0;background:transparent!important;padding:0;width:100%;display:flex;justify-content:space-between;align-items:center;text-align:left;font-size:11px;gap:5px;color:inherit}.header-filter span{color:#99a8b0;font-size:13px}.is-filtered{color:#126457!important}.is-filtered span{color:#126457!important}button.is-filtered{box-shadow:inset 0 -2px #247b6b}td{font-size:12px;overflow-wrap:anywhere}.number{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}.tax-value{color:#216a61}.level-0 td{background:#edf4f3;font-weight:650;padding-top:17px;padding-bottom:17px}.level-1 td{background:#f8fafb;font-weight:550}.level-2 td{background:#fff}.level-3 td{color:#677b86;font-size:11px;background:#fff}.level-3 .tax-value{color:#216a61}.branch{display:flex;align-items:center;gap:10px;line-height:1.45}.toggle{padding:0;width:21px;height:21px;flex-shrink:0;display:inline-flex;align-items:center;justify-content:center;font-size:15px;border-color:#c7d7d6;color:#23685e;border-radius:4px}.document{color:#304f61;font-weight:550}.count{color:#899aa3;font-size:10px;font-weight:400}.ancestor{color:#8b9aa2;font-size:11px}td small{display:block;font-size:10px;color:#94a0a8;margin-top:4px}tfoot td{background:#e4eeec;font-weight:650;border-bottom:0;position:sticky;bottom:0;z-index:1;padding-top:15px;padding-bottom:15px}.empty{text-align:center;padding:60px;color:#718793}.empty small{margin-top:9px}.error{margin:20px 0;padding:16px;background:#fff2ef;border:1px solid #ebc9bf;border-radius:7px;color:#923e30;line-height:1.6}.preview-banner{padding:12px 16px;background:#fff8e5;color:#816c33;border:1px solid #e9ddba;border-radius:6px;margin-bottom:18px;font-size:12px}footer{color:#83929b;font-size:10px;line-height:1.7;margin-top:17px}footer p{margin:5px 0}.filter-popup{position:fixed;width:304px;max-height:calc(100vh - 20px);overflow:auto;background:white;border:1px solid #d5dfe5;box-shadow:0 10px 35px #233b4826;border-radius:8px;padding:16px;z-index:20}.popup-title{display:flex;justify-content:space-between;align-items:center;font-weight:650;margin-bottom:14px}.icon-close{border:0;padding:0 5px;font-size:21px;font-weight:400}.option-search{width:100%}.selection-actions{display:flex;gap:10px;margin:9px 0}.selection-actions button{font-size:11px;border:0;padding:4px 0;color:#2d766c}.option-list{max-height:230px;overflow:auto;border-top:1px solid #edf1f4;padding:6px 0}.option-list label{display:flex;gap:9px;align-items:center;line-height:1.5;padding:6px 2px;font-size:12px}.option-list input{height:15px;width:15px;accent-color:#176a62;flex-shrink:0}.popup-footer{display:flex;justify-content:space-between;border-top:1px solid #edf1f3;padding-top:12px;margin-top:8px}.popup-footer button{font-size:12px;padding:7px 15px}.input-label{display:flex;flex-direction:column;gap:7px;margin:12px 0;font-size:11px;color:#6f828d}.field-error{font-size:11px;color:#9b3d32}.muted{font-size:11px;color:#85949c}@media(max-width:800px){main{padding:20px 14px}h1{font-size:25px}.filters{flex-wrap:wrap}.metrics{flex-wrap:wrap;gap:16px}.metrics>div{min-width:140px;padding:0 15px}.metrics strong{font-size:22px}.report-toolbar{flex-direction:column;align-items:start}.actions{flex-wrap:wrap}.table-scroll{max-height:70vh}}@media print{body{background:white}main{padding:0}.filters,.actions,.filter-status,header>button,.toggle,footer,.preview-banner{display:none}.table-scroll{max-height:none;overflow:visible}table{min-width:0}th,tfoot td{position:static}.report{border:0}.metrics{break-inside:avoid}}
</style></head><body><main>
        <header><div><div class="eyebrow">FINANCE / TAX REPORTING</div><h1>Sales Tax Liability</h1><p>State totals. Authority breakdowns. Every transaction.</p></div><div style="display:flex;gap:8px"><button type="button" id="export-pdf" class="primary"${disabled}>↓ Export PDF</button><button type="button" id="export" class="primary"${disabled}>↓ Export CSV</button></div></header>
        ${payload.preview?'<div class="preview-banner">Preview using the supplied CSV snapshot. Filters, drill-down and CSV export work locally; loading another date range requires the deployed Suitelet.</div>':''}
        <form method="post" class="filters" id="date-form"><label>From date<input type="date" name="custpage_from" value="${esc(f.from)}" required></label><label>To date<input type="date" name="custpage_to" value="${esc(f.to)}" required></label><label class="subsidiary">Subsidiary<select name="custpage_subsidiary">${optionHtml}</select></label><button type="submit" class="load">Load report</button></form>
        ${payload.error?'<div class="error" role="alert">'+esc(payload.error)+'</div>':''}<div id="client-error" class="error" role="alert" hidden></div>
        <section class="report" id="results"><div class="report-toolbar"><div><h2>Tax breakdown</h2><p id="record-count">${payload.error?'Report unavailable. Resolve the error and try again.':''}</p></div><div class="actions"><button type="button" id="expand-all"${disabled}>Expand all</button><button type="button" id="collapse-all"${disabled}>Collapse all</button></div></div>
        <div class="filter-status"><span id="active-filters">All loaded records</span><button type="button" id="reset"${disabled}>Clear filters</button></div>
        <div class="table-scroll"><table><colgroup><col class="state-col"><col class="authority-col"><col class="rate-col"><col><col><col><col><col><col><col><col class="document-col"></colgroup><thead><tr><th>${filterButton('state','State')}</th><th>${filterButton('authority','Tax Authority')}</th><th>${filterButton('rate','Tax Rate')}</th><th class="number">Total Sales<small>USD</small></th><th class="number">Non-taxable Sales<small>USD</small></th><th class="number">Taxable Sales<small>USD</small></th><th class="number">Non Taxable Adj.<small>USD</small></th><th class="number">Taxable Adj.<small>USD</small></th><th class="number">Total Adjustment<small>USD</small></th><th class="number">Tax Collected<small>USD</small></th><th>${filterButton('document','Transaction tranid')}</th></tr></thead><tbody id="report-body">${disabled?'<tr><td colspan="11" class="empty">No partial results are displayed.<small>Resolve the error above, then reload.</small></td></tr>':''}</tbody><tfoot><tr id="total-row"></tr></tfoot></table></div></section>
        <aside id="filter-popup" class="filter-popup" role="dialog" aria-label="Column filter" hidden></aside>
        <script>${taxReportCore.toString()}\n${startTaxReport.toString()}\nconst reportPayload=${json(payload)};
        if(!reportPayload.error){startTaxReport(reportPayload);}else{document.querySelectorAll('[data-filter]').forEach(b=>b.disabled=true);}
        document.getElementById('date-form').addEventListener('submit',function(e){if(reportPayload.preview){e.preventDefault();alert('This preview uses the supplied CSV snapshot. Use the Suitelet to load another date range.');return;}const b=this.querySelector('button[type=submit]');b.disabled=true;b.textContent='Loading…';});
        </script></main></body></html>`;
    }
    // Script parameter (create as Free-Form Text on this Suitelet's script record).
    // Format: YYYY-MM-DD,YYYY-MM-DD  e.g. 2024-01-01,2024-12-31
    // Leave it blank/unset to default to a full-history report instead.
    const PARAM_DEFAULT_RANGE='custscript_ste_stl_default_range';
    const FULL_HISTORY_FROM='1900-01-01';
    function defaultDateRange(iso) {
        let raw='';
        try{raw=String(runtime.getCurrentScript().getParameter({name:PARAM_DEFAULT_RANGE})||'').trim();}catch(e){}
        const m=raw.match(/^(\d{4}-\d{2}-\d{2})\s*,\s*(\d{4}-\d{2}-\d{2})$/);
        return m?{from:m[1],to:m[2]}:{from:FULL_HISTORY_FROM,to:iso(new Date())};
    }
    // Export-only helpers. The query, UI aggregation and existing filters are unchanged.
    function readPdfFilters(raw) {
        const f=JSON.parse(raw||'{}'),out={};
        ['state','authority','city'].forEach(k=>{
            if(f[k]!=null&&!Array.isArray(f[k]))throw Error('Invalid PDF selection.');
            out[k]=f[k]==null?null:new Set(f[k].map(String));
        });
        out.document=String(f.document||'');out.rateOp=String(f.rateOp||'all');
        if(!['all','eq','gt','gte','lt','lte','between'].includes(out.rateOp))throw Error('Invalid PDF rate filter.');
        out.rateA=f.rateA;out.rateB=f.rateB;
        if(out.rateOp!=='all'&&(f.rateA==null||f.rateA===''||!Number.isFinite(Number(f.rateA))||
            (out.rateOp==='between'&&(f.rateB==null||f.rateB===''||!Number.isFinite(Number(f.rateB))||Number(f.rateA)>Number(f.rateB)))))throw Error('Invalid PDF rate range.');
        return out;
    }
    function pdfXml(rows,payload,subsidiaries,filters) {
        const core=taxReportCore(),root=core.tree(rows);
        const x=v=>esc(String(v==null?'':v).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g,''));
        const money=v=>Number(v||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
        const blank=v=>v==null||v===''?'(Blank)':String(v);
        const compare=(a,b)=>String(a).localeCompare(String(b),'en',{numeric:true,sensitivity:'base'})||String(a).localeCompare(String(b));
        const sorted=n=>Array.from(n.children.values()).sort((a,b)=>a.kind==='rate'?
            (a.label===null?-Infinity:Number(a.label))-(b.label===null?-Infinity:Number(b.label)):
            compare(a.label,b.label)||compare(JSON.stringify(a.path),JSON.stringify(b.path)));
        const cells=n=>[n.sales,n.nonTaxable,n.taxable,n.nonTaxableAdj,n.taxableAdj,n.nonTaxableAdj+n.taxableAdj,n.tax].map(v=>'<td align="right">'+x(money(v))+'</td>').join('');
        const headers=['State / Authority / Rate / Transaction','Total Sales','Non-taxable Sales','Taxable Sales','Non Taxable Adj.','Taxable Adj.','Total Adjustment','Tax Collected'];
        const head='<thead><tr>'+headers.map((h,i)=>'<th width="'+(i===0?'30%':'10%')+'" align="'+(i===0?'left':'right')+'">'+x(h)+'</th>').join('')+'</tr></thead>';
        const subsidiary=payload.subsidiary?(subsidiaries.find(s=>String(s.id)===payload.subsidiary)||{}).name:'All accessible subsidiaries';
        const descriptions=[];
        ['state','authority','city'].forEach(k=>{if(filters[k]!==null)descriptions.push(k+': '+(Array.from(filters[k]).join(', ')||'(none)'));});
        if(filters.rateOp!=='all')descriptions.push('Rate '+filters.rateOp+' '+filters.rateA+(filters.rateOp==='between'?' to '+filters.rateB:'')+'%');
        if(filters.document)descriptions.push('Transaction contains: '+filters.document);
        let body='<h1>Sales Tax Liability</h1><p>'+x(payload.from)+' to '+x(payload.to)+' | '+x(subsidiary)+' | USD</p>'+
            '<p class="muted">'+x(descriptions.join(' | ')||'All loaded records')+'</p>';
        function row(n,label,kind){return '<tr class="'+kind+'"><td>'+label+'</td>'+cells(n)+'</tr>';}
        sorted(root).forEach(state=>{
            body+='<table width="100%">'+head+'<tbody>'+row(state,'State: '+x(blank(state.label)),'state');
            sorted(state).forEach(authority=>{
                body+=row(authority,'&#160;&#160;Authority: '+x(blank(authority.label)),'authority');
                sorted(authority).forEach(rate=>{
                    const label=rate.label===null?'(No rate)':Number(rate.label).toFixed(2)+'%';
                    body+=row(rate,'&#160;&#160;&#160;&#160;Rate: '+x(label),'rate');
                    sorted(rate).forEach(t=>{
                        const context=blank(state.label)+' / '+blank(authority.label)+' / '+label;
                        body+=row(t,'&#160;&#160;&#160;&#160;&#160;&#160;'+x(t.label)+'<br/><span class="muted">'+x(Array.from(t.dates).sort().join(', '))+'<br/>'+x(context)+'</span>','transaction');
                    });
                });
            });
            body+='</tbody></table><p></p>';
        });
        if(!rows.length)body+='<p>No matching records.</p>';
        body+='<table width="100%">'+head+'<tbody>'+row(root,'Filtered total','state')+'</tbody></table>'+
            '<p class="muted">Sales and adjustment bases are counted once per line within each parent. Parent bases may differ from the sum of their children. Tax components are added. All filtered transactions are included, regardless of screen expansion.</p>';
        return '<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE pdf PUBLIC "-//big.faceless.org//report" "report-1.1.dtd">'+
            '<pdf><head><macrolist><macro id="reportFooter"><p align="right" font-size="8">Sales Tax Liability | Page <pagenumber/> of <totalpages/></p></macro></macrolist><style>'+ 
            'body{font-family:Helvetica;font-size:8pt;color:#203344;}h1{font-size:19pt;}p{font-size:9pt;}table{table-layout:fixed;}th{background-color:#e7efed;font-size:8pt;padding:7px 4px;}td{padding:6px 4px;border-bottom:0.5px solid #e2e8eb;}tr{page-break-inside:avoid;}.state{background-color:#dcebe7;font-weight:bold;}.authority{background-color:#edf3f4;font-weight:bold;}.rate{background-color:#f6f8f9;font-weight:bold;}.muted{font-size:7pt;color:#6c7e87;}'+
            '</style></head><body size="A4-landscape" padding="0.4in" footer="reportFooter" footer-height="0.25in">'+body+'</body></pdf>';
    }

    function onRequest(context) {
        const p=context.request.parameters,isPost=context.request.method==='POST';
        const iso=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
        const defaults=defaultDateRange(iso);
        // GET (first load, or a plain revisit) always runs the report — using the
        // custscript_ste_stl_default_range parameter if it's filled in, otherwise the
        // full transaction history — instead of waiting for the user to submit the form.
        const payload={from:isPost?String(p.custpage_from||''):defaults.from,to:isPost?String(p.custpage_to||''):defaults.to,
            subsidiary:isPost?String(p.custpage_subsidiary||''):'',country:'US',rows:[],error:''};
        let subsidiaries=[];
        try{
            subsidiaries=query.runSuiteQL({query:'SELECT id,name FROM subsidiary ORDER BY name,id'}).results.map(r=>({id:r.values[0],name:r.values[1]}));
            checkDate(payload.from);checkDate(payload.to);
            if(payload.from>payload.to)throw Error('From date must be on or before To date.');
            if(payload.subsidiary&&(!/^\d+$/.test(payload.subsidiary)||!subsidiaries.some(s=>String(s.id)===payload.subsidiary)))throw Error('Choose an accessible subsidiary.');
            payload.rows=fetchReport(payload);
            if(isPost && p.custpage_export_action==='pdf') {
                const selection=readPdfFilters(p.custpage_export_filters);
                const exportRows=taxReportCore().filter(payload.rows,selection);
                const xml=pdfXml(exportRows,payload,subsidiaries,selection);
                if(xml.length>4000000)throw Error('The PDF is too large. Narrow the report filters and export again.');
                const file=pdfRender.xmlToPdf({xmlString:xml});
                file.name='Sales_Tax_Liability_'+payload.from+'_'+payload.to+'.pdf';
                context.response.writeFile({file:file,isInline:false});
                return;
            }
        }catch(e){payload.rows=[];payload.error=e.message||String(e);log.error({title:'Sales Tax Liability',details:e});}
        context.response.setHeader({name:'Content-Type',value:'text/html; charset=UTF-8'});
        context.response.write({output:renderPage(payload,subsidiaries)});
    }
    function taxReportCore() {
    const fields = ['sales', 'nonTaxable', 'taxable'];
    // Deduped once per line per node, same mechanism as `fields` — but tracked separately (own
    // Set, own array) and never added to `fields` itself. `fields` also feeds validate()'s strict
    // cross-node consistency check, which exists to catch a genuinely ambiguous SQL join grain for
    // sales rows. An adjustment line legitimately CAN post nonTaxableAdj under one authority and
    // taxableAdj under another (e.g. a 0% authority alongside a taxed one on the same line) — that's
    // real data, not a data-integrity problem, so it must not trip that check.
    const adjFields = ['nonTaxableAdj', 'taxableAdj'];
    function amount(value) {
        if (value === null || value === undefined || value === '') return 0;
        const n = Number(value);
        if (!Number.isFinite(n)) throw Error('Invalid numeric amount in query results.');
        return n;
    }
    function validate(rows) {
        const lines = new Map(), components = new Set();
        rows.forEach(r => {
            if (!r.key) throw Error('A transaction line has no unique key. Totals cannot be deduplicated safely.');
            const signature = JSON.stringify(fields.map(f => amount(r[f])));
            if (lines.has(r.key) && lines.get(r.key) !== signature)
                throw Error('Line ' + r.key + ' has conflicting accounting amounts. Review its accounting-impact rows before reporting.');
            lines.set(r.key, signature);
            const component = JSON.stringify([r.key, r.authority, r.rate]);
            if (components.has(component)) throw Error('Line ' + r.key + ' repeats within the same authority and rate. Tax-detail identifiers are needed to resolve these rows safely.');
            components.add(component);
            amount(r.tax);
        });
    }
    function node(kind, label, path) {
        return {kind, label, path, sales:0, nonTaxable:0, taxable:0, nonTaxableAdj:0, taxableAdj:0, tax:0, seen:new Set(), seenAdj:new Set(), children:new Map(), dates:new Set(), transactionUrls:new Set()};
    }
    function add(n, r) {
        if(n.kind==='transaction' && r.transactionUrl)n.transactionUrls.add(r.transactionUrl);
        if (!n.seen.has(r.key)) {
            fields.forEach(f => { n[f] += amount(r[f]); });
            n.seen.add(r.key);
        }
        if (!n.seenAdj.has(r.key)) {
            adjFields.forEach(f => { n[f] += amount(r[f]); });
            n.seenAdj.add(r.key);
        }
        n.tax += amount(r.tax);
        if (r.date) n.dates.add(r.date);
    }
    function tree(rows) {
        const root = node('total','Filtered total',[]);
        rows.forEach(r => {
            add(root,r);
            let p = root;
            const levels = [['state',r.state], ['authority',r.authority], ['rate',r.rate],
                // Blank document numbers must not merge unrelated records.
                ['transaction',JSON.stringify([r.document || ('Line '+r.key),r.subsidiary,r.date])]];
            levels.forEach(([kind,key]) => {
                const label = kind === 'transaction' ? (r.document || '(No document number)') : key;
                if (!p.children.has(key)) p.children.set(key,node(kind,label,p.path.concat([key])));
                p=p.children.get(key); add(p,r);
            });
        });
        return root;
    }
    function choices(rows,field) {
        return Array.from(new Set(rows.filter(r => field!=='city'||r.level.toLowerCase()==='city')
            .map(r=>field==='city'?r.authority:r[field]))).sort((a,b)=>String(a).localeCompare(String(b)));
    }
    function filter(rows, filters) {
        return rows.filter(r => {
            for (const field of ['state','authority','city']) {
                const selected=filters[field];
                if(selected !== null && selected !== undefined && (!selected.has(field==='city'?r.authority:r[field]) || (field==='city' && r.level.toLowerCase()!=='city'))) return false;
            }
            if(filters.document && !r.document.toLowerCase().includes(filters.document.toLowerCase())) return false;
            const op=filters.rateOp;
            if(!op || op==='all') return true;
            if(r.rate===null) return false;
            const a=Number(filters.rateA),b=Number(filters.rateB),rate=Number(r.rate);
            return op==='eq'?rate===a:op==='gt'?rate>a:op==='gte'?rate>=a:op==='lt'?rate<a:op==='lte'?rate<=a:rate>=a&&rate<=b;
        });
    }
    function csvCell(value) {
        let text=String(value==null?'':value);
        // Keep actual numeric negative amounts numeric; protect text from spreadsheet formulas.
        if(typeof value!=='number' && /^[\s]*[=+\-@\t\r\n]/.test(text)) text="'"+text;
        return '"'+text.replace(/"/g,'""')+'"';
    }
    function sortExportRows(rows) {
        const cmp=(a,b)=>String(a==null?'':a).localeCompare(String(b==null?'':b),'en',{numeric:true,sensitivity:'base'})||String(a==null?'':a).localeCompare(String(b==null?'':b));
        return rows.slice().sort((a,b)=>cmp(a.state,b.state)||cmp(a.authority,b.authority)||
            (a.rate==null?-Infinity:Number(a.rate))-(b.rate==null?-Infinity:Number(b.rate))||
            cmp(a.document,b.document)||cmp(a.date,b.date)||cmp(a.subsidiary,b.subsidiary)||cmp(a.key,b.key));
    }
    function csv(rows) {
        const columns=['State','Tax Authority','Tax Rate (%)','Total Sales (USD)','Non Taxable Sales (USD)','Taxable Sales (USD)','Non Taxable Adj. (USD)','Taxable Adj. (USD)','Total Adjustment (USD)','Tax Collected (USD)','Transaction tranid','Transaction Date','Line Unique Key','Jurisdiction Level','Subsidiary ID'];
        return '\uFEFF'+[columns,...sortExportRows(rows).map(r=>[r.state,r.authority,r.rate==null?'':Number(r.rate).toFixed(2),r.sales,r.nonTaxable,r.taxable,r.nonTaxableAdj,r.taxableAdj,r.nonTaxableAdj+r.taxableAdj,r.tax,r.document,r.date,r.key,r.level,r.subsidiary])].map(row=>row.map(csvCell).join(',')).join('\r\n');
    }
    return {amount,validate,tree,choices,filter,csv};
}
function startTaxReport(payload) {
    'use strict';
    const core=taxReportCore(), rows=payload.rows;
    const esc=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const money=v=>Number(v).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
    const display=v=>v===null?'(No rate)':v===''?'(Blank)':String(v);
    const filters={state:null,authority:null,city:null,rateOp:'all',rateA:'',rateB:'',document:''};
    const optionSets={state:core.choices(rows,'state'),authority:core.choices(rows,'authority'),city:core.choices(rows,'city')};
    const expanded=new Set(); let filtered=[],root,activeButton=null;
    const body=document.getElementById('report-body'), popup=document.getElementById('filter-popup');
    const pathId=n=>JSON.stringify(n.path);
    const moneyCells=n=>
        '<td class="number">'+money(n.sales)+'</td>'+
        '<td class="number">'+money(n.nonTaxable)+'</td>'+
        '<td class="number">'+money(n.taxable)+'</td>'+
        '<td class="number">'+money(n.nonTaxableAdj)+'</td>'+
        '<td class="number">'+money(n.taxableAdj)+'</td>'+
        '<td class="number">'+money(n.nonTaxableAdj+n.taxableAdj)+'</td>'+
        '<td class="number tax-value">'+money(n.tax)+'</td>';
    function render() {
        filtered=core.filter(rows,filters);root=core.tree(filtered);
        const out=[];
        function visit(parent,ctx) {
            const sorted=Array.from(parent.children.values()).sort((a,b)=>a.kind==='rate'?(a.label===null?-Infinity:Number(a.label))-(b.label===null?-Infinity:Number(b.label)):String(a.label).localeCompare(String(b.label)));
            sorted.forEach(n=>{
                const key=pathId(n),open=expanded.has(key),level=['state','authority','rate','transaction'].indexOf(n.kind);
                const label=n.kind==='rate'&&n.label!==null?Number(n.label).toFixed(2)+'%':display(n.label);
                const toggle='<button type="button" class="toggle" data-path="'+esc(key)+'" aria-expanded="'+open+'" aria-label="'+(open?'Collapse ':'Expand ')+esc(label)+'">'+(open?'−':'+')+'</button>';
                const cells=['','',''];
                if(level<3) {
                    cells[level]='<div class="branch">'+toggle+'<span>'+esc(label)+'</span></div>';
                } else {
                    // Fully drilled-down transaction rows still show the state/authority/rate they belong to.
                    cells[0]='<span class="ancestor">'+esc(ctx.state)+'</span>';
                    cells[1]='<span class="ancestor">'+esc(ctx.authority)+'</span>';
                    cells[2]='<span class="ancestor">'+esc(ctx.rate)+'</span>';
                }
                out.push('<tr class="level-'+level+'">'+cells.map(c=>'<td>'+c+'</td>').join('')+moneyCells(n)+'<td>'+(level===3?(n.transactionUrls.size?Array.from(n.transactionUrls).map(href=>'<a class="document" style="color:#176a62;text-decoration:underline" href="'+esc(href)+'" target="_blank" rel="noopener noreferrer" title="Open transaction in a new tab">'+esc(n.label)+'</a>').join('<br/>'):'<span class="document">'+esc(n.label)+'</span>')+'<small>'+esc(Array.from(n.dates).join(', '))+'</small>':'<span class="count">'+n.seen.size+' Transaction'+(n.seen.size===1?'':'s')+'</span>')+'</td></tr>');
                if(level<3&&open) {
                    const nextCtx=Object.assign({},ctx);
                    if(n.kind==='state')nextCtx.state=label;else if(n.kind==='authority')nextCtx.authority=label;else if(n.kind==='rate')nextCtx.rate=label;
                    visit(n,nextCtx);
                }
            });
        }
        visit(root,{state:'',authority:'',rate:''});
        body.innerHTML=out.join('')||'<tr><td colspan="11" class="empty">No matching results.<small>Clear a column filter or load a different date range.</small></td></tr>';
        document.getElementById('total-row').innerHTML='<td colspan="3">Filtered total</td>'+moneyCells(root)+'<td>'+root.seen.size+' Transaction'+(root.seen.size===1?'':'s')+'</td>';
        document.getElementById('record-count').textContent=filtered.length.toLocaleString()+' of '+rows.length.toLocaleString()+' tax rows · '+root.children.size+' states';
        document.querySelectorAll('[data-filter]').forEach(b=>{
            const f=b.dataset.filter,active=f==='rate'?filters.rateOp!=='all':f==='document'?!!filters.document:filters[f]!==null;
            b.classList.toggle('is-filtered',active);b.setAttribute('aria-label',b.dataset.label+(active?' (filtered)':'')+' filter');
        });
        const chips=[];
        for(const f of ['state','authority','city'])if(filters[f]!==null)chips.push(f+': '+filters[f].size+' selected');
        if(filters.rateOp!=='all')chips.push('rate: '+({eq:'=',gt:'>',gte:'≥',lt:'<',lte:'≤',between:'between'}[filters.rateOp])+' '+filters.rateA+'%'+(filters.rateOp==='between'?' and '+filters.rateB+'%':''));
        if(filters.document)chips.push('document: '+filters.document);
        document.getElementById('active-filters').textContent=chips.join('  ·  ')||'All loaded records';
        document.getElementById('export').disabled=!filtered.length;
        document.getElementById('export-pdf').disabled=!filtered.length;
    }
    function closePopup() {
        popup.hidden=true;if(activeButton){activeButton.setAttribute('aria-expanded','false');activeButton.focus();}activeButton=null;
    }
    function openPopup(button) {
        if(activeButton===button&&!popup.hidden){closePopup();return;}
        if(activeButton)activeButton.setAttribute('aria-expanded','false');
        activeButton=button;button.setAttribute('aria-expanded','true');
        const field=button.dataset.filter;
        popup.innerHTML='<div class="popup-title">'+esc(button.dataset.label)+' filter<button type="button" class="icon-close" aria-label="Close filter">×</button></div>';
        const footer='<div class="popup-footer"><button type="button" class="clear-filter">Clear</button><button type="button" class="apply-filter primary">Apply</button></div>';
        if(optionSets[field]) {
            const options=optionSets[field],draft=new Set(filters[field]===null?options:filters[field]);
            popup.innerHTML+='<input class="option-search" aria-label="Search filter options" placeholder="Search options…"><div class="selection-actions"><button type="button" class="select-all">Select all</button><button type="button" class="select-none">Clear selection</button></div><div class="option-list">'+options.map((v,i)=>'<label data-option="'+i+'"><input type="checkbox" value="'+i+'" '+(draft.has(v)?'checked':'')+'><span>'+esc(display(v))+'</span></label>').join('')+(options.length?'':'<p class="muted">No options in this date range.</p>')+'</div>'+footer;
            popup.querySelector('.option-search').addEventListener('input',e=>{
                const term=e.target.value.toLowerCase();
                popup.querySelectorAll('[data-option]').forEach(label=>{
                    const opt=options[Number(label.dataset.option)],match=display(opt).toLowerCase().includes(term);
                    label.hidden=!match;
                    label.querySelector('input[type=checkbox]').checked=match;
                    match?draft.add(opt):draft.delete(opt);
                });
            });
            popup.querySelector('.option-list').addEventListener('change',e=>{if(e.target.type==='checkbox'){const v=options[Number(e.target.value)];e.target.checked?draft.add(v):draft.delete(v);}});
            popup.querySelector('.select-all').onclick=()=>{options.forEach(v=>draft.add(v));popup.querySelectorAll('input[type=checkbox]').forEach(c=>{c.checked=true;});};
            popup.querySelector('.select-none').onclick=()=>{draft.clear();popup.querySelectorAll('input[type=checkbox]').forEach(c=>{c.checked=false;});};
            popup.querySelector('.apply-filter').onclick=()=>{filters[field]=draft.size===options.length?null:draft;expanded.clear();closePopup();render();};
            popup.querySelector('.clear-filter').onclick=()=>{filters[field]=null;closePopup();render();};
        } else if(field==='rate') {
            popup.innerHTML+='<label class="input-label">Condition<select id="rate-op">'+[['all','All rates'],['eq','Equal to'],['gt','Greater than'],['gte','Greater than or equal to'],['lt','Less than'],['lte','Less than or equal to'],['between','Between (inclusive)']].map(([v,t])=>'<option value="'+v+'" '+(v===filters.rateOp?'selected':'')+'>'+t+'</option>').join('')+'</select></label><label class="input-label">Rate (%)<input id="rate-a" type="number" step="any" value="'+esc(filters.rateA)+'" placeholder="e.g. 6"></label><label class="input-label" id="rate-b-label">To rate (%)<input id="rate-b" type="number" step="any" value="'+esc(filters.rateB)+'"></label><p id="rate-error" class="field-error" role="alert"></p>'+footer;
            const op=popup.querySelector('#rate-op'),a=popup.querySelector('#rate-a'),b=popup.querySelector('#rate-b');
            const sync=()=>{popup.querySelector('#rate-b-label').hidden=op.value!=='between';a.disabled=op.value==='all';};sync();op.onchange=sync;
            popup.querySelector('.apply-filter').onclick=()=>{
                if(op.value!=='all'&&(a.value===''||!Number.isFinite(Number(a.value))||(op.value==='between'&&(b.value===''||!Number.isFinite(Number(b.value))||Number(a.value)>Number(b.value))))){popup.querySelector('#rate-error').textContent='Enter valid rates, with the lower rate first.';return;}
                filters.rateOp=op.value;filters.rateA=a.value;filters.rateB=b.value;closePopup();render();
            };
            popup.querySelector('.clear-filter').onclick=()=>{filters.rateOp='all';closePopup();render();};
        } else {
            popup.innerHTML+='<label class="input-label">Contains<input id="doc-filter" value="'+esc(filters.document)+'" placeholder="Transaction number"></label>'+footer;
            popup.querySelector('.apply-filter').onclick=()=>{filters.document=popup.querySelector('#doc-filter').value.trim();closePopup();render();};
            popup.querySelector('.clear-filter').onclick=()=>{filters.document='';closePopup();render();};
        }
        popup.querySelector('.icon-close').onclick=closePopup;
        popup.hidden=false;
        const rect=button.getBoundingClientRect();
        popup.style.left=Math.max(8,Math.min(rect.left,window.innerWidth-320))+'px';
        popup.style.top=Math.max(8,Math.min(rect.bottom+8,window.innerHeight-popup.offsetHeight-12))+'px';
        const focus=popup.querySelector('input,select');if(focus)focus.focus();
    }
    document.querySelectorAll('[data-filter]').forEach(b=>b.addEventListener('click',()=>openPopup(b)));
    document.addEventListener('click',e=>{if(!popup.hidden&&!popup.contains(e.target)&&!e.target.closest('[data-filter]'))closePopup();});
    document.addEventListener('keydown',e=>{if(e.key==='Escape')closePopup();});
    window.addEventListener('resize',()=>{if(!popup.hidden)closePopup();});
    body.addEventListener('click',e=>{const b=e.target.closest('[data-path]');if(!b)return;const p=b.dataset.path;expanded.has(p)?expanded.delete(p):expanded.add(p);render();const replacement=Array.from(body.querySelectorAll('[data-path]')).find(x=>x.dataset.path===p);if(replacement)replacement.focus();});
    function expandAll(){const walk=n=>n.children.forEach(c=>{if(c.kind!=='transaction'){expanded.add(pathId(c));walk(c);}});walk(root);render();}
    function collapseAll(){expanded.clear();render();}
    document.getElementById('expand-all').onclick=expandAll;
    document.getElementById('collapse-all').onclick=collapseAll;
    document.getElementById('reset').onclick=()=>{Object.assign(filters,{state:null,authority:null,city:null,rateOp:'all',rateA:'',rateB:'',document:''});closePopup();render();};
    document.getElementById('export-pdf').onclick=()=>{
        if(payload.preview){alert('PDF generation is available in the deployed NetSuite Suitelet.');return;}
        const values={custpage_from:payload.from,custpage_to:payload.to,custpage_subsidiary:payload.subsidiary,
            custpage_export_action:'pdf',custpage_export_filters:JSON.stringify({...filters,
                state:filters.state===null?null:Array.from(filters.state),
                authority:filters.authority===null?null:Array.from(filters.authority),
                city:filters.city===null?null:Array.from(filters.city)})};
        const form=document.createElement('form');form.method='POST';form.action=window.location.href;form.target='_blank';
        Object.keys(values).forEach(name=>{const input=document.createElement('input');input.type='hidden';input.name=name;input.value=values[name]||'';form.appendChild(input);});
        document.body.appendChild(form);form.submit();form.remove();
    };
    document.getElementById('export').onclick=()=>{
        const blob=new Blob([core.csv(filtered)],{type:'text/csv;charset=utf-8;'}),url=URL.createObjectURL(blob),a=document.createElement('a');
        a.href=url;a.download='Sales_Tax_Liability_'+payload.from+'_'+payload.to+'.csv';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
    };
    try{core.validate(rows);render();}catch(e){document.getElementById('client-error').hidden=false;document.getElementById('client-error').textContent=e.message;document.getElementById('results').hidden=true;document.getElementById('metrics').hidden=true;document.getElementById('export').disabled=true;document.getElementById('export-pdf').disabled=true;}
}

    return {onRequest};
});