/**
 * @NApiVersion 2.1
 * @NScriptType ClientScript
 */
define(['N/search', 'N/currentRecord', 'N/runtime'], function (search, currentRecord, runtime) {

  var FLD_GROUP = 'custbody_approver_group';
  var SUBLIST_ID = 'recmachcustrecord_bc_related_parent_transaction';
  var FLD_LEVEL = 'custrecord_bc_approval_level';
  var FLD_APPROVER = 'custrecord_bc_approver_name';

  var APPROVER_REC_TYPE = 'customrecord_approver_group';
  var FLD_LINK_TO_GROUP = 'internalid';

  var _suppress = false;

  function setFieldSafely(rec, fieldId, value) {
    _suppress = true;
    try {
      var cur = rec.getValue({ fieldId: fieldId });
      if (cur !== value) {
        rec.setValue({ fieldId: fieldId, value: value, ignoreFieldChange: true });
      }
    } finally {
      _suppress = false;
    }
  }

  function fieldChanged(context) {
    try {
      if (_suppress) return;
      if (context.fieldId !== FLD_GROUP) return;

      var rec = context.currentRecord;
      var groupId = rec.getValue({ fieldId: FLD_GROUP });

      if (!groupId) {
        var existingCount = rec.getLineCount({ sublistId: SUBLIST_ID });
        if (existingCount > 0) {
          var confirmClear = confirm('Removing the Approver Group will also remove all approvers from the list.\n\nDo you want to continue?');
          if (!confirmClear) {
            setFieldSafely(rec, FLD_GROUP, context.oldValue || '');
            return;
          }
        }
        clearSublist(rec);
        return;
      }

      var countBefore = rec.getLineCount({ sublistId: SUBLIST_ID });
      if (countBefore > 0) {
        var confirmReplace = confirm('Changing the Approver Group will replace all existing approvers in the list.\n\nDo you want to continue?');
        if (!confirmReplace) {
          setFieldSafely(rec, FLD_GROUP, context.oldValue || '');
          return;
        }
      }

      var approvers = fetchApprovers(groupId);
      log.debug('approvers', approvers)
      clearSublist(rec);
      addApproverLines(rec, approvers);

    } catch (e) {
      console && console.error && console.error('fieldChanged error:', e);
      alert('Unable to load approvers for the selected group. See console for details.');
    }
  }

  function clearSublist(rec) {
    try {
      var count = rec.getLineCount({ sublistId: SUBLIST_ID }) || 0;
      for (var i = count - 1; i >= 0; i--) {
        rec.removeLine({ sublistId: SUBLIST_ID, line: i, ignoreRecalc: true });
      }
    } catch (e) {
      console && console.error && console.error('clearSublist error:', e);
    }
  }

  function addApproverLines(rec, approvers) {
    if (!approvers || approvers.length === 0) return;
    approvers.sort(function (a, b) { return (a.level || 0) - (b.level || 0); });
    for (var i = 0; i < approvers.length; i++) {
      var row = approvers[i];
      rec.selectNewLine({ sublistId: SUBLIST_ID });
      rec.setCurrentSublistValue({ sublistId: SUBLIST_ID, fieldId: FLD_LEVEL, value: row.level, ignoreFieldChange: true });
      rec.setCurrentSublistValue({ sublistId: SUBLIST_ID, fieldId: FLD_APPROVER, value: row.approver, ignoreFieldChange: true });
      rec.commitLine({ sublistId: SUBLIST_ID });
    }
  }

  function fetchApprovers(groupId) {
    try {

          var list = [];
    var s = search.create({
      type: APPROVER_REC_TYPE,
      filters: [[FLD_LINK_TO_GROUP, 'anyof', groupId]],
      columns: [
        search.createColumn({ name: 'custrecord_level_1_approver' }),
        search.createColumn({ name: 'custrecord_level_2_approver' }),
        search.createColumn({ name: 'custrecord_level_3_approver' }),
        search.createColumn({ name: 'custrecord_level_4_approver' }),
        search.createColumn({ name: 'custrecord_level_5_approver' })
      ]
    });

    s.run().each(function (r) {
      for (var lvl = 1; lvl <= 5; lvl++) {
        var approverId = r.getValue({ name: 'custrecord_level_' + lvl + '_approver' });
        if (approverId) list.push({ approver: approverId, level: lvl });
      }
      return true;
    });
      
    } catch (error) {
      log.error('error', error)
    }


    return list;
  }


  var APPROVER_TAB_TD_ID = 'custom548lnk';
  var APPROVER_WRAPPER_ID = 'custom548_wrapper'; // main container
  var APPROVER_DIV_ID     = 'custom548_div';  

  function getCurrentRecordType(rec) {
    try {
      return rec && rec.type ? rec.type : '';
    } catch (e) { return ''; }
  }

  function isAdminRole() {
    try {
      var rid = runtime.getCurrentUser().role;
      return String(rid) === '3';
    } catch (e) {
      return false;
    }
  }

  function getRoleAccessFlags(roleId) {
    // Returns: { ap: true/false, ar: true/false }
    var out = { ap: false, ar: false };
    log.debug('roleId', roleId)

    try {
   //   if (!roleId) return out;

      var rs = search.create({
        type: search.Type.ROLE,
        filters: [['internalid', 'anyof', roleId]],
        columns: [
          search.createColumn({ name: 'custrecord_access_to_approval_matrix_ap' }),
          search.createColumn({ name: 'custrecord_access_to_approval_matrix_ar' })
        ]
      });

      var res = rs.run().getRange({ start: 0, end: 1 });
      if (res && res.length) {
        var r = res[0];
        log.debug('r', r)

        // checkbox fields can come back as 'T'/'F' or true/false
        var apVal = r.getValue({ name: 'custrecord_access_to_approval_matrix_ap' });
        var arVal = r.getValue({ name: 'custrecord_access_to_approval_matrix_ar' });

        out.ap = (apVal === true || apVal === 'T');
        out.ar = (arVal === true || arVal === 'T');
      }
    } catch (e) {
      console && console.error && console.error('getRoleAccessFlags error:', e);
    }

    return out;
  }

  function hasAccessForRecordType(recType, flags) {

    recType = (recType || '').toLowerCase();

    if (isAdminRole()) return true;

    if (recType === 'invoice') {
      return !!flags.ar;
    }

    // Vendor Bill record type string is usually 'vendorbill'
    if (recType === 'vendorbill' || recType === 'bill') {
      return !!flags.ap;
    }

    if (recType === 'purchaseorder') {
      return !!flags.ap;
    }

    // default: deny
    return false;
  }

  function hideApproverUI() {
    try {
      // Hide the main tab button (so user can’t click the tab)
      var tabTd = document.getElementById(APPROVER_TAB_TD_ID);
      if (tabTd) tabTd.style.display = 'none';

      // Hide the entire tab content wrapper
      var w = document.getElementById(APPROVER_WRAPPER_ID);
      if (w) {
        w.style.display = 'none';
        return;
      }

      // backup if wrapper id changes
      var d = document.getElementById(APPROVER_DIV_ID);
      if (d) {
        d.style.display = 'none';
        return;
      }

      // last fallback: hide the sublist table itself
      var t = document.getElementById('recmachcustrecord_bc_related_parent_transaction_splits');
      if (t) {
        var fs = t.closest('div');
        if (fs) fs.style.display = 'none';
      }
    } catch (e) {
      console && console.error && console.error('hideApproverUI error:', e);
    }
  }


  function enforceRoleAccessOnLoad(context) {
    try {
      var rec = context.currentRecord || currentRecord.get();
      

      var recType = getCurrentRecordType(rec);
      var roleId = runtime.getCurrentUser().role;
      log.debug('Record Details', {recType, roleId})

      // Admin always true
      if (isAdminRole()) return;

      var flags = getRoleAccessFlags(roleId);
      var allowed = hasAccessForRecordType(recType, flags);
      log.debug('Role Details', {flags, allowed})

      if (!allowed) {
        hideApproverUI();
      }
    } catch (e) {
      console && console.error && console.error('enforceRoleAccessOnLoad error:', e);
    }
  }

  function pageInit(context) {
    enforceRoleAccessOnLoad(context);
  }


  function validateLine(context) {
    var rec = context.currentRecord;
    if (context.sublistId !== SUBLIST_ID) return true;

    var approver = rec.getCurrentSublistValue({ sublistId: SUBLIST_ID, fieldId: FLD_APPROVER });
    var level = rec.getCurrentSublistValue({ sublistId: SUBLIST_ID, fieldId: FLD_LEVEL });
    var currentIndex = (typeof rec.getCurrentSublistIndex === 'function')
      ? rec.getCurrentSublistIndex({ sublistId: SUBLIST_ID })
      : -1;

    if (!approver || !level) return true;

    var lineCount = rec.getLineCount({ sublistId: SUBLIST_ID });
    var levelCount = {};

    for (var i = 0; i < lineCount; i++) {
      if (i === currentIndex) continue;
      var existingApprover = rec.getSublistValue({ sublistId: SUBLIST_ID, fieldId: FLD_APPROVER, line: i });
      var existingLevel = rec.getSublistValue({ sublistId: SUBLIST_ID, fieldId: FLD_LEVEL, line: i });

      if (existingApprover === approver || existingLevel === level) {
        alert('This Approver and Level combination already exists in the list.');
        return false;
      }

      // Track count per level
      levelCount[existingLevel] = (levelCount[existingLevel] || 0) + 1;
    }

    // Check if Level already has more than 1 approver assigned
    if ((levelCount[level] || 0) >= 1) {
      alert('Level ' + level + ' already has an approver assigned. Only one approver can be assigned per level.');
      return false;
    }

    return true;
  }

  function saveRecord(context) {
    var rec = currentRecord.get();
    var mode = runtime.executionContext;

    if (mode !== runtime.ContextType.USER_INTERFACE) return true;
  //  if (rec.id) return true;

    var lineCount = rec.getLineCount({ sublistId: SUBLIST_ID });
    log.debug('lineCount', lineCount)
    if (lineCount == 0) rec.setValue('approvalstatus', 2)
    var comboMap = {};
    var levelCount = {};

    for (var i = 0; i < lineCount; i++) {
      var approver = rec.getSublistValue({ sublistId: SUBLIST_ID, fieldId: FLD_APPROVER, line: i });
      var level = rec.getSublistValue({ sublistId: SUBLIST_ID, fieldId: FLD_LEVEL, line: i });
      if (!approver || !level) continue;

      var comboKey = approver + '|' + level;
      if (comboMap[comboKey]) {
        alert('Duplicate combination of Approver and Approval Level found on line ' + (i + 1) + '. Approver and Level must be unique.');
        return false;
      }
      comboMap[comboKey] = true;

      levelCount[level] = (levelCount[level] || 0) + 1;
      if (levelCount[level] > 1) {
        alert('Level ' + level + ' has more than one approver assigned. Only one approver can be assigned per level.');
        return false;
      }
    }

    return true;
  }

  return {
   // pageInit: pageInit,
    fieldChanged: fieldChanged,
    validateLine: validateLine,
    saveRecord: saveRecord
  };
});
