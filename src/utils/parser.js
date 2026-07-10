/**
 * Parses HDFC Bank statement text (from PDF extraction or copy-paste)
 * into a structured array of transactions for GoGSTBill import.
 */
export const parseHDFCStatement = (text) => {
  const lines = text.split('\n');
  const transactions = [];
  let currentTx = null;
  let openingBalance = null;
  let closingBalance = null;

  // Date regex: DD/MM/YY at start of line
  const dateRegex = /^\s*(\d{2}\/\d{2}\/\d{2})\s+/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;

    // Extract balances from statement summary section
    if (line.includes('STATEMENTSUMMARY') || line.includes('STATEMENT SUMMARY') || 
        line.includes('--- End Of Statement ---')) {
      if (currentTx) {
        transactions.push(currentTx);
        currentTx = null;
      }
      // Look ahead for the balance line
      for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
        const balLine = lines[j];
        if (balLine && (balLine.includes('OpeningBalance') || balLine.includes('Opening Balance'))) {
          continue; // This is the header line
        }
        // The balance values line contains opening bal, dr count, cr count, debits, credits, closing bal
        const balAmounts = balLine?.match(/(\d{1,3}(?:,\d{2,3})*\.\d{2})/g);
        if (balAmounts && balAmounts.length >= 2) {
          openingBalance = parseFloat(balAmounts[0].replace(/,/g, ''));
          closingBalance = parseFloat(balAmounts[balAmounts.length - 1].replace(/,/g, ''));
          break;
        }
      }
      break;
    }

    // Skip header lines
    if (line.includes('Narration') && line.includes('Chq')) continue;
    if (line.includes('PageNo') || line.includes('Page No')) continue;
    if (line.includes('AccountBranch') || line.includes('Account Branch')) continue;

    const dateMatch = line.match(dateRegex);

    if (dateMatch) {
      // Save previous transaction
      if (currentTx) {
        transactions.push(currentTx);
      }

      const rawDate = dateMatch[1];
      const date = formatDate(rawDate);
      const afterDate = line.substring(dateMatch[0].length);

      // Extract all amounts from the line (XX,XXX.XX format)
      const amountPattern = /(?:^|[\s])(\d{1,3}(?:,\d{2,3})*\.\d{2})(?=[\s]|$)/g;
      const amounts = [];
      let m;
      const searchStr = ' ' + afterDate; // Prepend space to catch first amount
      while ((m = amountPattern.exec(searchStr)) !== null) {
        amounts.push(parseFloat(m[1].replace(/,/g, '')));
      }

      // Extract reference number — look for known patterns
      let refNo = '';
      const refMatch = afterDate.match(
        /\b(AX[A-Z]{2,4}\d{8,}|0{4,}\d{8,}|\d{15,18})\b/
      );
      if (refMatch) {
        refNo = refMatch[1];
      }

      // Extract narration — text between date and ref number/value date
      let narration = afterDate;
      // Remove the ref number portion
      if (refMatch) {
        narration = narration.substring(0, narration.indexOf(refMatch[1])).trim();
      }
      // Remove amounts from narration
      for (const amt of amounts) {
        narration = narration.replace(amt.toLocaleString('en-IN', { minimumFractionDigits: 2 }), '');
        narration = narration.replace(amt.toString(), '');
      }
      // Remove value date (DD/MM/YY) that appears after ref
      narration = narration.replace(/\d{2}\/\d{2}\/\d{2}/g, '').trim();
      // Clean up extra spaces
      narration = narration.replace(/\s+/g, ' ').trim();

      // Determine if this is a withdrawal or deposit based on narration keywords
      const isDebit = isDebitTransaction(narration + ' ' + afterDate);
      const isCredit = isCreditTransaction(narration + ' ' + afterDate);

      // amounts[0] = the transaction amount, amounts[1] = closing balance (if present)
      const txAmount = amounts.length > 0 ? amounts[0] : '';
      let withdrawal = '';
      let deposit = '';

      if (txAmount) {
        if (isDebit) {
          withdrawal = txAmount;
        } else if (isCredit) {
          deposit = txAmount;
        } else {
          // Fallback: if we can't determine, check if closing balance goes up or down
          // For safety, mark as withdrawal (user can verify)
          withdrawal = txAmount;
        }
      }

      currentTx = {
        Date: date,
        Description: narration,
        'Reference No': refNo,
        Withdrawal: withdrawal,
        Deposit: deposit,
      };
    } else if (currentTx) {
      const trimmed = line.trim();
      
      // Skip non-narration continuation lines
      if (!trimmed || 
          trimmed.startsWith('STATEMENTSUMMARY') ||
          trimmed.startsWith('STATEMENT SUMMARY') ||
          trimmed.startsWith('Opening') ||
          trimmed.startsWith('Generated') ||
          trimmed.startsWith('Thisis') ||
          trimmed.startsWith('This is') ||
          trimmed.startsWith('HDFCBANK') ||
          trimmed.startsWith('HDFC BANK') ||
          trimmed.startsWith('*Closing')) {
        if (trimmed.startsWith('STATEMENTSUMMARY') || trimmed.startsWith('STATEMENT SUMMARY')) {
          transactions.push(currentTx);
          currentTx = null;
        }
        continue;
      }

      // Append continuation text to description
      currentTx.Description += ' ' + trimmed;
    }
  }

  // Push last transaction if exists
  if (currentTx) {
    transactions.push(currentTx);
  }

  // Final cleanup on all descriptions
  for (const tx of transactions) {
    tx.Description = cleanDescription(tx.Description);
  }

  return { transactions, openingBalance, closingBalance };
};

