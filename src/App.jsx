import React, { useState, useRef, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { parseHDFCStatement } from './utils/parser';
import { extractTextFromPDF } from './utils/pdfParser';
import { 
  Download, 
  FileSpreadsheet, 
  RefreshCw, 
  CheckCircle2, 
  AlertCircle,
  ClipboardPaste,
  ShieldPlus,
  Upload,
  FileText,
  Lock,
  X,
  Eye,
  EyeOff
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

function App() {
  const [inputText, setInputText] = useState('');
  const [transactions, setTransactions] = useState([]);
  const [selectedRows, setSelectedRows] = useState({}); // { index: true/false }
  const [status, setStatus] = useState('idle'); // idle, processing, success, error
  const [activeTab, setActiveTab] = useState('pdf'); // pdf or text
  const [dragOver, setDragOver] = useState(false);
  const [fileName, setFileName] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [openingBalance, setOpeningBalance] = useState(null);
  const [closingBalance, setClosingBalance] = useState(null);
  
  // Password modal state
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [pendingPdfFile, setPendingPdfFile] = useState(null);
  
  const fileInputRef = useRef(null);

  // Process a PDF file (reads fresh ArrayBuffer each time to avoid detached buffer issues)
  const processPdfFile = useCallback(async (file, pwd) => {
    setStatus('processing');
    setErrorMessage('');
    
    try {
      const buffer = await file.arrayBuffer();
      const text = await extractTextFromPDF(buffer, pwd);
      const result = parseHDFCStatement(text);
      
      if (result.transactions.length > 0) {
        setTransactions(result.transactions);
        setOpeningBalance(result.openingBalance);
        setClosingBalance(result.closingBalance);
        // Select all rows by default
        const selected = {};
        result.transactions.forEach((_, i) => { selected[i] = true; });
        setSelectedRows(selected);
        setStatus('success');
        setShowPasswordModal(false);
        setPendingPdfFile(null);
        setPassword('');
      } else {
        setStatus('error');
        setErrorMessage('No transactions found in the PDF. Make sure it\'s an HDFC bank statement.');
      }
    } catch (err) {
      if (err.needsPassword) {
        // PDF needs a password — store the File (not buffer) and show modal
        setPendingPdfFile(file);
        setShowPasswordModal(true);
        setStatus('idle');
      } else {
        console.error('PDF parsing error:', err);
        setStatus('error');
        setErrorMessage(err.message || 'Failed to parse PDF. Check if the file is a valid HDFC statement.');
      }
    }
  }, []);

  // Handle file selection (from input or drop)
  const handleFile = useCallback(async (file) => {
    if (!file) return;
    
    if (file.type !== 'application/pdf') {
      setStatus('error');
      setErrorMessage('Please upload a PDF file.');
      return;
    }

    setFileName(file.name);
    setTransactions([]);
    
    await processPdfFile(file);
  }, [processPdfFile]);

  // Password submit handler
  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    if (!pendingPdfFile || !password.trim()) return;
    await processPdfFile(pendingPdfFile, password.trim());
  };

  // Drag and drop handlers
  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    
    const file = e.dataTransfer.files[0];
    handleFile(file);
  };

  // Text paste processing
  const handleProcessText = () => {
    if (!inputText.trim()) return;
    setStatus('processing');
    setErrorMessage('');
    
    try {
      const result = parseHDFCStatement(inputText);
      setTransactions(result.transactions);
      setOpeningBalance(result.openingBalance);
      setClosingBalance(result.closingBalance);
      // Select all rows by default
      const selected = {};
      result.transactions.forEach((_, i) => { selected[i] = true; });
      setSelectedRows(selected);
      setStatus(result.transactions.length > 0 ? 'success' : 'error');
      if (result.transactions.length === 0) {
        setErrorMessage('No valid transactions found. Please ensure you pasted the full HDFC statement text.');
      }
    } catch (err) {
      console.error(err);
      setStatus('error');
      setErrorMessage('Failed to parse statement text.');
    }
  };

  // Download Excel — only selected rows, ref merged into description, no ref column
  const downloadExcel = () => {
    const selectedTxs = transactions
      .filter((_, idx) => selectedRows[idx])
      .map(tx => {
        let desc = tx.Description || '';
        if (tx['Reference No']) {
          desc += ` Ref: ${tx['Reference No']}`;
        }
        return {
          Date: tx.Date,
          Description: desc,
          Withdrawal: tx.Withdrawal,
          Deposit: tx.Deposit,
        };
      });

    if (selectedTxs.length === 0) return;

    try {
      const ws = XLSX.utils.json_to_sheet(selectedTxs, {
        header: ['Date', 'Description', 'Withdrawal', 'Deposit']
      });
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Statement');

      const filename = `HDFC_GoGSTBill_${new Date().toISOString().split('T')[0]}.xlsx`;
      XLSX.writeFile(wb, filename);
    } catch (error) {
      console.error('Error generating Excel:', error);
      alert('Failed to generate Excel file.');
    }
  };

  // Toggle a single row
  const toggleRow = (idx) => {
    setSelectedRows(prev => ({ ...prev, [idx]: !prev[idx] }));
  };

  // Toggle all rows
  const toggleAll = () => {
    const allSelected = transactions.every((_, i) => selectedRows[i]);
    const updated = {};
    transactions.forEach((_, i) => { updated[i] = !allSelected; });
    setSelectedRows(updated);
  };

  // Reset everything
  const handleReset = () => {
    setInputText('');
    setTransactions([]);
    setSelectedRows({});
    setStatus('idle');
    setFileName('');
    setErrorMessage('');
    setOpeningBalance(null);
    setClosingBalance(null);
    setPassword('');
    setPendingPdfFile(null);
    setShowPasswordModal(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const selectedCount = transactions.filter((_, i) => selectedRows[i]).length;

  return (
    <div className="container">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.5rem' }}>
          <div className="logo-icon glass">
            <FileSpreadsheet size={32} />
          </div>
          <div>
            <h1>SRR BankLedger</h1>
            <p className="subtitle">HDFC Statement → GoGSTBill Excel</p>
          </div>
        </div>

        {/* Tab Selector */}
        <div className="tab-bar">
          <button 
            className={`tab ${activeTab === 'pdf' ? 'tab-active' : ''}`}
            onClick={() => setActiveTab('pdf')}
          >
            <Upload size={16} />
            Upload PDF
          </button>
          <button 
            className={`tab ${activeTab === 'text' ? 'tab-active' : ''}`}
            onClick={() => setActiveTab('text')}
          >
            <ClipboardPaste size={16} />
            Paste Text
          </button>
        </div>

        {/* Input Section */}
        <section className="glass" style={{ padding: '2rem' }}>
          <AnimatePresence mode="wait">
            {activeTab === 'pdf' ? (
              <motion.div
                key="pdf"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ duration: 0.2 }}
              >
                {/* Dropzone */}
                <div 
                  className={`dropzone ${dragOver ? 'dropzone-active' : ''} ${fileName ? 'dropzone-loaded' : ''}`}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf"
                    style={{ display: 'none' }}
                    onChange={(e) => handleFile(e.target.files[0])}
                  />
                  
                  {fileName ? (
                    <div className="dropzone-loaded-content">
                      <FileText size={40} />
                      <span className="dropzone-filename">{fileName}</span>
                      <span className="dropzone-hint">Click to change file</span>
                    </div>
                  ) : (
                    <div className="dropzone-empty-content">
                      <div className="dropzone-icon-ring">
                        <Upload size={32} />
                      </div>
                      <span className="dropzone-label">
                        Drop your HDFC PDF statement here
                      </span>
                      <span className="dropzone-hint">or click to browse</span>
                    </div>
                  )}
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="text"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}
              >
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
                  <button className="btn btn-primary" onClick={handleProcessText} disabled={!inputText}>
                    <RefreshCw size={20} className={status === 'processing' ? 'spin' : ''} />
                    Process Statement
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </section>

        {/* Password Modal */}
        <AnimatePresence>
          {showPasswordModal && (
            <motion.div 
              className="modal-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <motion.div 
                className="modal glass"
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
              >
                <button className="modal-close" onClick={() => {
                  setShowPasswordModal(false);
                  setPendingPdfFile(null);
                  setStatus('idle');
                }}>
                  <X size={20} />
                </button>
                
                <div className="modal-icon">
                  <Lock size={32} />
                </div>
                <h2 className="modal-title">Password Protected PDF</h2>
                <p className="modal-desc">
                  This PDF requires a password to open. Please enter the password below.
                </p>
                
                <form onSubmit={handlePasswordSubmit}>
                  <div className="password-field">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      className="password-input"
                      placeholder="Enter PDF password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoFocus
                    />
                    <button 
                      type="button" 
                      className="password-toggle"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                  <button 
                    type="submit" 
                    className="btn btn-primary" 
                    style={{ width: '100%', marginTop: '1rem' }}
                    disabled={!password.trim()}
                  >
                    <Lock size={18} />
                    Unlock & Process
                  </button>
                </form>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Results */}
        <AnimatePresence>
          {transactions.length > 0 && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
            >
              {/* Balance Bar */}
              {(openingBalance !== null || closingBalance !== null) && (
                <div className="balance-bar">
                  {openingBalance !== null && (
                    <div className="balance-card glass">
                      <span className="balance-label">Opening Balance</span>
                      <span className="balance-amount">₹{openingBalance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                    </div>
                  )}
                  {closingBalance !== null && (
                    <div className="balance-card glass">
                      <span className="balance-label">Closing Balance</span>
                      <span className="balance-amount">₹{closingBalance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Download Bar */}
              <div className="download-bar glass">
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <CheckCircle2 size={22} color="var(--success)" />
                  <div>
                    <div style={{ fontWeight: 600 }}>
                      {selectedCount} of {transactions.length} Selected
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      Uncheck transactions to exclude from Excel
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                  <button className="btn btn-success" onClick={downloadExcel} disabled={selectedCount === 0}>
                    <Download size={18} />
                    Download GoGSTBill Excel ({selectedCount})
                  </button>
                  <button className="btn btn-ghost" onClick={handleReset}>
                    <RefreshCw size={18} />
                    New
                  </button>
                </div>
              </div>

              {/* Transaction Table */}
              <div className="table-container glass" style={{ padding: '0 1rem 1rem' }}>
                <div style={{ padding: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1rem' }}>
                    Preview
                  </h3>
                  <div className="summary-pills">
                    <span className="pill pill-credit">
                      ↓ ₹{transactions.filter((_, i) => selectedRows[i]).reduce((sum, tx) => sum + (tx.Deposit || 0), 0).toLocaleString('en-IN')}
                    </span>
                    <span className="pill pill-debit">
                      ↑ ₹{transactions.filter((_, i) => selectedRows[i]).reduce((sum, tx) => sum + (tx.Withdrawal || 0), 0).toLocaleString('en-IN')}
                    </span>
                  </div>
                </div>
                
                <table>
                  <thead>
                    <tr>
                      <th style={{ width: '40px' }}>
                        <input 
                          type="checkbox" 
                          className="row-checkbox"
                          checked={transactions.length > 0 && transactions.every((_, i) => selectedRows[i])}
                          onChange={toggleAll}
                        />
                      </th>
                      <th>Date</th>
                      <th>Description</th>
                      <th>Ref No</th>
                      <th>Withdrawal</th>
                      <th>Deposit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.map((tx, idx) => (
                      <tr key={idx} className={selectedRows[idx] ? '' : 'row-excluded'}>
                        <td style={{ width: '40px' }}>
                          <input 
                            type="checkbox" 
                            className="row-checkbox"
                            checked={!!selectedRows[idx]}
                            onChange={() => toggleRow(idx)}
                          />
                        </td>
                        <td style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{tx.Date}</td>
                        <td style={{ maxWidth: '400px', fontSize: '0.75rem' }}>{tx.Description}</td>
                        <td style={{ fontSize: '0.75rem', fontFamily: 'monospace' }}>{tx['Reference No']}</td>
                        <td>
                          {tx.Withdrawal && (
                            <span className="badge badge-debit">
                              ₹{tx.Withdrawal.toLocaleString('en-IN')}
                            </span>
                          )}
                        </td>
                        <td>
                          {tx.Deposit && (
                            <span className="badge badge-credit">
                              ₹{tx.Deposit.toLocaleString('en-IN')}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </motion.div>
          )}

          {status === 'error' && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="error-banner"
            >
              <AlertCircle size={20} />
              <p>{errorMessage || 'Something went wrong. Please try again.'}</p>
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
