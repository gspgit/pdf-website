// ======================
// Initialization & UI Setup
// ======================
document.addEventListener('DOMContentLoaded', () => {
    // Drag and Drop Setup
    const dropZone = document.querySelector('.hero');
    const heroUpload = document.querySelector('#heroUpload');
    
    ['dragover', 'dragenter'].forEach(event => {
        dropZone.addEventListener(event, (e) => {
            e.preventDefault();
            dropZone.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
        });
    });

    ['dragleave', 'drop'].forEach(event => {
        dropZone.addEventListener(event, (e) => {
            e.preventDefault();
            dropZone.style.backgroundColor = '';
        });
    });

    dropZone.addEventListener('drop', (e) => {
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            heroUpload.files = files;
            showNotification(`${files.length} file(s) ready for processing`, 'success');
        }
    });
});

// ======================
// UI Helpers
// ======================
let isProcessing = false;

function toggleProcessing(state) {
    isProcessing = state;
    document.querySelectorAll('.btn').forEach(btn => {
        btn.disabled = state;
    });
    document.body.style.cursor = state ? 'wait' : 'default';
}

function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.opacity = '0';
        setTimeout(() => notification.remove(), 300);
    }, 2700);
}

// ======================
// Core PDF Tools (Original Functionality Preserved)
// ======================

async function mergePDFs() {
    if (isProcessing) return;
    try {
        toggleProcessing(true);
        const files = document.getElementById('mergeInput').files;
        if (files.length < 2) throw new Error('Select at least 2 PDFs');
        
        const mergedPdf = await PDFDocument.create();
        const baseName = files[0].name.replace(/\.[^/.]+$/, "");

        for (const file of files) {
            const fileBytes = await file.arrayBuffer();
            const pdf = await PDFDocument.load(fileBytes);
            const pages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
            pages.forEach(page => mergedPdf.addPage(page));
        }

        const mergedBytes = await mergedPdf.save();
        saveAs(new Blob([mergedBytes], { type: 'application/pdf' }), 
            `${baseName}_merged.pdf`);
        showNotification('PDFs merged successfully!', 'success');
    } catch (err) {
        showNotification(`Merge Error: ${err.message}`, 'error');
    } finally {
        toggleProcessing(false);
    }
}

async function splitPDF() {
    if (isProcessing) return;
    try {
        toggleProcessing(true);
        const file = document.getElementById('splitInput').files[0];
        const splitPage = parseInt(document.getElementById('splitPage').value);
        if (!file || isNaN(splitPage)) throw new Error('Invalid input');
        
        const pdfBytes = await file.arrayBuffer();
        const pdfDoc = await PDFDocument.load(pdfBytes);
        const pageCount = pdfDoc.getPageCount();
        const baseName = file.name.replace(/\.[^/.]+$/, "");

        if (splitPage < 1 || splitPage >= pageCount) {
            throw new Error(`Enter a page between 1 and ${pageCount - 1}`);
        }

        const firstPart = await PDFDocument.create();
        const secondPart = await PDFDocument.create();
        
        const firstPages = await firstPart.copyPages(pdfDoc, 
            [...Array(splitPage).keys()]);
        const secondPages = await secondPart.copyPages(pdfDoc, 
            [...Array(pageCount - splitPage).keys()].map(i => i + splitPage));
        
        firstPages.forEach(page => firstPart.addPage(page));
        secondPages.forEach(page => secondPart.addPage(page));
        
        const part1Bytes = await firstPart.save();
        const part2Bytes = await secondPart.save();
        
        saveAs(new Blob([part1Bytes], { type: 'application/pdf' }), 
            `${baseName}_part1.pdf`);
        saveAs(new Blob([part2Bytes], { type: 'application/pdf' }), 
            `${baseName}_part2.pdf`);
        showNotification('PDF split successfully!', 'success');
    } catch (err) {
        showNotification(`Split Error: ${err.message}`, 'error');
    } finally {
        toggleProcessing(false);
    }
}