/**
 * Checks if the narration indicates a debit/withdrawal transaction.
 */
const isDebitTransaction = (text) => {
  const upper = text.toUpperCase();
  return (
    upper.includes('NEFTDR') ||
    upper.includes('NEFT DR') ||
    upper.includes('RTGSDR') ||
    upper.includes('RTGS DR') ||
    upper.includes('UPI-DR') ||
    upper.includes('ACH D-') ||
    upper.includes('ATW-') ||          // ATM withdrawal
    upper.includes('POS ') ||          // POS debit
    upper.includes('BIL/') ||          // Bill payment
    upper.includes('EMI/') ||          // EMI
    upper.includes('NFS/') ||          // NFS withdrawal
    upper.includes('MOB TRF') ||       // Mobile transfer (debit)
    upper.includes('FT - CR ')         // Fund transfer debit
  );
};

/**
 * Checks if the narration indicates a credit/deposit transaction.
 */
const isCreditTransaction = (text) => {
  const upper = text.toUpperCase();
  return (
    upper.includes('NEFTCR') ||
    upper.includes('NEFT CR') ||
    upper.includes('RTGSCR') ||
    upper.includes('RTGS CR') ||
    upper.includes('UPI-CR') ||
    upper.includes('ACH C-') ||
    upper.includes('CHQDEP') ||
    upper.includes('CHQ DEP') ||
    upper.includes('IMPS-') ||         // IMPS usually credit in this context
    upper.includes('IMPS/') ||
    upper.includes('CASH DEP') ||
    upper.includes('INT.PAID') ||      // Interest credit
    upper.includes('BY CLG') ||        // Clearing credit
    upper.includes('CR-')             // Generic credit prefix
  );
};

/**
 * Cleans up description text.
 */
const cleanDescription = (desc) => {
  if (!desc) return '';
  return desc
    .replace(/\s+/g, ' ')
    .replace(/- /g, '-')
    .trim();
};

/**
 * Formats DD/MM/YY to DD-MMM-YY (GoGSTBill format).
 */
const formatDate = (dateStr) => {
  if (!dateStr) return '';
  const parts = dateStr.split('/');
  if (parts.length !== 3) return dateStr;

  const day = parts[0];
  const monthIdx = parseInt(parts[1], 10) - 1;
  const year = parts[2];

  const months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
  ];

  const monthName = months[monthIdx] || parts[1];
  return `${day}-${monthName}-${year}`;
};
