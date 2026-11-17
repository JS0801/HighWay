function customizeGlImpact(transactionRecord, standardLines, customLines, book) {
  var stage = 'Read transaction';
  var lineNumber = 0;
  var transactionId = '';
  var pairsCreated = 0;
  var skipped = 0;
  var reclassInScope = false;
  var segmentIds = ['cseg_bc_project', 'cseg_bc_cost_code', 'cseg1'];

  function logDetails(level, title, details) {
    nlapiLogExecution(level, 'IA Tax GL | ' + title,
      'IA=' + (transactionId || '(unsaved)') +
      (lineNumber ? ' | inventory line=' + lineNumber : '') +
      ' | ' + details);
  }

  try {
    transactionId = transactionRecord.getId();
    var headerAccountId = transactionRecord.getFieldValue('account');
    var fixedTaxAccountId = 959;
    logDetails('DEBUG', 'Start', 'header account=' + headerAccountId +
      ' | tax account=' + fixedTaxAccountId + ' | book=' + (book ? book.getId() : ''));

    if (!headerAccountId) {
      logDetails('DEBUG', 'Stopped', 'Missing adjustment account');
      return;
    }

    var headerIsDebit = false;
    var headerIsCredit = false;
    var standardCount = standardLines.getCount();
    for (var i = 0; i < standardCount; i++) {
      stage = 'Read standard GL line ' + i;
      var stdLine = standardLines.getLine(i);
      if (stdLine.getAccountId() == headerAccountId) {
        var debit = parseFloat(stdLine.getDebitAmount() || 0);
        var credit = parseFloat(stdLine.getCreditAmount() || 0);
        if (debit > 0) headerIsDebit = true;
        if (credit > 0) headerIsCredit = true;
        logDetails('DEBUG', 'Matching standard line', 'index=' + i +
          ' | debit=' + debit + ' | credit=' + credit);
      }
    }
    if (!headerIsDebit && !headerIsCredit) {
      logDetails('DEBUG', 'Stopped', 'No debit or credit found for header account ' +
        headerAccountId + ' across ' + standardCount + ' standard lines');
      return;
    }

    stage = 'Read inventory line count';
    var lineCount = transactionRecord.getLineItemCount('inventory') || 0;
    logDetails('DEBUG', 'Posting direction', 'header has debit=' + headerIsDebit +
      ' | header has credit=' + headerIsCredit +
      ' | chosen header side=' + (headerIsDebit ? 'debit' : 'credit') +
      ' | inventory lines=' + lineCount);

    if (String(transactionRecord.getFieldValue('custbody_atlas_inv_adj_reason')) === '1' &&
        headerIsDebit && !headerIsCredit && lineCount) {
      reclassInScope = true;
      stage = 'Reclassify job materials';
      reclassJobMaterials(transactionRecord, standardLines, customLines, headerAccountId,
        segmentIds, lineCount, logDetails);
    }

    for (var l = 1; l <= lineCount; l++) {
      lineNumber = l;
      stage = 'Read non-taxable flag';
      var nonTaxable = transactionRecord.getLineItemValue('inventory', 'custcol_nontaxable', l);
      if (nonTaxable == 'T') {
        skipped++;
        logDetails('DEBUG', 'Skipped', 'Non-taxable flag is T');
        continue;
      }

      stage = 'Read tax amount';
      var taxAmountRaw = transactionRecord.getLineItemValue('inventory', 'custcol4', l);
      var taxAmount = Math.abs(parseFloat(taxAmountRaw || 0));
      if (!taxAmount) {
        skipped++;
        logDetails('DEBUG', 'Skipped', 'Zero, blank or nonnumeric tax | custcol4=' + taxAmountRaw);
        continue;
      }

      stage = 'Read location and memo';
      var locationId = transactionRecord.getLineItemValue('inventory', 'location', l);
      var memo = transactionRecord.getLineItemValue('inventory', 'memo', l) ||
        transactionRecord.getFieldValue('memo') || '';
      logDetails('DEBUG', 'Building tax pair', 'custcol4=' + taxAmountRaw +
        ' | absolute tax=' + taxAmount + ' | location=' + locationId);

      stage = 'Create header line';
      var headerLine = customLines.addNewLine();
      stage = 'Set header account ' + headerAccountId;
      headerLine.setAccountId(parseInt(headerAccountId, 10));
      stage = 'Set header amount';
      if (headerIsDebit) {
        headerLine.setDebitAmount(taxAmount);
      } else {
        headerLine.setCreditAmount(taxAmount);
      }
      stage = 'Set header location and memo';
      if (locationId) headerLine.setLocationId(parseInt(locationId, 10));
      headerLine.setMemo(memo);

      stage = 'Create tax line';
      var taxLine = customLines.addNewLine();
      stage = 'Set tax account ' + fixedTaxAccountId;
      taxLine.setAccountId(parseInt(fixedTaxAccountId, 10));
      stage = 'Set tax amount';
      if (headerIsDebit) {
        taxLine.setCreditAmount(taxAmount);
      } else {
        taxLine.setDebitAmount(taxAmount);
      }
      stage = 'Set tax location and memo';
      if (locationId) taxLine.setLocationId(parseInt(locationId, 10));
      taxLine.setMemo(memo);
      var assignments = [];
      for (var j = 0; j < segmentIds.length; j++) {
        var segmentId = segmentIds[j];
        stage = 'Copy cost segment ' + segmentId;
        var segmentValue = transactionRecord.getLineItemValue('inventory', segmentId, l);
        if (segmentValue) {
          headerLine.setSegmentValueId(segmentId, parseInt(segmentValue, 10));
        }
        assignments.push(segmentId + '=' + (segmentValue || '(blank)'));
      }
      logDetails('DEBUG', 'Cost line segments', assignments.join(' | '));
      pairsCreated++;
      logDetails('DEBUG', 'Pair built', 'debit account=' +
        (headerIsDebit ? headerAccountId : fixedTaxAccountId) + ' | credit account=' +
        (headerIsDebit ? fixedTaxAccountId : headerAccountId) + ' | amount=' + taxAmount);
    }
    lineNumber = 0;
    logDetails('DEBUG', 'Complete', 'inventory lines=' + lineCount +
      ' | skipped=' + skipped + ' | custom pairs built=' + pairsCreated);
  } catch (e) {
    var code = e && (typeof e.getCode === 'function' ? e.getCode() : e.name);
    var message = e && (typeof e.getDetails === 'function' ? e.getDetails() : e.message);
    logDetails('ERROR', 'Custom GL Error', 'stage=' + stage + ' | pairs built=' +
      pairsCreated + ' | ' + (code || 'Error') + ': ' + (message || String(e)));
    if (reclassInScope || stage.indexOf('Copy cost segment ') === 0) throw e;
  }
}

