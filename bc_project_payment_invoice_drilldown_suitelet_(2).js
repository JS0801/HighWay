/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 * @NModuleScope SameAccount
 */
define(['N/search', 'N/record', 'N/log'], function (search, record, log) {
  var FIELD_PAYMENT_RECEIVED = 'custcol_bc_payment_received';
  var STANDALONE_GROUP_ID = 'standalone';
  var STANDALONE_GROUP_LABEL = 'Standalone Invoices';
  var TOLERANCE = 0.000001;

  function onRequest(context) {
    try {
      log.error({
        title: 'PDI ENTRY onRequest',
        details: {
          method: context.request.method,
          parameters: context.request.parameters,
          url: context.request.url || ''
        }
      });

      if (context.request.method === 'POST') {
        handlePost(context);
        return;
      }

      var projectId = context.request.parameters.project_id || context.request.parameters.project || '';
      var pageUrl = buildPageUrl(context.request, projectId);
      log.error({
        title: 'PDI GET project parameter',
        details: {
          projectId: projectId,
          hasProjectId: !!projectId
        }
      });

      var data = projectId ? buildDataset(projectId) : emptyDataset('Missing project_id parameter.');
      var html = renderPage({
        projectId: projectId,
        data: data,
        actionUrl: pageUrl,
        refreshUrl: pageUrl
      });

      log.error({
        title: 'PDI GET render ready',
        details: {
          projectId: projectId,
          htmlLength: html.length,
          resultCount: data.resultCount,
          salesOrderCount: data.salesOrderCount,
          invoiceCount: data.invoiceCount,
          paymentCount: data.paymentCount,
          lineCount: data.lineCount,
          groupCount: data.groups ? data.groups.length : 0,
          datasetError: data.error || ''
        }
      });

      context.response.write({
        output: html
      });

      log.error({
        title: 'PDI GET response written',
        details: {
          projectId: projectId
        }
      });
    } catch (error) {
      log.error({ title: 'PDI Suitelet error', details: error });
      context.response.write({
        output: renderError(error)
      });
    }
  }

  function handlePost(context) {
    var payload = {};
    var body = String(context.request.body || '');
    var params = context.request.parameters || {};
    var projectId = params.project_id || params.project || '';
    var result;
    var data;
    var html;

    log.error({
      title: 'PDI POST received',
      details: {
        bodyLength: body.length,
        bodyPreview: body.substring(0, 1000),
        action: params.action || '',
        parameterCount: Object.keys(params).length
      }
    });

    if (body.replace(/\s/g, '').charAt(0) === '{') {
      try {
        payload = JSON.parse(body || '{}');
      } catch (error) {
        log.error({
          title: 'PDI POST invalid JSON',
          details: error
        });
        writeJson(context, {
          success: false,
          errors: ['Invalid JSON body.']
        });
        return;
      }

      if (payload.action !== 'savePaymentReceived') {
        log.error({
          title: 'PDI POST unknown action',
          details: {
            action: payload.action
          }
        });
        writeJson(context, {
          success: false,
          errors: ['Unknown action: ' + payload.action]
        });
        return;
      }

      log.error({
        title: 'PDI POST save requested',
        details: {
          source: 'json',
          editCount: payload.edits ? payload.edits.length : 0
        }
      });

      result = savePaymentReceivedEdits(payload.edits || []);
      log.error({
        title: 'PDI POST save result',
        details: result
      });

      writeJson(context, result);
      return;
    }

    if (params.action !== 'savePaymentReceivedForm') {
      result = {
        success: false,
        savedInvoices: [],
        errors: ['Unknown action: ' + (params.action || '')]
      };
    } else {
      payload.edits = parseFormEdits(params);
      log.error({
        title: 'PDI POST save requested',
        details: {
          source: 'form',
          projectId: projectId,
          editCount: payload.edits.length
        }
      });
      result = payload.edits.length ? savePaymentReceivedEdits(payload.edits) : {
        success: false,
        savedInvoices: [],
        errors: ['No line changes to save.']
      };
    }

    log.error({
      title: 'PDI POST save result',
      details: result
    });

    data = projectId ? buildDataset(projectId) : emptyDataset('Missing project_id parameter.');
    html = renderPage({
      projectId: projectId,
      data: data,
      actionUrl: buildPageUrl(context.request, projectId),
      refreshUrl: buildPageUrl(context.request, projectId),
      notice: {
        type: result.success ? 'success' : 'error',
        text: result.success ? ('Saved ' + result.savedInvoices.length + ' invoice(s).') : result.errors.join(' ')
      }
    });

    context.response.write({
      output: html
    });
  }

  function parseFormEdits(params) {
    var edits = [];

    Object.keys(params || {}).forEach(function (name) {
      var parts;

      if (name.indexOf('payment__') !== 0) return;

      parts = name.split('__');
      if (parts.length < 3) return;

      edits.push({
        invoiceId: parts[1],
        lineUniqueKey: parts.slice(2).join('__'),
        value: params[name]
      });
    });

    return edits;
  }

  function buildPageUrl(request, projectId) {
    var params = request.parameters || {};
    var pairs = [];
    var pageProjectId = projectId || params.project_id || params.project || '';

    ['script', 'deploy', 'compid'].forEach(function (name) {
      if (params[name]) {
        pairs.push(encodeURIComponent(name) + '=' + encodeURIComponent(params[name]));
      }
    });

    if (pageProjectId) {
      pairs.push('project_id=' + encodeURIComponent(pageProjectId));
    }

    return (request.url || '') + (pairs.length ? '?' + pairs.join('&') : '');
  }

  function buildDataset(projectId) {
    log.error({
      title: 'PDI buildDataset start',
      details: {
        projectId: projectId
      }
    });

    var columns = createInvoiceSearchColumns();
    var searchObj = search.create({
      type: 'invoice',
      settings: [{ name: 'consolidationtype', value: 'ACCTTYPE' }],
      filters: [
        ['type', 'anyof', 'CustInvc'],
        'AND',
        ['cseg_bc_project', 'anyof', projectId],
        'AND',
        ['taxline', 'is', 'F'],
        'AND',
        ['shipping', 'is', 'F'],
        'AND',
        ['cogs', 'is', 'F']
      ],
      columns: columns.list
    });

    var grouped = {};
    var invoicesById = {};
    var globalPayments = {};
    var resultCount = 0;
    var paged = searchObj.runPaged({ pageSize: 1000 });
    var debugInfo = {
      projectId: projectId,
      pageCount: paged.pageRanges.length,
      rowsLogged: 0,
      groupsCreated: 0,
      invoicesCreated: 0,
      paymentsFound: 0,
      linesFound: 0,
      skippedNoInvoice: 0,
      skippedNoLine: 0,
      skippedMainline: 0,
      salesOrderFromCustom: 0,
      salesOrderFromCreatedFrom: 0,
      standaloneInvoices: 0
    };

    log.error({
      title: 'PDI invoice search paged',
      details: {
        projectId: projectId,
        pageCount: paged.pageRanges.length,
        resultCount: paged.count
      }
    });

    paged.pageRanges.forEach(function (pageRange) {
      log.error({
        title: 'PDI invoice search fetch page',
        details: {
          projectId: projectId,
          pageIndex: pageRange.index
        }
      });

      var page = paged.fetch({ index: pageRange.index });
      page.data.forEach(function (result) {
        resultCount += 1;
        consumeResult(result, columns, grouped, invoicesById, globalPayments, debugInfo);
      });
    });

    log.error({
      title: 'PDI invoice search consumed',
      details: debugInfo
    });

    var groups = Object.keys(grouped).map(function (groupId) {
      var group = grouped[groupId];
      var invoices = Object.keys(group.invoiceMap).map(function (invoiceId) {
        return finalizeInvoice(group.invoiceMap[invoiceId]);
      });

      invoices.sort(sortByDateThenName);

      group.children = invoices;
      group.invoiceCount = invoices.length;
      group.paymentCount = invoices.reduce(function (total, invoice) {
        return total + invoice.paymentCount;
      }, 0);
      group.lineCount = invoices.reduce(function (total, invoice) {
        return total + invoice.lineCount;
      }, 0);
      group.total = invoices.reduce(function (total, invoice) {
        return total + numberValue(invoice.total);
      }, 0);
      group.amountRemaining = invoices.reduce(function (total, invoice) {
        return total + numberValue(invoice.amountRemaining);
      }, 0);
      group.paymentApplied = invoices.reduce(function (total, invoice) {
        return total + numberValue(invoice.paymentApplied);
      }, 0);

      delete group.invoiceMap;
      return group;
    });

    groups.sort(function (a, b) {
      if (a.id === STANDALONE_GROUP_ID) return 1;
      if (b.id === STANDALONE_GROUP_ID) return -1;
      return String(a.documentNumber).localeCompare(String(b.documentNumber));
    });

    var invoiceCount = Object.keys(invoicesById).length;
    var lineCount = groups.reduce(function (total, group) {
      return total + group.lineCount;
    }, 0);
    var paymentCount = Object.keys(globalPayments).length;
    var dataset = {
      error: '',
      projectId: projectId,
      resultCount: resultCount,
      salesOrderCount: groups.filter(function (group) { return group.id !== STANDALONE_GROUP_ID; }).length,
      invoiceCount: invoiceCount,
      paymentCount: paymentCount,
      lineCount: lineCount,
      groups: groups,
      totals: {
        total: groups.reduce(function (total, group) { return total + numberValue(group.total); }, 0),
        amountRemaining: groups.reduce(function (total, group) { return total + numberValue(group.amountRemaining); }, 0),
        paymentApplied: groups.reduce(function (total, group) { return total + numberValue(group.paymentApplied); }, 0)
      }
    };

    log.error({
      title: 'PDI buildDataset complete',
      details: {
        projectId: projectId,
        resultCount: dataset.resultCount,
        salesOrderCount: dataset.salesOrderCount,
        invoiceCount: dataset.invoiceCount,
        paymentCount: dataset.paymentCount,
        lineCount: dataset.lineCount,
        groupCount: dataset.groups.length,
        total: dataset.totals.total,
        amountRemaining: dataset.totals.amountRemaining,
        paymentApplied: dataset.totals.paymentApplied
      }
    });

    return dataset;
  }

  function createInvoiceSearchColumns() {
    var cols = {
      invoiceId: search.createColumn({ name: 'internalid', summary: 'GROUP', label: 'Internal ID' }),
      tranId: search.createColumn({ name: 'tranid', summary: 'GROUP', label: 'Document Number' }),
      tranDate: search.createColumn({ name: 'trandate', summary: 'MAX', label: 'Date' }),
      amountRemaining: search.createColumn({ name: 'amountremaining', summary: 'MAX', label: 'Amount Remaining' }),
      total: search.createColumn({ name: 'total', summary: 'MAX', label: 'Amount (Transaction Total)' }),
      item: search.createColumn({ name: 'item', summary: 'GROUP', label: 'Item' }),
      memo: search.createColumn({ name: 'memo', summary: 'GROUP', label: 'Memo' }),
      quantity: search.createColumn({ name: 'quantity', summary: 'GROUP', label: 'Quantity' }),
      rate: search.createColumn({ name: 'rate', summary: 'MAX', label: 'Item Rate' }),
      amount: search.createColumn({ name: 'amount', summary: 'MAX', label: 'Amount' }),
      mainline: search.createColumn({ name: 'mainline', summary: 'GROUP', label: 'Main Line' }),
      retentionPercent: search.createColumn({ name: 'custcol_bc_retentions_percentage', summary: 'MAX', label: 'Retention %' }),
      unbilledRetentions: search.createColumn({ name: 'custcol_bc_sov_unbilled_retention', summary: 'MAX', label: 'Unbilled Retentions' }),
      paymentReceived: search.createColumn({ name: FIELD_PAYMENT_RECEIVED, summary: 'MAX', label: 'Payment Applied' }),
      paymentAppliedToInvoice: search.createColumn({ name: 'applyinglinkamount', summary: 'MAX', label: 'Payment Amount Applied To Invoice' }),
      salesOrder: search.createColumn({ name: 'custbody_bc_contract_created_from', summary: 'MAX', label: 'BC Contract Created From' }),
      createdFrom: search.createColumn({ name: 'createdfrom', summary: 'MAX', label: 'Created From' }),
      appliedTo: search.createColumn({ name: 'appliedtotransaction', summary: 'MAX', label: 'Applied To Transaction' }),
      paymentFormula: search.createColumn({
        name: 'formulatext',
        summary: 'GROUP',
        formula: "CASE WHEN {applyingtransaction} LIKE 'Payment #%' THEN {applyingtransaction} || ' ' || {applyingtransaction.internalid} ELSE NULL END",
        label: 'Payment Formula'
      }),
      lineUniqueKey: search.createColumn({ name: 'lineuniquekey', summary: 'GROUP', label: 'Line Unique Key' })
    };

    cols.list = [
      cols.invoiceId,
      cols.tranId,
      cols.tranDate,
      cols.amountRemaining,
      cols.total,
      cols.item,
      cols.memo,
      cols.quantity,
      cols.rate,
      cols.amount,
      cols.mainline,
      cols.retentionPercent,
      cols.unbilledRetentions,
      cols.paymentReceived,
      cols.paymentAppliedToInvoice,
      cols.salesOrder,
      cols.createdFrom,
      cols.appliedTo,
      cols.paymentFormula,
      cols.lineUniqueKey
    ];

    return cols;
  }

  function consumeResult(result, columns, grouped, invoicesById, globalPayments, debugInfo) {
    var invoiceId = text(result.getValue(columns.invoiceId));
    if (!invoiceId) {
      if (debugInfo) debugInfo.skippedNoInvoice += 1;
      return;
    }

    if (debugInfo && debugInfo.rowsLogged < 5) {
      log.error({
        title: 'PDI sample search row',
        details: {
          rowNumber: debugInfo.rowsLogged + 1,
          invoiceId: invoiceId,
          tranId: text(result.getValue(columns.tranId)),
          salesOrderId: text(result.getValue(columns.salesOrder)),
          salesOrderText: text(result.getText(columns.salesOrder)),
          itemId: text(result.getValue(columns.item)),
          itemText: text(result.getText(columns.item)),
          mainline: text(result.getValue(columns.mainline)),
          lineUniqueKey: text(result.getValue(columns.lineUniqueKey)),
          paymentFormula: text(result.getValue(columns.paymentFormula)),
          createdFromId: text(result.getValue(columns.createdFrom)),
          createdFromText: text(result.getText(columns.createdFrom)),
          paymentReceived: result.getValue(columns.paymentReceived),
          paymentAppliedToInvoice: result.getValue(columns.paymentAppliedToInvoice),
          amount: result.getValue(columns.amount)
        }
      });
      debugInfo.rowsLogged += 1;
    }

    var customSalesOrderId = text(result.getValue(columns.salesOrder));
    var createdFromId = text(result.getValue(columns.createdFrom));
    var salesOrderId = customSalesOrderId || createdFromId;
    var salesOrderText = text(result.getText(columns.salesOrder)) ||
      text(result.getText(columns.createdFrom)) ||
      (salesOrderId ? 'Sales Order #' + salesOrderId : STANDALONE_GROUP_LABEL);
    var groupId = salesOrderId ? 'so-' + salesOrderId : STANDALONE_GROUP_ID;

    var group = grouped[groupId];
    if (!group) {
      group = {
        id: groupId,
        rowType: salesOrderId ? 'salesorder' : 'standalone',
        documentNumber: salesOrderText,
        recordId: salesOrderId,
        recordUrl: salesOrderId ? transactionUrl('salesord', salesOrderId) : '',
        type: salesOrderId ? 'Sales Order' : 'Group',
        date: '',
        total: 0,
        amountRemaining: 0,
        paymentApplied: 0,
        paymentCount: 0,
        invoiceCount: 0,
        lineCount: 0,
        memo: '',
        invoiceMap: {}
      };
      grouped[groupId] = group;
      if (debugInfo) debugInfo.groupsCreated += 1;
    }

    var invoice = group.invoiceMap[invoiceId];
    if (!invoice) {
      invoice = {
        id: 'invoice-' + invoiceId,
        rowType: 'invoice',
        invoiceId: invoiceId,
        recordId: invoiceId,
        recordUrl: transactionUrl('custinvc', invoiceId),
        documentNumber: text(result.getValue(columns.tranId)) || 'Invoice #' + invoiceId,
        type: 'Invoice',
        date: text(result.getValue(columns.tranDate)),
        total: toNumber(result.getValue(columns.total)),
        amountRemaining: toNumber(result.getValue(columns.amountRemaining)),
        paymentApplied: 0,
        paymentCount: 0,
        paymentLabel: 'No Payment',
        memo: '',
        children: [],
        paymentMap: {},
        lineMap: {}
      };
      group.invoiceMap[invoiceId] = invoice;
      invoicesById[invoiceId] = true;
      if (debugInfo) {
        debugInfo.invoicesCreated += 1;
        if (customSalesOrderId) {
          debugInfo.salesOrderFromCustom += 1;
        } else if (createdFromId) {
          debugInfo.salesOrderFromCreatedFrom += 1;
        } else {
          debugInfo.standaloneInvoices += 1;
        }
      }
    }

    var payment = parsePayment(text(result.getValue(columns.paymentFormula)));
    var isMainline = text(result.getValue(columns.mainline)) === 'T' || result.getValue(columns.mainline) === true;
    var line = buildLineRow(result, columns, invoiceId);
    var paymentAmountForInvoice = Math.abs(toNumber(result.getValue(columns.paymentAppliedToInvoice)));

    if (payment) {
      globalPayments[payment.id || payment.name] = true;
      if (!invoice.paymentMap[payment.id || payment.name]) {
        invoice.paymentMap[payment.id || payment.name] = {
          id: 'payment-' + invoiceId + '-' + safeId(payment.id || payment.name),
          rowType: 'payment',
          recordId: payment.id,
          recordUrl: payment.id ? transactionUrl('custpymt', payment.id) : '',
          documentNumber: payment.name,
          type: 'Payment',
          date: '',
          total: paymentAmountForInvoice,
          amountRemaining: null,
          paymentApplied: paymentAmountForInvoice,
          paymentCount: null,
          memo: 'Payment applied to invoice',
          children: []
        };
        if (debugInfo) debugInfo.paymentsFound += 1;
      }

      if (paymentAmountForInvoice > numberValue(invoice.paymentMap[payment.id || payment.name].paymentApplied)) {
        invoice.paymentMap[payment.id || payment.name].paymentApplied = paymentAmountForInvoice;
        invoice.paymentMap[payment.id || payment.name].total = paymentAmountForInvoice;
      }
    }

    if (line && !invoice.lineMap[line.lineUniqueKey]) {
      invoice.lineMap[line.lineUniqueKey] = line;
      if (debugInfo) debugInfo.linesFound += 1;
    } else if (!line && debugInfo && isMainline) {
      debugInfo.skippedMainline += 1;
    } else if (!line && debugInfo) {
      debugInfo.skippedNoLine += 1;
    }
  }

  function buildLineRow(result, columns, invoiceId) {
    var itemId = text(result.getValue(columns.item));
    var itemText = text(result.getText(columns.item)) || itemId;
    var memo = text(result.getValue(columns.memo));
    var lineUniqueKey = text(result.getValue(columns.lineUniqueKey));
    var isMainline = text(result.getValue(columns.mainline)) === 'T' || result.getValue(columns.mainline) === true;

    if (isMainline) {
      return null;
    }

    if (itemText === '- None -') itemText = '';
    if (memo === '- None -') memo = '';

    if (!lineUniqueKey || (!itemId && !itemText)) {
      return null;
    }

    var amount = toNumber(result.getValue(columns.amount));
    var paymentReceived = toNumber(result.getValue(columns.paymentReceived));

    return {
      id: 'line-' + safeId(lineUniqueKey),
      rowType: 'line',
      invoiceId: invoiceId,
      lineUniqueKey: lineUniqueKey,
      recordId: itemId,
      recordUrl: itemId ? itemUrl(itemId) : '',
      documentNumber: itemText || ('Line ' + lineUniqueKey),
      type: 'Invoice Line',
      date: '',
      total: null,
      amountRemaining: null,
      paymentApplied: paymentReceived,
      paymentCount: null,
      retentionPercent: toNumber(result.getValue(columns.retentionPercent)),
      unbilledRetentions: toNumber(result.getValue(columns.unbilledRetentions)),
      quantity: toNumber(result.getValue(columns.quantity)),
      rate: toNumber(result.getValue(columns.rate)),
      amount: amount,
      memo: memo,
      children: []
    };
  }

  function finalizeInvoice(invoice) {
    var paymentRows = Object.keys(invoice.paymentMap).map(function (paymentKey) {
      return invoice.paymentMap[paymentKey];
    });
    var lineRows = Object.keys(invoice.lineMap).map(function (lineKey) {
      return invoice.lineMap[lineKey];
    });

    paymentRows.sort(function (a, b) {
      return String(a.documentNumber).localeCompare(String(b.documentNumber));
    });
    lineRows.sort(function (a, b) {
      return String(a.documentNumber).localeCompare(String(b.documentNumber));
    });

    invoice.paymentCount = paymentRows.length;
    invoice.paymentLabel = invoice.paymentCount ? invoice.paymentCount + ' payment' + (invoice.paymentCount === 1 ? '' : 's') : 'No Payment';
    invoice.lineCount = lineRows.length;
    invoice.paymentAvailable = paymentRows.reduce(function (total, payment) {
      return total + numberValue(payment.paymentApplied);
    }, 0);
    invoice.paymentApplied = lineRows.reduce(function (total, line) {
      return total + numberValue(line.paymentApplied);
    }, 0);
    lineRows.forEach(function (line) {
      line.invoicePaymentLimit = invoice.paymentAvailable;
    });
    invoice.children = paymentRows.concat(lineRows);

    delete invoice.paymentMap;
    delete invoice.lineMap;

    return invoice;
  }

  function savePaymentReceivedEdits(edits) {
    var errors = [];
    var savedInvoices = {};
    var editsByInvoice = {};

    edits.forEach(function (edit) {
      var invoiceId = text(edit.invoiceId);
      var lineUniqueKey = text(edit.lineUniqueKey);
      var value = toNumber(edit.value);
      var hasMaxAmount = edit.amount !== null && edit.amount !== undefined && edit.amount !== '';
      var maxAmount = hasMaxAmount ? Math.abs(toNumber(edit.amount)) : 0;

      if (!invoiceId || !lineUniqueKey) {
        errors.push('Missing invoice or line id for an edited row.');
        return;
      }

      if (value < 0) {
        errors.push('Payment received cannot be negative for line ' + lineUniqueKey + '.');
        return;
      }

      if (hasMaxAmount && value > maxAmount + TOLERANCE) {
        errors.push('Payment received for line ' + lineUniqueKey + ' cannot be greater than the line amount.');
        return;
      }

      if (!editsByInvoice[invoiceId]) editsByInvoice[invoiceId] = [];
      editsByInvoice[invoiceId].push({
        lineUniqueKey: lineUniqueKey,
        value: value
      });
    });

    if (errors.length) {
      return { success: false, savedInvoices: [], errors: errors };
    }

    Object.keys(editsByInvoice).forEach(function (invoiceId) {
      var invoiceRec;
      try {
        log.error({
          title: 'PDI save load invoice',
          details: {
            invoiceId: invoiceId,
            editCount: editsByInvoice[invoiceId].length
          }
        });

        invoiceRec = record.load({
          type: record.Type.INVOICE,
          id: invoiceId,
          isDynamic: false
        });

        editsByInvoice[invoiceId].forEach(function (edit) {
          var lineIndex = findLineByUniqueKey(invoiceRec, edit.lineUniqueKey);
          var actualLineAmount;

          if (lineIndex === -1) {
            throw new Error('Could not find invoice ' + invoiceId + ' line unique key ' + edit.lineUniqueKey + '.');
          }

          actualLineAmount = Math.abs(toNumber(invoiceRec.getSublistValue({
            sublistId: 'item',
            fieldId: 'amount',
            line: lineIndex
          })));

          if (edit.value > actualLineAmount + TOLERANCE) {
            throw new Error('Payment received for invoice ' + invoiceId + ' line ' + edit.lineUniqueKey + ' cannot be greater than the line amount.');
          }

          log.error({
            title: 'PDI save set line value',
            details: {
              invoiceId: invoiceId,
              lineUniqueKey: edit.lineUniqueKey,
              lineIndex: lineIndex,
              value: edit.value,
              lineAmount: actualLineAmount
            }
          });

          invoiceRec.setSublistValue({
            sublistId: 'item',
            fieldId: FIELD_PAYMENT_RECEIVED,
            line: lineIndex,
            value: edit.value
          });
        });

        var invoiceLinePaymentTotal = 0;
        var invoiceLineCount = invoiceRec.getLineCount({ sublistId: 'item' }) || 0;
        var invoicePaymentLimit = getInvoicePaymentLimit(invoiceId);

        for (var line = 0; line < invoiceLineCount; line += 1) {
          invoiceLinePaymentTotal += toNumber(invoiceRec.getSublistValue({
            sublistId: 'item',
            fieldId: FIELD_PAYMENT_RECEIVED,
            line: line
          }));
        }

        log.error({
          title: 'PDI save invoice total validation',
          details: {
            invoiceId: invoiceId,
            invoiceLinePaymentTotal: invoiceLinePaymentTotal,
            invoicePaymentLimit: invoicePaymentLimit
          }
        });

        if (invoiceLinePaymentTotal > invoicePaymentLimit + TOLERANCE) {
          throw new Error('Total payment received on invoice ' + invoiceId + ' lines cannot be greater than the payment amount applied to the invoice.');
        }

        invoiceRec.save({
          enableSourcing: false,
          ignoreMandatoryFields: true
        });
        savedInvoices[invoiceId] = true;
        log.error({
          title: 'PDI save invoice complete',
          details: {
            invoiceId: invoiceId
          }
        });
      } catch (error) {
        log.error({
          title: 'PDI save invoice failed',
          details: {
            invoiceId: invoiceId,
            error: error
          }
        });
        errors.push(error.message || String(error));
      }
    });

    return {
      success: errors.length === 0,
      savedInvoices: Object.keys(savedInvoices),
      errors: errors
    };
  }

  function findLineByUniqueKey(invoiceRec, lineUniqueKey) {
    var lineCount = invoiceRec.getLineCount({ sublistId: 'item' });

    for (var i = 0; i < lineCount; i += 1) {
      var currentKey = text(invoiceRec.getSublistValue({
        sublistId: 'item',
        fieldId: 'lineuniquekey',
        line: i
      }));

      if (currentKey === lineUniqueKey) {
        return i;
      }
    }

    return -1;
  }

  function getInvoicePaymentLimit(invoiceId) {
    var total = 0;
    var paymentColumn = search.createColumn({
      name: 'formulatext',
      summary: 'GROUP',
      formula: "CASE WHEN {applyingtransaction} LIKE 'Payment #%' THEN {applyingtransaction} || ' ' || {applyingtransaction.internalid} ELSE NULL END"
    });
    var amountColumn = search.createColumn({
      name: 'applyinglinkamount',
      summary: 'MAX'
    });

    search.create({
      type: 'invoice',
      settings: [{ name: 'consolidationtype', value: 'ACCTTYPE' }],
      filters: [
        ['type', 'anyof', 'CustInvc'],
        'AND',
        ['internalid', 'anyof', invoiceId],
        'AND',
        ['applyingtransaction', 'noneof', '@NONE@']
      ],
      columns: [paymentColumn, amountColumn]
    }).run().each(function (result) {
      var payment = parsePayment(text(result.getValue(paymentColumn)));

      if (payment) {
        total += Math.abs(toNumber(result.getValue(amountColumn)));
      }

      return true;
    });

    return total;
  }

  function renderPage(options) {
    var data = options.data || emptyDataset('');
    var serverRows = renderServerRows(data);
    var projectId = options.projectId || '';
    var actionUrl = options.actionUrl || '';
    var refreshUrl = options.refreshUrl || actionUrl || '';
    var notice = options.notice || {};
    var noticeText = notice.text || '';
    var noticeClass = noticeText ? (notice.type === 'error' ? ' error' : ' success') : '';
    var noticeHidden = noticeText ? '' : ' hidden';
    var invoiceLabel = (data.invoiceCount || 0) + ' invoice' + ((data.invoiceCount || 0) === 1 ? '' : 's');
    var paymentLabel = (data.paymentCount || 0) + ' payment' + ((data.paymentCount || 0) === 1 ? '' : 's');
    var totals = data.totals || {};

    return '<!doctype html>' +
      '<html lang="en">' +
      '<head>' +
      '<meta charset="utf-8">' +
      '<meta name="viewport" content="width=device-width, initial-scale=1">' +
      '<title>Project Payments</title>' +
      '<style>' + getCss() + '</style>' +
      '</head>' +
      '<body>' +
      '<div id="app">' +
      '<form class="app-shell" id="paymentForm" method="POST" action="' + escapeHtml(actionUrl) + '">' +
      '<input type="hidden" name="action" value="savePaymentReceivedForm">' +
      (projectId ? '<input type="hidden" name="project_id" value="' + escapeHtml(projectId) + '">' : '') +
      '<header class="topbar">' +
      '<div class="header-left">' +
      '<div class="title-row">' +
      '<h1>Payments</h1>' +
      '<span class="badge" id="invoiceCountBadge">' + escapeHtml(invoiceLabel) + '</span>' +
      '<span class="badge" id="paymentCountBadge">' + escapeHtml(paymentLabel) + '</span>' +
      '</div>' +
      '</div>' +
      '<div class="header-right">' +
      '<a class="icon-button" id="refreshBtn" title="Refresh" href="' + escapeHtml(refreshUrl) + '">&#8635;</a>' +
      '<button class="primary-button" id="saveBtn" type="submit">Save Changes</button>' +
      '</div>' +
      '</header>' +
      '<div class="divider"></div>' +
      '<main class="grid-area">' +
      '<div class="message' + noticeClass + '" id="message"' + noticeHidden + '>' + escapeHtml(noticeText) + '</div>' +
      '<div class="table-frame">' +
      '<table class="tree-table" id="treeTable">' +
      '<thead>' +
      '<tr>' +
      '<th class="sticky-col doc-col">Document / Item</th>' +
      '<th>Type</th>' +
      '<th>Date</th>' +
      '<th class="num">Payment Count</th>' +
      '<th class="num">Total</th>' +
      '<th class="num">Amount Remaining</th>' +
      '<th class="num">Payment Applied</th>' +
      '<th class="num">Retention %</th>' +
      '<th class="num">Unbilled Retentions</th>' +
      '<th class="num">Quantity</th>' +
      '<th class="num">Rate</th>' +
      '<th class="num">Amount</th>' +
      '<th>Memo</th>' +
      '</tr>' +
      '</thead>' +
      '<tbody id="gridBody">' +
      serverRows +
      '</tbody>' +
      '<tfoot>' +
      '<tr>' +
      '<td class="sticky-col doc-col">Grand Total</td>' +
      '<td></td><td></td><td></td>' +
      '<td class="num" id="grandTotal">' + serverFormatMoney(totals.total) + '</td>' +
      '<td class="num" id="grandRemaining">' + serverFormatMoney(totals.amountRemaining) + '</td>' +
      '<td class="num" id="grandApplied">' + serverFormatMoney(totals.paymentApplied) + '</td>' +
      '<td></td><td></td><td></td><td></td><td></td><td></td>' +
      '</tr>' +
      '</tfoot>' +
      '</table>' +
      '</div>' +
      '</main>' +
      '</form>' +
      '</div>' +
      '<script>' + getClientScript() + '</script>' +
      '</body>' +
      '</html>';
  }

  function renderServerRows(data) {
    var html = [];
    var groups = data.groups || [];

    if (data.error) {
      return '<tr><td class="sticky-col doc-col" colspan="13">' + escapeHtml(data.error) + '</td></tr>';
    }

    if (!groups.length) {
      return '<tr><td class="sticky-col doc-col" colspan="13">No rows found for this project.</td></tr>';
    }

    groups.forEach(function (group) {
      var invoices = group.children || [];

      html.push(renderServerRow(group, 0, '', invoices.length > 0));

      invoices.forEach(function (invoice) {
        var invoiceChildren = invoice.children || [];

        html.push(renderServerRow(invoice, 1, group.id, invoiceChildren.length > 0));

        invoiceChildren.forEach(function (child) {
          html.push(renderServerRow(child, 2, invoice.id, false));
        });
      });
    });

    return html.join('');
  }

  function renderServerRow(row, level, parentId, hasChildren) {
    var paymentCell = row.rowType === 'line' ? renderServerPaymentInput(row) : serverFormatMoney(row.paymentApplied);
    var toggle = hasChildren ? '<button type="button" class="toggle" data-toggle="' + escapeHtml(row.id || '') + '" aria-expanded="true">&#9662;</button>' : '<span class="toggle-spacer"></span>';

    return '<tr class="row-' + escapeHtml(row.rowType || '') + '" data-row-id="' + escapeHtml(row.id || '') + '" data-level="' + level + '" data-parent-id="' + escapeHtml(parentId || '') + '" data-expanded="T">' +
      '<td class="sticky-col doc-col"><div class="cell-doc indent-' + level + '">' +
      toggle +
      renderServerDoc(row) +
      '</div></td>' +
      '<td>' + renderServerType(row) + '</td>' +
      '<td>' + escapeHtml(row.date || '') + '</td>' +
      '<td class="num">' + renderServerPaymentCount(row) + '</td>' +
      '<td class="num">' + serverFormatMoney(row.total) + '</td>' +
      '<td class="num">' + serverFormatMoney(row.amountRemaining) + '</td>' +
      '<td class="num ' + (row.rowType === 'line' ? 'editable-cell' : '') + '">' + paymentCell + '</td>' +
      '<td class="num">' + serverFormatPercent(row.retentionPercent) + '</td>' +
      '<td class="num">' + serverFormatMoney(row.unbilledRetentions) + '</td>' +
      '<td class="num">' + serverFormatNumber(row.quantity) + '</td>' +
      '<td class="num">' + serverFormatMoney(row.rate) + '</td>' +
      '<td class="num">' + serverFormatMoney(row.amount) + '</td>' +
      '<td class="memo-cell" title="' + escapeHtml(row.memo || '') + '">' + escapeHtml(row.memo || '') + '</td>' +
      '</tr>';
  }

  function renderServerDoc(row) {
    var label = escapeHtml(row.documentNumber || '');

    if (row.recordUrl) {
      return '<a class="record-link" href="' + escapeHtml(row.recordUrl) + '" target="_blank">' + label + '</a>';
    }

    return '<span class="plain-label">' + label + '</span>';
  }

  function renderServerType(row) {
    var cls = row.rowType === 'invoice' ? ' invoice' : row.rowType === 'payment' ? ' payment' : '';

    return '<span class="type-chip' + cls + '">' + escapeHtml(row.type || '') + '</span>';
  }

  function renderServerPaymentCount(row) {
    if (row.rowType === 'invoice') return escapeHtml(row.paymentLabel || 'No Payment');
    if (row.rowType === 'salesorder' || row.rowType === 'standalone') return escapeHtml(row.paymentCount || '');
    return '';
  }

  function renderServerPaymentInput(row) {
    var key = (row.invoiceId || '') + '::' + (row.lineUniqueKey || '');
    var name = 'payment__' + (row.invoiceId || '') + '__' + (row.lineUniqueKey || '');
    var max = Math.abs(numberValue(row.amount));
    var value = numberValue(row.paymentApplied);
    var invoiceLimit = numberValue(row.invoicePaymentLimit);

    return '<input class="payment-input" type="number" min="0" step="0.01"' +
      ' data-form-name="' + escapeHtml(name) + '"' +
      ' data-edit-key="' + escapeHtml(key) + '"' +
      ' data-invoice-id="' + escapeHtml(row.invoiceId || '') + '"' +
      ' data-line-key="' + escapeHtml(row.lineUniqueKey || '') + '"' +
      ' data-amount="' + escapeHtml(row.amount || 0) + '"' +
      ' data-invoice-limit="' + escapeHtml(invoiceLimit) + '"' +
      ' data-original-value="' + escapeHtml(value) + '"' +
      ' value="' + escapeHtml(value) + '"' +
      ' title="Line max ' + escapeHtml(serverFormatMoney(max)) + ', invoice payment max ' + escapeHtml(serverFormatMoney(invoiceLimit)) + '">';
  }

  function serverFormatMoney(value) {
    var amount = numberValue(value);

    if (value === null || value === undefined || value === '' || Math.abs(amount) < 0.000001) {
      return '-';
    }

    return amount.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  function serverFormatNumber(value) {
    var amount = numberValue(value);

    if (value === null || value === undefined || value === '' || Math.abs(amount) < 0.000001) {
      return '-';
    }

    return String(amount).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  function serverFormatPercent(value) {
    var amount = numberValue(value);

    if (value === null || value === undefined || value === '' || Math.abs(amount) < 0.000001) {
      return '-';
    }

    return serverFormatNumber(amount) + '%';
  }

  function getCss() {
    return [
      ':root{--Base-White:#fff;--Primary-50:#e8ebed;--Primary-200:#6396c1;--Primary-600:#0c3557;--Primary-700:#0b2e4c;--Blue-50:#f0f9ff;--Blue-500:#2e90fa;--Gray-50:#f9fafb;--Gray-100:#f2f4f7;--Gray-200:#eaecf0;--Gray-300:#d0d5dd;--Gray-500:#667085;--Gray-700:#344054;--Gray-900:#101828;--Success-600:#039855;--Error-500:#f04438;--Warning-100:#fef0c7;--Warning-600:#dc6803;--font:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;}',
      'html,body{margin:0;height:100vh;font-family:var(--font);font-size:13px;color:var(--Gray-900);background:#fff;}',
      '#app{height:100vh;min-height:720px;display:flex;flex-direction:column;}',
      '.app-shell{display:flex;flex:1 1 auto;min-height:0;flex-direction:column;margin:0;}',
      '.topbar{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:24px 24px 4px;}',
      '.title-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap;}',
      'h1{margin:0;font-size:18px;line-height:28px;font-weight:500;}',
      '.badge{display:inline-flex;align-items:center;justify-content:center;border-radius:16px;background:var(--Primary-50);color:var(--Primary-700);font-size:12px;line-height:18px;font-weight:500;padding:2px 8px;}',
      '.header-right{display:flex;align-items:center;justify-content:flex-end;gap:8px;flex-wrap:wrap;}',
      '.divider{height:1px;background:var(--Gray-200);align-self:stretch;margin-top:8px;}',
      '.grid-area{display:flex;flex-direction:column;flex:1 1 auto;min-height:0;padding:4px 16px 24px;}',
      'button{font-family:var(--font);}',
      '.primary-button,.icon-button{display:inline-flex;align-items:center;justify-content:center;gap:8px;height:34px;border-radius:4px;font-size:14px;font-weight:400;cursor:pointer;white-space:nowrap;text-decoration:none;}',
      '.primary-button{border:1px solid var(--Primary-600);background:var(--Primary-600);color:#fff;padding:0 12px;}',
      '.primary-button:hover:not(:disabled){background:var(--Primary-700);border-color:var(--Primary-700);}',
      '.primary-button:disabled{cursor:not-allowed;opacity:.5;background:var(--Primary-200);border-color:var(--Primary-200);}',
      '.icon-button{border:1px solid rgba(22,21,19,.5);background:transparent;color:#161513;padding:0 10px;}',
      '.icon-button:hover{background:rgba(22,21,19,.08);}',
      '.icon-button{width:34px;padding:0;font-weight:700;}',
      '.message{margin:8px 0;padding:10px 12px;border-radius:6px;border:1px solid var(--Gray-200);background:var(--Gray-50);color:var(--Gray-700);}',
      '.message.error{border-color:#fecaca;background:#fef2f2;color:var(--Error-500);}',
      '.message.success{border-color:#bbf7d0;background:#f0fdf4;color:var(--Success-600);}',
      '.table-frame{position:relative;flex:1 1 auto;min-height:0;overflow:auto;border-top:1px solid var(--Gray-200);}',
      '.tree-table{width:100%;min-width:1420px;border-collapse:separate;border-spacing:0;}',
      'th,td{border-right:1px solid var(--Gray-200);border-bottom:1px solid var(--Gray-200);padding:4px 8px;height:28px;box-sizing:border-box;vertical-align:middle;background:#fff;}',
      'th{position:sticky;top:0;z-index:5;background:#fff;font-size:13px;font-weight:600;color:var(--Gray-900);text-align:left;white-space:normal;}',
      'td{font-size:13px;color:var(--Gray-900);}',
      '.sticky-col{position:sticky;left:0;z-index:4;box-shadow:2px 0 4px rgba(0,0,0,.06);}',
      'th.sticky-col{z-index:7;}',
      '.doc-col{min-width:330px;width:330px;}',
      '.num{text-align:right;}',
      'tfoot td{position:sticky;bottom:0;z-index:4;background:#fff;font-weight:700;box-shadow:0 -1px 2px rgba(0,0,0,.04);}',
      'tfoot .sticky-col{z-index:6;}',
      '.row-salesorder td,.row-standalone td{background:#e0f5eb;font-weight:600;}',
      '.row-invoice td{background:#fff;}',
      '.row-payment td{background:#f9fafb;color:var(--Gray-700);}',
      '.row-line td{background:#fff;}',
      '.row-line td.editable-cell{background:var(--Blue-50)!important;}',
      '.row-line:hover td,.row-invoice:hover td,.row-payment:hover td{background:var(--Gray-100)!important;}',
      '.row-salesorder:hover td,.row-standalone:hover td{background:#c8eddb!important;}',
      '.cell-doc{display:flex;align-items:center;gap:6px;min-width:0;}',
      '.indent-0{padding-left:0}.indent-1{padding-left:18px}.indent-2{padding-left:38px}',
      '.toggle,.toggle-spacer{width:18px;height:18px;line-height:18px;flex:0 0 auto;}',
      '.toggle{border:0;background:transparent;color:var(--Gray-700);cursor:pointer;font-size:12px;padding:0;text-align:center;}',
      '.toggle:hover{color:var(--Primary-700);}',
      '.record-link{color:var(--Blue-500);text-decoration:none;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
      '.record-link:hover{text-decoration:underline;}',
      '.plain-label{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
      '.type-chip{display:inline-flex;border-radius:14px;background:var(--Gray-100);color:var(--Gray-700);padding:1px 7px;font-size:12px;}',
      '.type-chip.invoice{background:var(--Primary-50);color:var(--Primary-700);}',
      '.type-chip.payment{background:var(--Warning-100);color:var(--Warning-600);}',
      '.payment-input{width:104px;height:26px;border:1px solid var(--Gray-300);border-radius:4px;text-align:right;padding:0 6px;font-family:var(--font);font-size:13px;}',
      '.payment-input:focus{outline:2px solid #36677d;outline-offset:-1px;}',
      '.payment-input.invalid{border-color:var(--Error-500);background:#fef2f2;}',
      '.payment-input.dirty{border-color:var(--Primary-600);background:#f0f9ff;}',
      '.memo-cell{max-width:260px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--Gray-500);}',
      '@media(max-width:900px){.topbar{align-items:flex-start;flex-direction:column}}'
    ].join('');
  }

  function getClientScript() {
    return [
      '(function(){',
      'var form=document.getElementById("paymentForm");',
      'var message=document.getElementById("message");',
      'var saveBtn=document.getElementById("saveBtn");',
      'try{if(window.frameElement){window.frameElement.style.display="block";window.frameElement.style.width="100%";window.frameElement.style.minHeight="900px";window.frameElement.style.height="900px";}}catch(frameError){if(window.console&&console.warn){console.warn("[PDI client] frame resize skipped",frameError);}}',
      'function init(){',
      '  if(!form||!message||!saveBtn){throw new Error("Required UI elements are missing.");}',
      '  Array.prototype.forEach.call(document.querySelectorAll(".payment-input"),function(input){input.removeAttribute("name");input.addEventListener("input",function(){markInput(input);validateInputs(false);});input.addEventListener("change",function(){markInput(input);validateInputs(false);});});',
      '  Array.prototype.forEach.call(document.querySelectorAll("[data-toggle]"),function(button){button.addEventListener("click",function(event){event.preventDefault();toggleRow(button);});});',
      '  form.addEventListener("submit",function(event){markAllInputs();if(!hasChangedInputs()){event.preventDefault();showMessage("No line changes to save.",true);return;}if(!validateInputs(false)){event.preventDefault();showMessage("Fix invalid payment values before saving.",true);return;}saveBtn.disabled=true;saveBtn.textContent="Saving...";});',
      '  updateSaveState();',
      '  validateInputs(true);',
      '}',
      'function markAllInputs(){Array.prototype.forEach.call(document.querySelectorAll(".payment-input"),markInput);}',
      'function markInput(input){',
      '  var original=normalizeAmount(input.getAttribute("data-original-value"));',
      '  var current=normalizeAmount(input.value);',
      '  var isDirty=original!==current;',
      '  if(isDirty){input.setAttribute("name",input.getAttribute("data-form-name")||"");input.classList.add("dirty");}',
      '  else{input.removeAttribute("name");input.classList.remove("dirty");}',
      '  updateSaveState();',
      '}',
      'function hasChangedInputs(){return document.querySelectorAll(".payment-input[name]").length>0;}',
      'function updateSaveState(){if(saveBtn){saveBtn.disabled=!hasChangedInputs();}}',
      'function validateInputs(silent){',
      '  var errors=[];',
      '  var totals={};',
      '  var limits={};',
      '  var inputs=Array.prototype.slice.call(document.querySelectorAll(".payment-input"));',
      '  inputs.forEach(function(input){',
      '    var invoiceId=input.getAttribute("data-invoice-id")||"";',
      '    var amount=Number(input.getAttribute("data-amount")||0);',
      '    var max=Math.abs(amount);',
      '    var value=Number(input.value||0);',
      '    var lineInvalid=!isFinite(value)||value<0||value>max+0.000001;',
      '    totals[invoiceId]=(totals[invoiceId]||0)+(isFinite(value)?value:0);',
      '    limits[invoiceId]=Number(input.getAttribute("data-invoice-limit")||0);',
      '    input.classList.toggle("invalid",lineInvalid);',
      '    if(lineInvalid){errors.push("Payment applied cannot be greater than the line amount.");}',
      '  });',
      '  Object.keys(totals).forEach(function(invoiceId){',
      '    if(totals[invoiceId]>Number(limits[invoiceId]||0)+0.000001){',
      '      errors.push("Total payment applied for invoice "+invoiceId+" cannot be greater than the payment amount applied to that invoice.");',
      '      inputs.forEach(function(input){if((input.getAttribute("data-invoice-id")||"")===invoiceId){input.classList.add("invalid");}});',
      '    }',
      '  });',
      '  if(errors.length){if(!silent){showMessage(errors[0],true);}return false;}',
      '  if(!silent){hideMessage();}',
      '  return true;',
      '}',
      'function toggleRow(button){',
      '  var row=closestRow(button);',
      '  if(!row)return;',
      '  var next=row.getAttribute("data-expanded")==="F";',
      '  row.setAttribute("data-expanded",next?"T":"F");',
      '  button.innerHTML=next?"&#9662;":"&#9656;";',
      '  button.setAttribute("aria-expanded",next?"true":"false");',
      '  refreshRows();',
      '}',
      'function refreshRows(){',
      '  var rows=allRows();',
      '  var map={};',
      '  rows.forEach(function(row){map[row.getAttribute("data-row-id")]=row;});',
      '  rows.forEach(function(row){row.style.display=isVisibleByParents(row,map)?"":"none";});',
      '}',
      'function isVisibleByParents(row,map){',
      '  var parentId=row.getAttribute("data-parent-id")||"";',
      '  while(parentId){var parent=map[parentId];if(!parent)return true;if(parent.getAttribute("data-expanded")==="F")return false;parentId=parent.getAttribute("data-parent-id")||"";}',
      '  return true;',
      '}',
      'function allRows(){return Array.prototype.slice.call(document.querySelectorAll("#gridBody tr[data-level]"));}',
      'function closestRow(node){while(node&&node.tagName!=="TR"){node=node.parentNode;}return node;}',
      'function normalizeAmount(value){var number=Number(value||0);return isFinite(number)?number.toFixed(2):"NaN";}',
      'function showMessage(text,isError){message.hidden=false;message.textContent=text;message.className="message"+(isError?" error":" success");}',
      'function hideMessage(){if(message.className.indexOf("success")===-1){message.hidden=true;message.textContent="";message.className="message";}}',
      'try{init();}catch(error){if(window.console&&console.error){console.error("[PDI client] init failed",error);}if(message){showMessage("Client script error: "+(error.message||String(error)),true);}}',
      '}());'
    ].join('');
  }

  function renderError(error) {
    return '<!doctype html><html><body style="font-family:Arial,sans-serif;padding:24px;">' +
      '<h2>Payment Invoice Drilldown Error</h2>' +
      '<pre style="white-space:pre-wrap;color:#b42318;">' + escapeHtml(error.message || String(error)) + '</pre>' +
      '</body></html>';
  }

  function emptyDataset(message) {
    return {
      error: message || '',
      projectId: '',
      resultCount: 0,
      salesOrderCount: 0,
      invoiceCount: 0,
      paymentCount: 0,
      lineCount: 0,
      groups: [],
      totals: {
        total: 0,
        amountRemaining: 0,
        paymentApplied: 0
      }
    };
  }

  function parsePayment(value) {
    var raw = text(value);
    var match;

    if (!raw) return null;
    if (raw === '- None -' || raw.toLowerCase() === 'none') return null;

    match = raw.match(/\s(\d+)$/);

    if (match) {
      return {
        id: match[1],
        name: raw.substring(0, match.index).trim()
      };
    }

    return {
      id: '',
      name: raw
    };
  }

  function sortByDateThenName(a, b) {
    var dateA = a.date || '';
    var dateB = b.date || '';

    if (dateA !== dateB) {
      return String(dateA).localeCompare(String(dateB));
    }

    return String(a.documentNumber).localeCompare(String(b.documentNumber));
  }

  function writeJson(context, payload) {
    context.response.setHeader({
      name: 'Content-Type',
      value: 'application/json'
    });
    context.response.write({
      output: JSON.stringify(payload)
    });
  }

  function transactionUrl(pathName, id) {
    if (!id) return '';
    return '/app/accounting/transactions/' + pathName + '.nl?id=' + encodeURIComponent(id);
  }

  function itemUrl(id) {
    if (!id) return '';
    return '/app/common/item/item.nl?id=' + encodeURIComponent(id);
  }

  function toNumber(value) {
    if (value === null || value === undefined || value === '') return 0;
    if (typeof value === 'number') return isFinite(value) ? value : 0;
    var parsed = parseFloat(String(value).replace(/,/g, ''));
    return isNaN(parsed) || !isFinite(parsed) ? 0 : parsed;
  }

  function numberValue(value) {
    return toNumber(value);
  }

  function text(value) {
    if (value === null || value === undefined) return '';
    return String(value).trim();
  }

  function safeId(value) {
    return text(value).replace(/[^A-Za-z0-9_-]/g, '_') || 'blank';
  }

  function escapeHtml(value) {
    return String(value === null || value === undefined ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  return {
    onRequest: onRequest
  };
});
