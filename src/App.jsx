import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import { parseHDFCStatement } from './utils/parser';
import { 
  Download, 
  FileSpreadsheet, 
  RefreshCw, 
  CheckCircle2, 
  AlertCircle,
  ClipboardPaste,
  ShieldPlus
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

function App() {
  const [inputText, setInputText] = useState('');
  const [transactions, setTransactions] = useState([]);
  const [status, setStatus] = useState('idle'); // idle, processing, success, error

  const handleProcess = () => {
    if (!inputText.trim()) return;
    setStatus('processing');
    
    try {
      const data = parseHDFCStatement(inputText);
      setTransactions(data);
      setStatus(data.length > 0 ? 'success' : 'error');
    } catch (err) {
      console.error(err);
      setStatus('error');
    }
  };

  const downloadExcel = () => {
    console.log('Download initiated. Transactions count:', transactions.length);
    if (transactions.length === 0) {
      console.warn('No transactions to download');
      return;
    }

    try {
      // Create worksheet from transactions
      const ws = XLSX.utils.json_to_sheet(transactions, {
        header: ['Date', 'Description', 'Reference No', 'Withdrawal', 'Deposit']
      });

      // Create workbook
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Statement');

      // Generate filename
      const filename = `HDFC_Report_${new Date().toISOString().split('T')[0]}.xlsx`;

      console.log('Writing file:', filename);
      // Generate Excel data as array buffer
      const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      
      // Create Blob with correct Excel MIME type
      const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      
      // Cleanup
      setTimeout(() => {
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      }, 0);

      console.log('Manual download trigger successful');
    } catch (error) {
      console.error('Error generating Excel:', error);
      alert('Failed to generate Excel file. Check console for details.');
    }
  };

  return (
    <div className="container">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
          <div className="glass" style={{ padding: '0.75rem', color: 'var(--primary)' }}>
            <FileSpreadsheet size={32} />
          </div>
          <div>
            <h1>BankLedger Downloader</h1>
            <p className="subtitle">Convert HDFC Bank Statements to GoGSTBill Format</p>
          </div>
        </div>

        <section className="glass" style={{ padding: '2rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', color: 'var(--text-muted)' }}>
            <ClipboardPaste size={18} />
            <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>Paste your HDFC Text Statement below:</span>
          </div>
          
          <textarea 
            className="input-area"
            placeholder="Paste HDFC bank statement text here..."
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
          />

          <div style={{ marginTop: '1.5rem', display: 'flex', gap: '1rem' }}>
            <button className="btn btn-primary" onClick={handleProcess} disabled={!inputText}>
              <RefreshCw size={20} className={status === 'processing' ? 'spin' : ''} />
              Process Statement
            </button>
            
            {status === 'success' && (
              <button className="btn btn-success" onClick={downloadExcel}>
                <Download size={20} />
                Download GoGSTBill Excel
              </button>
            )}
          </div>
        </section>

        <AnimatePresence>
          {transactions.length > 0 && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="table-container glass"
              style={{ padding: '0 1rem 1rem' }}
            >
              <div style={{ padding: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <CheckCircle2 size={20} color="var(--success)" />
                  Parsed Transactions ({transactions.length})
                </h3>
              </div>
              
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Description</th>
                    <th>Ref No</th>
                    <th>Withdrawal</th>
                    <th>Deposit</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((tx, idx) => (
                    <tr key={idx}>
                      <td style={{ color: 'var(--text-muted)' }}>{tx.Date}</td>
                      <td style={{ maxWidth: '400px', fontSize: '0.75rem' }}>{tx.Description}</td>
                      <td style={{ fontSize: '0.75rem', fontFamily: 'monospace' }}>{tx['Reference No']}</td>
                      <td>
                        {tx.Withdrawal && (
                          <span className="badge badge-debit">
                            ₹{tx.Withdrawal.toLocaleString()}
                          </span>
                        )}
                      </td>
                      <td>
                        {tx.Deposit && (
                          <span className="badge badge-credit">
                            ₹{tx.Deposit.toLocaleString()}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </motion.div>
          )}

          {status === 'error' && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              style={{ marginTop: '2rem', display: 'flex', alignItems: 'center', gap: '0.75rem', color: '#f87171', background: 'rgba(239, 68, 68, 0.1)', padding: '1rem', borderRadius: '0.75rem' }}
            >
              <AlertCircle size={20} />
              <p>No valid transactions found. Please ensure you pasted the full HDFC statement text.</p>
            </motion.div>
          )}
        </AnimatePresence>

        <footer style={{ marginTop: '4rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
          <p style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
            <ShieldPlus size={16} />
            Secure Client-Side Processing. Your data never leaves your browser.
          </p>
        </footer>
      </motion.div>

      <style>{`
        .spin {
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

export default App;