async function rotatePDF() {
    if (isProcessing) return;
    try {
        toggleProcessing(true);
        const file = document.getElementById('rotateInput').files[0];
        const angle = parseInt(document.getElementById('rotateAngle').value);
        if (!file) throw new Error('Select a PDF file');
        if (![90, -90, 180].includes(angle)) throw new Error('Invalid angle');

        const pdfDoc = await PDFDocument.load(await file.arrayBuffer());
        const pages = pdfDoc.getPages();
        
        pages.forEach(page => {
            const currentRotation = page.getRotation().angle;
            page.setRotation(degrees((currentRotation + angle) % 360));
        });

        const rotatedBytes = await pdfDoc.save();
        saveAs(new Blob([rotatedBytes], { type: 'application/pdf' }), 
            `${file.name.replace(/\.[^/.]+$/, "")}_rotated.pdf`);
        showNotification('PDF rotated successfully!', 'success');
    } catch (err) {
        showNotification(`Rotation Error: ${err.message}`, 'error');
    } finally {
        toggleProcessing(false);
    }
}

async function compressPDF() {
    if (isProcessing) return;
    try {
        toggleProcessing(true);
        const file = document.getElementById('compressInput').files[0];
        if (!file) throw new Error('Select a PDF file');

        const pdfDoc = await PDFDocument.load(await file.arrayBuffer(), {
            ignoreEncryption: true,
            throwOnInvalidObject: false
        });

        const compressedBytes = await pdfDoc.save({
            useObjectStreams: true,
            compress: true
        });

        saveAs(new Blob([compressedBytes], { type: 'application/pdf' }), 
            `${file.name.replace(/\.[^/.]+$/, "")}_compressed.pdf`);
        showNotification('PDF compressed successfully!', 'success');
    } catch (err) {
        showNotification(`Compression Error: ${err.message}`, 'error');
    } finally {
        toggleProcessing(false);
    }
}

async function deletePDFPages() {
    if (isProcessing) return;
    try {
        toggleProcessing(true);
        const file = document.getElementById('deletePagesInput').files[0];
        const pagesInput = document.getElementById('pagesToDelete').value;
        if (!file || !pagesInput) throw new Error('Select PDF and enter pages');

        const pdfDoc = await PDFDocument.load(await file.arrayBuffer());
        const pageIndices = parsePageRanges(pagesInput, pdfDoc.getPageCount());
        
        const pagesToKeep = Array.from({ length: pdfDoc.getPageCount() })
            .map((_, i) => i)
            .filter(i => !pageIndices.includes(i));

        const newPdf = await PDFDocument.create();
        const copiedPages = await newPdf.copyPages(pdfDoc, pagesToKeep);
        copiedPages.forEach(page => newPdf.addPage(page));

        const newPdfBytes = await newPdf.save();
        saveAs(new Blob([newPdfBytes], { type: 'application/pdf' }), 
            `${file.name.replace(/.pdf$/i, '_edited.pdf')}`);
        showNotification('Pages deleted successfully!', 'success');
    } catch (err) {
        showNotification(`Error: ${err.message}`, 'error');
    } finally {
        toggleProcessing(false);
    }
}

async function reorderPDFPages() {
    if (isProcessing) return;
    try {
        toggleProcessing(true);
        const file = document.getElementById('reorderPagesInput').files[0];
        const orderInput = document.getElementById('newPageOrder').value;
        if (!file || !orderInput) throw new Error('Select PDF and enter new order');

        const pdfDoc = await PDFDocument.load(await file.arrayBuffer());
        const pageIndices = parsePageOrder(orderInput, pdfDoc.getPageCount());

        const newPdf = await PDFDocument.create();
        const copiedPages = await newPdf.copyPages(pdfDoc, pageIndices);
        copiedPages.forEach(page => newPdf.addPage(page));

        const newPdfBytes = await newPdf.save();
        saveAs(new Blob([newPdfBytes], { type: 'application/pdf' }), 
            `${file.name.replace(/.pdf$/i, '_reordered.pdf')}`);
        showNotification('Pages reordered successfully!', 'success');
    } catch (err) {
        showNotification(`Error: ${err.message}`, 'error');
    } finally {
        toggleProcessing(false);
    }
}

// ======================
// Image Tools
// ======================