// Standard lines are read-only. Reclassify within each account using posted
// amounts, retaining the department, class and location of the original side.
function reclassJobMaterials(rec, standard, custom, materialsId, segments, count, log) {
  var lineTags = {};
  for (var l = 1; l <= count; l++) {
    if (!(Number(rec.getLineItemValue('inventory', 'adjustqtyby', l)) < 0)) return;
    var values = segments.map(function (id) {
      return Number(rec.getLineItemValue('inventory', id, l)) || 0;
    });
    lineTags[values.join('/')] = true;
  }

  var groups = {};
  // Verified from the 13000 Inventory register link on Production IA1059.
  var inventoryAccountId = 128;
  var candidates = [];
  var detailBalance = 0;
  var zeroIdRows = [];

  var inventoryMoves = [];
  var blank = [0, 0, 0];
  function dimensions(line) {
    return [line.getDepartmentId(), line.getLocationId(), line.getClassId()];
  }
  function addLine(account, dims, tags, cents, memo) {
    var line = custom.addNewLine();
    line.setAccountId(Number(account));
    if (cents > 0) line.setDebitAmount((cents / 100).toFixed(2));
    else line.setCreditAmount((-cents / 100).toFixed(2));
    if (dims[0]) line.setDepartmentId(Number(dims[0]));
    if (dims[1]) line.setLocationId(Number(dims[1]));
    if (dims[2]) line.setClassId(Number(dims[2]));
    segments.forEach(function (id, i) {
      if (tags[i]) line.setSegmentValueId(id, tags[i]);
      else if (line.getSegmentValueId(id)) {
        throw new Error('Unexpected sourced segment ' + id + ' on ' + memo);
      }
    });
    line.setMemo(memo);
  }

  for (var i = 0; i < standard.getCount(); i++) {
    var row = standard.getLine(i);
    if (!row.isPosting()) continue;
    var account = Number(row.getAccountId());
    if (account !== Number(materialsId) && account !== inventoryAccountId) continue;
    var cents = Math.round(Number(row.getDebitAmount() || 0) * 100) -
      Math.round(Number(row.getCreditAmount() || 0) * 100);
    if (!cents) continue;
    var entry = { row: row, account: account, cents: cents };
    log('DEBUG', 'Standard posting', 'index=' + i + ' | line id=' + row.getId() +
      ' | account=' + account + ' | cents=' + cents + ' | dims=' + dimensions(row).join('/'));
    if (Number(row.getId()) === 0) {
      zeroIdRows.push(entry);
    } else {
      candidates.push(entry);
      detailBalance += cents;
    }
  }

  // Some IAs expose their sole adjustment-account posting on line ID zero.
  // Prefer balanced detail; do not count a duplicate summary debit.
  if (detailBalance && zeroIdRows.length === 1 && detailBalance + zeroIdRows[0].cents === 0) {
    candidates.push(zeroIdRows[0]);
  }
  if (!candidates.length && zeroIdRows.length) {
    throw new Error('Unable to identify paired inventory and materials postings');
  }
  for (var n = 0; n < candidates.length; n++) {
    var posting = candidates[n];
    row = posting.row;
    account = posting.account;
    cents = posting.cents;
    var isMaterials = account === Number(materialsId);
    if ((isMaterials && cents < 0) || (!isMaterials && cents > 0)) {
      throw new Error('Unexpected posting direction on job withdrawal, account ' + account);
    }
    var dims = dimensions(row);
    var key = dims.slice(0, 2).join('/');
    var g = groups[key] || (groups[key] = { delta: {}, balance: 0, dims: null });
    var tags = segments.map(function (id) { return Number(row.getSegmentValueId(id)) || 0; });
    var tagKey = tags.join('/');
    if (isMaterials) {
      if (g.dims && String(g.dims[2] || '') !== String(dims[2] || '')) {
        throw new Error('Multiple materials classes for department/location ' + key);
      }
      g.dims = dims;
    } else {
      if (!lineTags[tagKey]) throw new Error('Inventory GL segments do not match an adjustment line');
      if (tagKey !== blank.join('/')) inventoryMoves.push({ account: account,
        dims: dims, tags: tags, cents: -cents });
    }
    g.balance += cents;
    g.delta[tagKey] = (g.delta[tagKey] || 0) - cents;
  }

  Object.keys(groups).forEach(function (key) {
    if (groups[key].balance !== 0) {
      throw new Error('Materials and 13000 Inventory do not reconcile for department/location ' + key + '; difference in cents=' + groups[key].balance);
    }
  });
  Object.keys(groups).forEach(function (key) {
    var g = groups[key];
    Object.keys(g.delta).forEach(function (tagKey) {
      if (g.delta[tagKey]) addLine(materialsId, g.dims, tagKey.split('/').map(Number),
        g.delta[tagKey], 'Job Materials - reclassify materials cost');
    });
  });
  inventoryMoves.forEach(function (move) {
    addLine(move.account, move.dims, move.tags, move.cents, 'Job Materials - offset tagged inventory');
    addLine(move.account, move.dims, blank, -move.cents, 'Job Materials - inventory relief');
  });
  log('DEBUG', 'Materials reclassification', 'Inventory credits reclassified=' + inventoryMoves.length);
}
