/**
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 * @NModuleScope SameAccount
 */

define(['N/record', 'N/search', 'N/log', 'N/url'], function (record, search, log, url) {

/**
 * Before Load event handler for Invoice
 *
 * @param {object} context - User Event context object
 */
function beforeLoad(context) {
  if (context.type === context.UserEventType.VIEW) {
    const { form } = context;
    const currentRec = context.newRecord;
    const recordId = context.newRecord.id;
    const bcProj = currentRec.getValue('cseg_bc_project');

    if (bcProj) {
      // Add a custom button to the form
      const suiteletUrl = url.resolveScript({
        scriptId: 'customscript_bc_sl_aia_forms',
        deploymentId: 'customdeploy_bc_sl_aia_forms'
      });

      const buttonScript = `window.open('${suiteletUrl}&recordid=${recordId}', '_blank');`;

      form.addButton({
        id: 'custpage_my_button',
        label: 'Print Stored Materials AIA Form',
        functionName: buttonScript
      });
      // form.removeButton('custpage_print_aia_forms');
    }
  }
}

  var LINE_NUM = 'custcol_bc_proj_line_num';
  var CURR_SM = 'custcol_bc_curr_portion_stored_mat';
  var STORED_SM = 'custcol_bc_materials_present_stored';

  function afterSubmit(context) {
    if (
      context.type !== context.UserEventType.CREATE &&
      context.type !== context.UserEventType.EDIT &&
      context.type !== context.UserEventType.COPY
    ) {
      return;
    }

    try {
      var recId = context.newRecord.id;
      var inv = record.load({
        type: record.Type.INVOICE,
        id: recId,
        isDynamic: false
      });

      var salesOrderId = inv.getValue('createdfrom');
      if (!salesOrderId) return;

      var projectId = inv.getValue('cseg_bc_project');
      var lineCount = inv.getLineCount({ sublistId: 'item' });

      var currentMoh = {};
      var baseLines = {};

      for (var i = 0; i < lineCount; i++) {
        var desc = inv.getSublistValue({
          sublistId: 'item',
          fieldId: 'description',
          line: i
        }) || '';

        var lineNum = inv.getSublistValue({
          sublistId: 'item',
          fieldId: LINE_NUM,
          line: i
        });

        var mohLineNum = getMohLineNum(desc);

        if (mohLineNum) {
          currentMoh[mohLineNum] = (currentMoh[mohLineNum] || 0) + getLineAmount(inv, i);
        } else if (lineNum) {
          baseLines[String(lineNum)] = i;
        }
      }

      var cumulativeMoh = getCumulativeMoh(salesOrderId, projectId, recId);
      var changed = false;

      Object.keys(baseLines).forEach(function (lineNum) {
        var line = baseLines[lineNum];
        var currentValue = roundAmount(currentMoh[lineNum] || 0);
        var storedValue = roundAmount(cumulativeMoh[lineNum] || 0);

        var oldCurrent = roundAmount(inv.getSublistValue({
          sublistId: 'item',
          fieldId: CURR_SM,
          line: line
        }) || 0);

        var oldStored = roundAmount(inv.getSublistValue({
          sublistId: 'item',
          fieldId: STORED_SM,
          line: line
        }) || 0);

        if (oldCurrent !== currentValue) {
          inv.setSublistValue({
            sublistId: 'item',
            fieldId: CURR_SM,
            line: line,
            value: currentValue
          });
          changed = true;
        }

        if (oldStored !== storedValue) {
          inv.setSublistValue({
            sublistId: 'item',
            fieldId: STORED_SM,
            line: line,
            value: storedValue
          });
          changed = true;
        }
      });

      if (changed) {
        inv.save({
          enableSourcing: false,
          ignoreMandatoryFields: true
        });

        log.audit('AIA stored material updated', {
          invoiceId: recId
        });
      }

    } catch (e) {
      log.error('AIA stored material afterSubmit error', e);
    }
  }

  function getCumulativeMoh(salesOrderId, projectId, invoiceId) {
    var totals = {};

    var filters = [
      ['type', 'anyof', 'CustInvc'],
      'AND', ['mainline', 'is', 'F'],
      'AND', ['taxline', 'is', 'F'],
      'AND', ['shipping', 'is', 'F'],
      'AND', ['createdfrom', 'anyof', salesOrderId],
      'AND', ['internalidnumber', 'lessthanorequalto', invoiceId]
    ];

    if (projectId) {
      filters.push('AND', ['cseg_bc_project', 'anyof', projectId]);
    }

    search.create({
      type: search.Type.INVOICE,
      filters: filters,
      columns: ['memo', 'amount']
    }).run().each(function (row) {
      var lineNum = getMohLineNum(row.getValue('memo') || '');
      if (lineNum) {
        totals[lineNum] = (totals[lineNum] || 0) + toNumber(row.getValue('amount'));
      }
      return true;
    });

    return totals;
  }

  function getMohLineNum(text) {
    var match = String(text || '').match(/\bMOH\b\s*-?\s*(?:ITEM\s*)?([A-Za-z0-9._-]+)/i);
    return match ? String(match[1]) : '';
  }

  function getLineAmount(inv, line) {
    return toNumber(inv.getSublistValue({
      sublistId: 'item',
      fieldId: 'amount',
      line: line
    }));
  }

  function toNumber(value) {
    var n = parseFloat(value);
    return isNaN(n) ? 0 : n;
  }

  function roundAmount(value) {
    return Math.round(toNumber(value) * 100) / 100;
  }

  return {
    beforeLoad: beforeLoad,
    afterSubmit: afterSubmit
  };
});
