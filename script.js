// ======================
// Constants & Config
// ======================
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const ALLOWED_IMAGE_TYPES = ['jpg', 'jpeg', 'png', 'webp', 'bmp'];
const ALLOWED_PDF_TYPE = 'application/pdf';
let ocrWorker = null;

// ======================
// UI Helpers
// ======================
let isProcessing = false;

function toggleProcessing(state) {
    isProcessing = state;
    document.getElementById('loading-overlay').style.display = state ? 'flex' : 'none';
    document.body.style.cursor = state ? 'wait' : 'default';
}

function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.innerHTML = `
        <i class="fas fa-${type === 'error' ? 'times-circle' : 'check-circle'}"></i>
        <span>${message}</span>
    `;
    
    const alertsContainer = document.getElementById('system-alerts');
    alertsContainer.appendChild(notification);
    
    setTimeout(() => {
        notification.classList.add('exit');
        notification.addEventListener('animationend', () => notification.remove());
    }, 3000);
}

// ======================
// File Validation
// ======================
function validateFile(file, allowedTypes, isImage = false) {
    if (file.size > MAX_FILE_SIZE) {
        showNotification(`File too large (max ${MAX_FILE_SIZE/1024/1024}MB)`, 'error');
        return false;
    }
    
    const fileType = isImage ? file.type.split('/')[1] : file.type;
    if (!allowedTypes.includes(fileType.toLowerCase())) {
        showNotification(`Unsupported file type: ${fileType}`, 'error');
        return false;
    }
    
    return true;
}

// ======================
// Drag & Drop Handlers
// ======================
function initDragAndDrop() {
    const dropZones = [
        ...document.querySelectorAll('.tool-card'),
        document.querySelector('.hero')
    ];

    dropZones.forEach(zone => {
        zone.addEventListener('dragover', handleDragOver);
        zone.addEventListener('dragleave', handleDragLeave);
        zone.addEventListener('drop', handleDrop);
    });
}

function handleDragOver(e) {
    e.preventDefault();
    e.currentTarget.style.transform = 'scale(1.02)';
    e.currentTarget.style.boxShadow = '0 8px 20px rgba(0,0,0,0.15)';
}

function handleDragLeave(e) {
    e.preventDefault();
    e.currentTarget.style.transform = '';
    e.currentTarget.style.boxShadow = '';
}

function handleDrop(e) {
    e.preventDefault();
    const files = e.dataTransfer.files;
    const target = e.currentTarget;
    
    if (target.classList.contains('tool-card')) {
        const input = target.querySelector('input[type="file"]');
        if (input) {
            input.files = files;
            showNotification(`File${files.length > 1 ? 's' : ''} added to ${target.querySelector('h2').textContent}`, 'success');
        }
    } else {
        document.getElementById('heroUpload').files = files;
    }
    
    target.style.transform = '';
    target.style.boxShadow = '';
}

// ======================
// Core PDF Functions
// ======================
async function mergePDFs() {
    if (isProcessing) return;
    try {
        toggleProcessing(true);
        const files = Array.from(document.getElementById('mergeInput').files);
        
        if (files.length < 2) {
            throw new Error('Please select at least 2 PDF files');
        }

        const mergedPdf = await PDFDocument.create();
        for (const file of files) {
            if (!validateFile(file, [ALLOWED_PDF_TYPE])) return;
            const pdfBytes = await file.arrayBuffer();
            const pdf = await PDFDocument.load(pdfBytes);
            const pages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
            pages.forEach(page => mergedPdf.addPage(page));
        }

        const mergedBytes = await mergedPdf.save();
        saveAs(new Blob([mergedBytes], { type: 'application/pdf' }), 
               `merged_${Date.now()}.pdf`);
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
        
        if (!file || !validateFile(file, [ALLOWED_PDF_TYPE])) return;
        if (isNaN(splitPage)) throw new Error('Invalid page number');

        const pdfBytes = await file.arrayBuffer();
        const pdfDoc = await PDFDocument.load(pdfBytes);
        const pageCount = pdfDoc.getPageCount();

        if (splitPage < 1 || splitPage >= pageCount) {
            throw new Error(`Please enter a page between 1 and ${pageCount - 1}`);
        }

        const [firstPart, secondPart] = await Promise.all([
            createSplitPdf(pdfDoc, 0, splitPage),
            createSplitPdf(pdfDoc, splitPage, pageCount)
        ]);

        saveAs(new Blob([await firstPart.save()], { type: 'application/pdf' }), 
               `split_part1.pdf`);
        saveAs(new Blob([await secondPart.save()], { type: 'application/pdf' }), 
               `split_part2.pdf`);
        showNotification('PDF split successfully!', 'success');
    } catch (err) {
        showNotification(`Split Error: ${err.message}`, 'error');
    } finally {
        toggleProcessing(false);
    }
}

