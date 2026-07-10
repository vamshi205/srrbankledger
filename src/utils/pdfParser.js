import * as pdfjsLib from 'pdfjs-dist';

// Set the worker source to the bundled worker
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url
).toString();

/**
 * Extracts raw text from a PDF file (ArrayBuffer).
 * Supports password-protected PDFs.
 * 
 * @param {ArrayBuffer} arrayBuffer - The PDF file data
 * @param {string} [password] - Optional password for encrypted PDFs
 * @returns {Promise<string>} - Extracted text from all pages
 * @throws {Object} - Throws { needsPassword: true } if password is required but not provided
 */
export const extractTextFromPDF = async (arrayBuffer, password) => {
  const loadingTask = pdfjsLib.getDocument({
    data: arrayBuffer,
    password: password || undefined,
  });

  let pdf;
  try {
    pdf = await loadingTask.promise;
  } catch (err) {
    // Check if it's a password error
    if (
      err.name === 'PasswordException' ||
      (err.message && err.message.includes('password'))
    ) {
      throw { needsPassword: true, message: 'This PDF requires a password.' };
    }
    throw err;
  }

  const allLines = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();

    // Group text items by their Y position (line grouping)
    const lineMap = new Map();
    for (const item of textContent.items) {
      if (!item.str.trim() && !item.str.includes(' ')) continue;
      
      // Round Y to group items on the same line (within 2px tolerance)
      const y = Math.round(item.transform[5] * 10) / 10;
      let foundKey = null;
      for (const key of lineMap.keys()) {
        if (Math.abs(key - y) < 2) {
          foundKey = key;
          break;
        }
      }
      
      const lineKey = foundKey !== null ? foundKey : y;
      if (!lineMap.has(lineKey)) {
        lineMap.set(lineKey, []);
      }
      lineMap.get(lineKey).push({
        text: item.str,
        x: item.transform[4],
        width: item.width,
      });
    }

    // Sort lines by Y position (top to bottom — PDF Y is bottom-up, so reverse)
    const sortedLines = [...lineMap.entries()]
      .sort((a, b) => b[0] - a[0]);

    for (const [, items] of sortedLines) {
      // Sort items left to right within each line
      items.sort((a, b) => a.x - b.x);
      
      // Reconstruct line with approximate spacing
      let line = '';
      let lastX = 0;
      for (const item of items) {
        const gap = item.x - lastX;
        if (lastX > 0 && gap > 10) {
          // Add spaces proportional to the gap
          const spaces = Math.max(1, Math.round(gap / 5));
          line += ' '.repeat(spaces);
        } else if (lastX > 0 && gap > 2) {
          line += ' ';
        }
        line += item.text;
        lastX = item.x + item.width;
      }
      allLines.push(line);
    }
  }

  return allLines.join('\n');
};
