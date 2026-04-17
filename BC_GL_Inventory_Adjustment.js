function customizeGlImpact(transactionRecord, standardLines, customLines, book) {
  try {
    var headerAccountId = transactionRecord.getFieldValue('account'); // IA header account
    nlapiLogExecution('DEBUG', 'headerAccountId', headerAccountId);
    var fixedTaxAccountId = 959; // tax clearing / liability

    if (!headerAccountId) return;

    // --------------------------------------------------
    // STEP 1: Detect header account direction from standardLines
    // --------------------------------------------------
    var headerIsDebit = false;
    var headerIsCredit = false;

    for (var i = 0; i < standardLines.getCount(); i++) {
      var stdLine = standardLines.getLine(i);

      if (stdLine.getAccountId() == headerAccountId) {
        var debit = parseFloat(stdLine.getDebitAmount() || 0);
        var credit = parseFloat(stdLine.getCreditAmount() || 0);

        if (debit > 0) headerIsDebit = true;
        if (credit > 0) headerIsCredit = true;
      }
    }

    if (!headerIsDebit && !headerIsCredit) {
      nlapiLogExecution('DEBUG', 'Custom GL', 'Header account has no debit/credit impact');
      return;
    }

    // --------------------------------------------------
    // STEP 2: Loop inventory lines & apply tax
    // --------------------------------------------------
    var lineCount = transactionRecord.getLineItemCount('inventory') || 0;

    for (var l = 1; l <= lineCount; l++) {

      var taxable = transactionRecord.getLineItemValue('inventory', 'custcol_nontaxable', l);
      nlapiLogExecution('DEBUG', 'taxable', taxable);
      if (taxable == 'T') continue;

      var taxAmountRaw = transactionRecord.getLineItemValue('inventory', 'custcol4', l);
      if (!taxAmountRaw) continue;

      var taxAmount = Math.abs(parseFloat(taxAmountRaw || 0));
      if (!taxAmount) continue;

      var locationId = transactionRecord.getLineItemValue('inventory', 'location', l);
      var memo =
        transactionRecord.getLineItemValue('inventory', 'memo', l) ||
        transactionRecord.getFieldValue('memo') ||
        '';

      // --------------------------------------------------
      // Header Account – SAME side as standard GL
      // --------------------------------------------------
      var headerLine = customLines.addNewLine();
      headerLine.setAccountId(parseInt(headerAccountId, 10));

      if (headerIsDebit) {
        headerLine.setDebitAmount(taxAmount);
      } else if (headerIsCredit) {
        headerLine.setCreditAmount(taxAmount);
      }

      if (locationId) headerLine.setLocationId(parseInt(locationId, 10));
      headerLine.setMemo(memo);

      // --------------------------------------------------
      // Fixed Tax Account – OPPOSITE side
      // --------------------------------------------------
      var taxLine = customLines.addNewLine();
      taxLine.setAccountId(parseInt(fixedTaxAccountId, 10));

      if (headerIsDebit) {
        taxLine.setCreditAmount(taxAmount);
      } else if (headerIsCredit) {
        taxLine.setDebitAmount(taxAmount);
      }

      if (locationId) taxLine.setLocationId(parseInt(locationId, 10));
      taxLine.setMemo(memo);
    }

  } catch (e) {
    nlapiLogExecution('ERROR', 'Custom GL Error', e.name + ': ' + e.message);
  }
}
