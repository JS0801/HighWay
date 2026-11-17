function customizeGlImpact(transactionRecord, standardLines, customLines, book) {
  var stage = 'Read transaction';
  var lineNumber = 0;
  var transactionId = '';
  var pairsCreated = 0;
  var skipped = 0;

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
  }
}