async function createSplitPdf(sourceDoc, start, end) {
    const newDoc = await PDFDocument.create();
    const pages = await newDoc.copyPages(sourceDoc, 
        Array.from({ length: end - start }, (_, i) => start + i));
    pages.forEach(page => newDoc.addPage(page));
    return newDoc;
}

// ======================
// Image & PDF Conversion
// ======================
async function imageToPDF() {
    if (isProcessing) return;
    try {
        toggleProcessing(true);
        const file = document.getElementById('imageInput').files[0];
        if (!file || !validateFile(file, ALLOWED_IMAGE_TYPES, true)) return;

        const orientation = await getImageOrientation(file);
        const img = await loadImage(file);
        const dimensions = getImageDimensions(img, orientation);
        
        const pdf = new jsPDF({
            orientation: dimensions.width > dimensions.height ? 'l' : 'p',
            unit: 'mm',
            format: [dimensions.width * 0.264583, dimensions.height * 0.264583]
        });
        
        pdf.addImage(img, 'JPEG', 0, 0, 
            dimensions.width * 0.264583, 
            dimensions.height * 0.264583
        );
        pdf.save(`converted_${Date.now()}.pdf`);
        showNotification('Image converted to PDF!', 'success');
    } catch (err) {
        showNotification(`Conversion Error: ${err.message}`, 'error');
    } finally {
        toggleProcessing(false);
    }
}

async function getImageOrientation(file) {
    return new Promise(resolve => {
        EXIF.getData(file, function() {
            resolve(EXIF.getTag(this, 'Orientation') || 1);
        });
    });
}

async function loadImage(file) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            URL.revokeObjectURL(img.src);
            resolve(img);
        };
        img.onerror = reject;
        img.src = URL.createObjectURL(file);
    });
}

function getImageDimensions(img, orientation) {
    return [5,6,7,8].includes(orientation) 
        ? { width: img.naturalHeight, height: img.naturalWidth }
        : { width: img.naturalWidth, height: img.naturalHeight };
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
        
        if (!file) throw new Error('Please select a file');
        output.textContent = 'Processing...';

        const text = file.type === ALLOWED_PDF_TYPE
            ? await extractTextFromPDF(file)
            : await performOCR(file, lang);

        output.textContent = text;
        showNotification('Text extraction complete!', 'success');
    } catch (err) {
        showNotification(`Extraction Error: ${err.message}`, 'error');
        document.getElementById('textOutput').textContent = '';
    } finally {
        await terminateOCRWorker();
        toggleProcessing(false);
    }
}

async function extractTextFromPDF(file) {
    const pdf = await pdfjsLib.getDocument(URL.createObjectURL(file)).promise;
    let text = '';
    
    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        text += content.items.map(item => item.str).join(' ') + '\n\n';
    }
    
    return text;
}

async function performOCR(file, lang) {
    ocrWorker = await Tesseract.createWorker({
        workerPath: 'https://cdn.jsdelivr.net/npm/tesseract.js@v4.0.2/dist/worker.min.js',
        langPath: 'https://cdn.jsdelivr.net/npm/tesseract.js-data@4.0.0',
        logger: m => updateOCRProgress(m.progress)
    });
    
    await ocrWorker.loadLanguage(lang);
    await ocrWorker.initialize(lang);
    const { data: { text } } = await ocrWorker.recognize(file);
    return text;
}

function updateOCRProgress(progress) {
    document.getElementById('textOutput').textContent = 
        `Processing: ${Math.round(progress * 100)}%`;
}

async function terminateOCRWorker() {
    if (ocrWorker) {
        await ocrWorker.terminate();
        ocrWorker = null;
    }
}

// ======================
// Initialization
// ======================
document.addEventListener('DOMContentLoaded', () => {
    initDragAndDrop();
    setInterval(cleanupMemory, 30000);
});