async function imageToPDF() {
    if (isProcessing) return;
    try {
        toggleProcessing(true);
        const file = document.getElementById('imageInput').files[0];
        if (!file) throw new Error('Select an image');

        const orientation = await new Promise(resolve => {
            EXIF.getData(file, function() {
                resolve(EXIF.getTag(this, 'Orientation') || 1);
            });
        });

        const objectURL = URL.createObjectURL(file);
        const img = await new Promise((resolve, reject) => {
            const image = new Image();
            image.onload = () => {
                URL.revokeObjectURL(objectURL);
                resolve(image);
            };
            image.onerror = reject;
            image.src = objectURL;
        });

        let width = img.naturalWidth;
        let height = img.naturalHeight;
        if ([5,6,7,8].includes(orientation)) [width, height] = [height, width];

        const pdf = new jsPDF({
            orientation: width > height ? 'l' : 'p',
            unit: 'mm',
            format: [width * 0.264583, height * 0.264583]
        });
        
        pdf.addImage(img, 'JPEG', 0, 0, 
            width * 0.264583, 
            height * 0.264583
        );
        pdf.save(`${file.name.replace(/\.[^/.]+$/, "")}_converted.pdf`);
        showNotification('Image converted successfully!', 'success');
    } catch (err) {
        showNotification(`Conversion Error: ${err.message}`, 'error');
    } finally {
        toggleProcessing(false);
    }
}

async function addWatermark() {
    if (isProcessing) return;
    try {
        toggleProcessing(true);
        const file = document.getElementById('watermarkInput').files[0];
        const text = document.getElementById('watermarkText').value;
        const opacity = parseFloat(document.getElementById('watermarkOpacity').value) || 0.5;
        if (!file || !text) throw new Error('Select file and enter text');

        if (file.type === 'application/pdf') {
            const pdfDoc = await PDFDocument.load(await file.arrayBuffer());
            const { rgb } = pdfDoc;
            const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
            
            pdfDoc.getPages().forEach(page => {
                page.drawText(text, {
                    x: 50,
                    y: page.getHeight() - 50,
                    size: 30,
                    opacity: opacity,
                    font: font,
                    color: rgb(0.5, 0.5, 0.5)
                });
            });

            const bytes = await pdfDoc.save();
            saveAs(new Blob([bytes], { type: 'application/pdf' }), 
                `${file.name.replace(/\.[^/.]+$/, "")}_watermarked.pdf`);
        } else {
            const img = await new Promise(resolve => {
                const image = new Image();
                image.onload = () => resolve(image);
                image.src = URL.createObjectURL(file);
            });

            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            
            ctx.drawImage(img, 0, 0);
            ctx.globalAlpha = opacity;
            ctx.font = '30px Arial';
            ctx.fillStyle = 'rgba(128, 128, 128, 0.5)';
            ctx.fillText(text, 50, img.height - 50);
            
            canvas.toBlob(blob => {
                saveAs(blob, `${file.name.replace(/\.[^/.]+$/, "")}_watermarked.${file.type.split('/')[1]}`);
            }, file.type);
        }
        showNotification('Watermark applied successfully!', 'success');
    } catch (err) {
        showNotification(`Watermark Error: ${err.message}`, 'error');
    } finally {
        toggleProcessing(false);
    }
}

async function pdfToImages() {
    if (isProcessing) return;
    try {
        toggleProcessing(true);
        const file = document.getElementById('pdfToImageInput').files[0];
        const format = document.getElementById('imageFormat').value;
        if (!file) throw new Error('Select a PDF file');

        const pdf = await pdfjsLib.getDocument(URL.createObjectURL(file)).promise;
        const zip = new JSZip();

        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const viewport = page.getViewport({ scale: 2 });
            const canvas = document.createElement('canvas');
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            
            await page.render({ 
                canvasContext: canvas.getContext('2d'), 
                viewport 
            }).promise;

            const imgData = canvas.toDataURL(`image/${format}`);
            zip.file(`page-${i}.${format}`, imgData.split(',')[1], { base64: true });
        }

        const zipFile = await zip.generateAsync({ type: 'blob' });
        saveAs(zipFile, `${file.name.replace(/.pdf$/, "")}_images.zip`);
        showNotification('PDF converted to images!', 'success');
    } catch (err) {
        showNotification(`Conversion Error: ${err.message}`, 'error');
    } finally {
        toggleProcessing(false);
    }
}

