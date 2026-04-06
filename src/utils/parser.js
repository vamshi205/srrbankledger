/**
 * Parses HDFC Bank text statement into a structured array of transactions.
 * Designed for the fixed-width text format provided.
 */
export const parseHDFCStatement = (text) => {
  const lines = text.split('\n');
  const transactions = [];
  let currentTx = null;

  // Regex to match the date at the start of a line (DD/MM/YY)
  const dateRegex = /^(\d{2}\/\d{2}\/\d{2})\s+/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;

    const dateMatch = line.match(dateRegex);

    if (dateMatch) {
      // If we were building a transaction, push it before starting a new one
      if (currentTx) {
        transactions.push(currentTx);
      }

      // New transaction line
      // Standard HDFC Text Format Indices (Approximate based on sample):
      // 0-8: Date (DD/MM/YY)
      // 10-50: Narration
      // 52-68: Ref No
      // 70-78: Value Date
      // 80-98: Withdrawal
      // 100-118: Deposit
      // 120+: Closing Balance

      const date = formatDate(dateMatch[1]);
      const narration = line.substring(10, 50).trim();
      const refNo = line.substring(52, 68).trim();
      const valueDate = line.substring(70, 78).trim();
      const withdrawalRaw = line.substring(80, 98).trim();
      const depositRaw = line.substring(100, 118).trim();

      currentTx = {
        Date: date,
        Description: narration,
        'Reference No': refNo,
        Withdrawal: cleanAmount(withdrawalRaw),
        Deposit: cleanAmount(depositRaw),
      };
    } else if (currentTx && line.startsWith('          ')) {
      // Continuation of narration (lines starting with spaces)
      const extraNarration = line.trim();
      if (extraNarration) {
        currentTx.Description += ' ' + extraNarration;
      }
    } else if (line.includes('--- End Of Statement ---') || line.includes('STATEMENT SUMMARY')) {
      // Break if we hit footer area
      if (currentTx) {
        transactions.push(currentTx);
        currentTx = null;
      }
      break;
    }
  }

  // Push the last transaction if exists
  if (currentTx) {
    transactions.push(currentTx);
  }

  return transactions;
};

/**
 * Formats DD/MM/YY to DD-MMM-YY
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

/**
 * Removes commas and converts string to float.
 * Returns empty string if no valid amount.
 */
const cleanAmount = (amtStr) => {
  if (!amtStr) return '';
  const cleaned = amtStr.replace(/,/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? '' : num;
};