function cleanupMemory() {
    URL.revokeObjectURL(document.getElementById('pdfToImageInput').value);
    if (typeof window.gc === 'function') window.gc();
}

// ======================
// Helper Functions
// ======================
function parsePageRanges(input, totalPages) {
    try {
        if (!input) throw new Error('No pages specified');
        return input.split(',')
            .flatMap(part => {
                const trimmed = part.trim();
                if (trimmed.includes('-')) {
                    const [start, end] = trimmed.split('-').map(n => 
                        Math.max(1, Math.min(totalPages, parseInt(n))) - 1;
                    return Array.from({ length: end - start + 1 }, (_, i) => start + i);
                }
                const page = parseInt(trimmed) - 1;
                return [Math.max(0, Math.min(totalPages - 1, page)];
            })
            .filter((n, i, arr) => !isNaN(n) && arr.indexOf(n) === i);
    } catch (err) {
        showNotification(`Invalid page range: ${err.message}`, 'error');
        return [];
    }
}

// ... Add remaining helper functions from previous code ...
// ======================
// PDF Compression
// ======================
async function compressPDF() {
    if (isProcessing) return;
    try {
        toggleProcessing(true);
        const file = document.getElementById('compressInput').files[0];
        if (!file || !validateFile(file, [ALLOWED_PDF_TYPE])) return;

        const pdfDoc = await PDFDocument.load(await file.arrayBuffer(), {
            ignoreEncryption: true,
            throwOnInvalidObject: false
        });

        // Advanced compression settings
        const compressedBytes = await pdfDoc.save({
            useObjectStreams: true,
            compress: true,
            objectsPerStream: 30,
            embedFonts: false,
            saveNoteAnnotations: false
        });

        saveAs(new Blob([compressedBytes], { type: 'application/pdf' }), 
               `compressed_${sanitizeFilename(file.name)}`);
        showNotification('PDF compressed successfully!', 'success');
    } catch (err) {
        showNotification(`Compression Error: ${err.message}`, 'error');
    } finally {
        toggleProcessing(false);
    }
}

// ======================
// PDF to Images
// ======================
async function pdfToImages() {
    if (isProcessing) return;
    try {
        toggleProcessing(true);
        const file = document.getElementById('pdfToImageInput').files[0];
        const format = document.getElementById('imageFormat').value;
        if (!file || !validateFile(file, [ALLOWED_PDF_TYPE])) return;

        const pdf = await pdfjsLib.getDocument(URL.createObjectURL(file)).promise;
        const zip = new JSZip();
        const scale = 2; // High resolution rendering

        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const viewport = page.getViewport({ scale });
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            
            await page.render({
                canvasContext: ctx,
                viewport
            }).promise;

            const imgData = canvas.toDataURL(`image/${format}`, 0.9);
            zip.file(`page_${i}_${Date.now()}.${format}`, 
                   imgData.split(',')[1], { base64: true });
        }

        const zipFile = await zip.generateAsync({ type: 'blob' });
        saveAs(zipFile, `converted_images_${Date.now()}.zip`);
        showNotification('PDF converted to images!', 'success');
    } catch (err) {
        showNotification(`Conversion Error: ${err.message}`, 'error');
    } finally {
        toggleProcessing(false);
    }
}

// ======================
// Watermark Functions
// ======================
async function addWatermark() {
    if (isProcessing) return;
    try {
        toggleProcessing(true);
        const file = document.getElementById('watermarkInput').files[0];
        const text = document.getElementById('watermarkText').value.trim();
        const opacity = Math.min(1, Math.max(0, 
            parseFloat(document.getElementById('watermarkOpacity').value) || 0.5));
        
        if (!file) throw new Error('Please select a file');
        if (!text) throw new Error('Please enter watermark text');

        if (file.type === ALLOWED_PDF_TYPE) {
            await addPdfWatermark(file, text, opacity);
        } else if (ALLOWED_IMAGE_TYPES.includes(file.type.split('/')[1])) {
            await addImageWatermark(file, text, opacity);
        } else {
            throw new Error('Unsupported file type');
        }
    } catch (err) {
        showNotification(`Watermark Error: ${err.message}`, 'error');
    } finally {
        toggleProcessing(false);
    }
}

async function addPdfWatermark(file, text, opacity) {
    const pdfDoc = await PDFDocument.load(await file.arrayBuffer());
    const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    
    pdfDoc.getPages().forEach(page => {
        const { width, height } = page.getSize();
        page.drawText(text, {
            x: width/2 - 100,
            y: height/2,
            size: 48,
            opacity: opacity,
            font: font,
            color: rgb(0.8, 0.8, 0.8),
            rotate: degrees(-45),
            blendMode: 'Multiply'
        });
    });

    const watermarkedBytes = await pdfDoc.save();
    saveAs(new Blob([watermarkedBytes], { type: 'application/pdf' }), 
           `watermarked_${sanitizeFilename(file.name)}`);
    showNotification('PDF watermarked successfully!', 'success');
}

async function addImageWatermark(file, text, opacity) {
    const img = await loadImage(file);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    canvas.width = img.width;
    canvas.height = img.height;
    ctx.drawImage(img, 0, 0);
    
    ctx.globalAlpha = opacity;
    ctx.font = 'bold 48px Arial';
    ctx.fillStyle = 'rgba(128, 128, 128, 0.7)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.translate(canvas.width/2, canvas.height/2);
    ctx.rotate(-45 * Math.PI / 180);
    ctx.fillText(text, 0, 0);
    
    canvas.toBlob(blob => {
        saveAs(blob, `watermarked_${sanitizeFilename(file.name)}`);
        showNotification('Image watermarked successfully!', 'success');
    }, file.type);
}

// ======================
// Page Management
// ======================
async function deletePDFPages() {
    if (isProcessing) return;
    try {
        toggleProcessing(true);
        const file = document.getElementById('deletePagesInput').files[0];
        const pagesInput = document.getElementById('pagesToDelete').value;
        if (!file || !validateFile(file, [ALLOWED_PDF_TYPE])) return;

        const pdfDoc = await PDFDocument.load(await file.arrayBuffer());
        const pageIndices = parsePageRanges(pagesInput, pdfDoc.getPageCount());
        const pagesToKeep = getPagesToKeep(pdfDoc, pageIndices);

        const newPdf = await createNewPDFFromPages(pdfDoc, pagesToKeep);
        const newBytes = await newPdf.save();
        
        saveAs(new Blob([newBytes], { type: 'application/pdf' }), 
               `modified_${sanitizeFilename(file.name)}`);
        showNotification('Pages deleted successfully!', 'success');
    } catch (err) {
        showNotification(`Deletion Error: ${err.message}`, 'error');
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
        if (!file || !validateFile(file, [ALLOWED_PDF_TYPE])) return;

        const pdfDoc = await PDFDocument.load(await file.arrayBuffer());
        const pageIndices = parsePageOrder(orderInput, pdfDoc.getPageCount());
        
        const newPdf = await createNewPDFFromPages(pdfDoc, pageIndices);
        const newBytes = await newPdf.save();
        
        saveAs(new Blob([newBytes], { type: 'application/pdf' }), 
               `reordered_${sanitizeFilename(file.name)}`);
        showNotification('Pages reordered successfully!', 'success');
    } catch (err) {
        showNotification(`Reorder Error: ${err.message}`, 'error');
    } finally {
        toggleProcessing(false);
    }
}

// ======================
// Helper Functions
// ======================
function sanitizeFilename(filename) {
    return filename.replace(/[^a-z0-9\-._]/gi, '_').substring(0, 100);
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

function getPagesToKeep(pdfDoc, indicesToRemove) {
    return Array.from({ length: pdfDoc.getPageCount() })
        .map((_, i) => i)
        .filter(i => !indicesToRemove.includes(i));
}

async function createNewPDFFromPages(sourceDoc, pageIndices) {
    const newPdf = await PDFDocument.create();
    const copiedPages = await newPdf.copyPages(sourceDoc, pageIndices);
    copiedPages.forEach(page => newPdf.addPage(page));
    return newPdf;
}

// ======================
// Final Initialization
// ======================
document.addEventListener('DOMContentLoaded', () => {
    initDragAndDrop();
    setInterval(cleanupMemory, 30000);
    
    // Initialize all file inputs
    document.querySelectorAll('input[type="file"]').forEach(input => {
        input.addEventListener('change', () => {
            if (input.files.length > 0) {
                showNotification(`${input.files.length} file(s) selected`, 'success');
            }
        });
    });
});

window.addEventListener('beforeunload', () => {
    cleanupMemory();
    terminateOCRWorker().catch(console.error);
});