// ======================
// Text Extraction (OCR)
// ======================
async function extractText() {
    if (isProcessing) return;
    try {
        toggleProcessing(true);
        const file = document.getElementById('textExtractInput').files[0];
        const lang = document.getElementById('ocrLang').value;
        const output = document.getElementById('textOutput');
        if (!file) throw new Error('Select a file');

        output.textContent = 'Processing...';
        let text = '';
        
        if (file.type === 'application/pdf') {
            const pdf = await pdfjsLib.getDocument(URL.createObjectURL(file)).promise;
            for (let i = 1; i <= pdf.numPages; i++) {
                const page = await pdf.getPage(i);
                const content = await page.getTextContent();
                text += content.items.map(item => item.str).join(' ');
            }
        } else {
            const worker = await Tesseract.createWorker({
                workerPath: 'https://cdn.jsdelivr.net/npm/tesseract.js@v4.0.2/dist/worker.min.js',
                langPath: 'https://cdn.jsdelivr.net/npm/tesseract.js-data@4.0.0',
                logger: m => {
                    output.textContent = `Processing: ${Math.round(m.progress * 100)}%`;
                }
            });
            await worker.loadLanguage(lang);
            await worker.initialize(lang);
            const { data: { text: ocrText } } = await worker.recognize(file);
            text = ocrText;
            await worker.terminate();
        }

        output.textContent = text;
        showNotification('Text extraction complete!', 'success');
    } catch (err) {
        document.getElementById('textOutput').textContent = '';
        showNotification(`Text Extraction Error: ${err.message}`, 'error');
    } finally {
        toggleProcessing(false);
    }
}

// ======================
// Helper Functions (Unchanged)
// ======================
function parsePageRanges(input, totalPages) {
    if (!input) throw new Error('No pages specified');
    return input.split(',')
        .flatMap(part => {
            if (part.includes('-')) {
                const [start, end] = part.split('-').map(n => Math.min(parseInt(n) - 1, totalPages - 1));
                return Array.from({ length: end - start + 1 }, (_, i) => start + i);
            }
            return [parseInt(part) - 1];
        })
        .filter(n => !isNaN(n) && n >= 0 && n < totalPages);
}

function parsePageOrder(input, totalPages) {
    if (!input) throw new Error('No order specified');
    return input.split(',')
        .map(n => {
            const num = parseInt(n) - 1;
            if (isNaN(num)) throw new Error('Invalid page number');
            return num;
        })
        .filter(n => n >= 0 && n < totalPages);
    }
// ======================
// Enhanced PDF Validation
// ======================
async function validatePDF(file) {
    try {
        await PDFDocument.load(await file.arrayBuffer());
        return true;
    } catch {
        return false;
    }
}

// ======================
// File Size Limiter
// ======================
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

function checkFileSize(file) {
    if (file.size > MAX_FILE_SIZE) {
        showNotification(`File too large (max ${MAX_FILE_SIZE/1024/1024}MB)`, 'error');
        return false;
    }
    return true;
}

// ======================
// Enhanced Drag & Drop
// ======================
function initDragAndDrop() {
    document.querySelectorAll('.tool-card').forEach(card => {
        card.addEventListener('dragover', handleDragOver);
        card.addEventListener('drop', handleDrop);
    });
}

function handleDragOver(e) {
    e.preventDefault();
    e.currentTarget.style.backgroundColor = '#f8f9fa';
}

function handleDrop(e) {
    e.preventDefault();
    e.currentTarget.style.backgroundColor = '';
    const files = e.dataTransfer.files;
    const input = e.currentTarget.querySelector('input[type="file"]');
    if (input) {
        input.files = files;
        showNotification(`File${files.length > 1 ? 's' : ''} added to ${input.closest('.tool-card').querySelector('h2').textContent}`, 'success');
    }
}

// ======================
// Page Range Helper UI
// ======================
document.querySelectorAll('.num-input').forEach(input => {
    input.addEventListener('focus', () => {
        input.placeholder = `Total pages: ${input.dataset.totalPages || 'N/A'}`;
    });
    
    input.addEventListener('blur', () => {
        input.placeholder = input.dataset.originalPlaceholder;
    });
});

// ======================
// Enhanced Watermarking
// ======================
async function getWatermarkPosition(page) {
    return {
        x: page.getWidth() / 2,
        y: page.getHeight() / 2,
        angle: -45
    };
}

// ======================
// PDF Metadata Cleaner
// ======================
async function cleanMetadata(pdfDoc) {
    pdfDoc.setTitle('');
    pdfDoc.setAuthor('');
    pdfDoc.setSubject('');
    pdfDoc.setKeywords([]);
    pdfDoc.setProducer('');
    pdfDoc.setCreator('');
}

// ======================
// File Type Validation
// ======================
function validateFileType(file, allowedTypes) {
    const fileType = file.type.split('/')[1];
    if (!allowedTypes.includes(fileType.toLowerCase())) {
        showNotification(`Invalid file type: ${fileType}`, 'error');
        return false;
    }
    return true;
}

// ======================
// Memory Management
// ======================
function cleanupMemory() {
    if (typeof window.gc !== 'undefined') {
        window.gc();
    }
    URL.revokeObjectURL(document.getElementById('pdfToImageInput').value);
}

// ======================
// Auto-Reset Forms
// ======================
function autoResetForms() {
    document.querySelectorAll('.tool-card').forEach(card => {
        const form = card.querySelector('input[type="file"]');
        form.addEventListener('change', () => {
            setTimeout(() => {
                form.value = '';
            }, 3000);
        });
    });
}

// ======================
// Initialize Everything
// ======================
document.addEventListener('DOMContentLoaded', () => {
    initDragAndDrop();
    autoResetForms();
    setInterval(cleanupMemory, 30000); // Clean memory every 30 seconds
});

// ======================
// Enhanced Helper Functions
// ======================
function parsePageRanges(input, totalPages) {
    try {
        if (!input) throw new Error('No pages specified');
        return input.split(',')
            .flatMap(part => {
                const trimmed = part.trim();
                if (trimmed.includes('-')) {
                    const [start, end] = trimmed.split('-')
                        .map(n => Math.max(1, Math.min(totalPages, parseInt(n))) - 1;
                    return Array.from({ length: end - start + 1 }, (_, i) => start + i);
                }
                return [Math.max(0, Math.min(totalPages - 1, parseInt(trimmed) - 1)];
            })
            .filter((n, i, arr) => !isNaN(n) && arr.indexOf(n) === i);
    } catch (err) {
        showNotification(`Invalid page range: ${err.message}`, 'error');
        return [];
    }
}

function parsePageOrder(input, totalPages) {
    try {
        if (!input) throw new Error('No order specified');
        return input.split(',')
            .map(n => {
                const num = parseInt(n.trim()) - 1;
                if (isNaN(num)) throw new Error('Invalid page number');
                return Math.max(0, Math.min(totalPages - 1, num));
            })
            .filter((n, i, arr) => arr.indexOf(n) === i);
    } catch (err) {
        showNotification(`Invalid page order: ${err.message}`, 'error');
        return [];
    }
}

// ======================
// Security Enhancements
// ======================
function sanitizeFilename(filename) {
    return filename.replace(/[^a-z0-9\-._]/gi, '_').substring(0, 100);
}

// ======================
// Worker Cleanup
// ======================
let ocrWorker;
async function terminateOCRWorker() {
    if (ocrWorker) {
        await ocrWorker.terminate();
        ocrWorker = null;
    }
}

// ======================
// Enhanced Text Extraction
// ======================
async function extractText() {
    // ... previous extractText code ...
    finally {
        await terminateOCRWorker();
    }
}

// ======================
// Final Initialization
// ======================
window.addEventListener('beforeunload', () => {
    cleanupMemory();
    terminateOCRWorker();
});
