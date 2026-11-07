// Exercise the real printWindow lifecycle, including its popup image repair.
// Usage: electron scripts/verify-card-popup.cjs [mobile card screenshot]
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const printStart = html.indexOf('    function printWindow(');
const printEnd = html.indexOf('    function printStudent(', printStart);
if (printStart < 0 || printEnd < 0) throw new Error('Production printWindow function not found');
const printWindowSource = html.slice(printStart, printEnd);
const screenshotPath = process.argv[2];
const screenshot = screenshotPath
    ? 'data:image/png;base64,' + fs.readFileSync(path.resolve(screenshotPath)).toString('base64')
    : null;
app.setPath('userData', path.join(root, 'dist', 'card-popup-review', 'chromium-profile'));
app.disableHardwareAcceleration();

app.whenReady().then(async () => {
    const win = new BrowserWindow({
        show:false,
        width:390,
        height:844,
        webPreferences:{ offscreen:true, partition:`temporary-card-popup-${Date.now()}` }
    });
    win.webContents.session.webRequest.onBeforeRequest(
        { urls:['https://script.google.com/*', 'https://script.googleusercontent.com/*', 'https://fonts.googleapis.com/*'] },
        (_details, callback) => callback({ cancel:true })
    );
    await win.loadURL(pathToFileURL(path.join(root, 'index.html')).href);
    const result = await win.webContents.executeJavaScript(`(async () => {
        const esc = value => String(value ?? '');
        const safePhotoSrc = value => value || '';
        const showToast = () => {};
        ${printWindowSource}
        const iframe = document.createElement('iframe');
        document.body.append(iframe);
        const popup = iframe.contentWindow;
        let printCalled = false;
        let popupOpenCount = 0;
        popup.print = () => { printCalled = true; };
        window.open = () => { popupOpenCount++; return popup; };

        const photo = document.createElement('canvas');
        photo.width = 300; photo.height = 400;
        const ctx = photo.getContext('2d');
        if (${screenshot ? 'true' : 'false'}) {
            const screenshot = new Image();
            screenshot.src = ${screenshot ? JSON.stringify(screenshot) : 'null'};
            await screenshot.decode();
            ctx.drawImage(screenshot, 30, 390, 456, 610, 0, 0, 300, 400);
        } else {
            ctx.fillStyle = '#1999fe'; ctx.fillRect(0, 0, 300, 400);
            ctx.fillStyle = '#33251f'; ctx.beginPath(); ctx.arc(150, 140, 50, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#f0f3f7'; ctx.fillRect(35, 185, 245, 200);
        }
        const source = photo.toDataURL('image/png');
        const student = { studentName:'Test Student', studentCode:'STU-0125', photo:'', gender:'ប្រុស', className:'7C' };
        const restoreStudentPhotos = async () => {};
        let hydrateStudentPhotosFromSheet = async rows => {
            await new Promise(resolve => setTimeout(resolve, 100));
            rows.forEach(row => { row.photo = source; });
        };
        printWindow('Card test', () => StudentCardTemplate.render([student], {}, 'assets/moeys-logo.png', '២០២៥-២០២៦'), [student]);
        const openedBeforePhoto = !!iframe.contentDocument.getElementById('prepare-status') && !student.photo && !printCalled;
        const cardImage = await new Promise((resolve, reject) => {
            const until = Date.now() + 8000;
            const poll = () => {
                const image = iframe.contentDocument.querySelector('[data-card-photo]');
                if (image?.src.startsWith('data:image/jpeg')) return resolve(image);
                if (Date.now() > until) return reject(new Error('Popup photo repair did not run'));
                setTimeout(poll, 30);
            };
            poll();
        });
        await cardImage.decode();
        ctx.clearRect(0, 0, 300, 400);
        ctx.drawImage(cardImage, 0, 0, 300, 400);
        const cornerIsBlue = x => {
            const p = ctx.getImageData(x, 392, 1, 1).data;
            return p[2] > p[0] + 100;
        };
        for (let i = 0; i < 30 && !printCalled; i++) {
            await new Promise(resolve => setTimeout(resolve, 20));
        }
        const failedFrame = document.createElement('iframe');
        document.body.append(failedFrame);
        const failedPopup = failedFrame.contentWindow;
        failedPopup.print = () => { throw new Error('Incomplete photos must not auto-print'); };
        window.open = () => failedPopup;
        hydrateStudentPhotosFromSheet = async () => { throw new Error('temporary photo error'); };
        const missingStudent = {studentName:'Preview Student', studentCode:'STU-FAIL', photo:''};
        printWindow('Card test', () => StudentCardTemplate.render([missingStudent], {}, 'assets/moeys-logo.png', '២០២៥-២០២៦'), [missingStudent]);
        const previewOnFailure = await new Promise((resolve, reject) => {
            const until = Date.now() + 4000;
            const poll = () => {
                const doc = failedFrame.contentDocument;
                if (doc.getElementById('retry-prepare')) return resolve(doc.body.textContent.includes('STU-FAIL'));
                if (Date.now() > until) return reject(new Error('Print preview did not survive photo failure'));
                setTimeout(poll, 25);
            };
            poll();
        });
        const pdfFrame = document.createElement('iframe');
        document.body.append(pdfFrame);
        const pdfPopup = pdfFrame.contentWindow;
        let pdfFilename = '';
        pdfPopup.desktopCardExport = { savePdf: async name => {
            pdfFilename = name;
            return { saved:true, filePath:'Student-Cards-7C.pdf' };
        }};
        pdfPopup.print = () => { throw new Error('Desktop PDF must not open the print dialog'); };
        window.open = () => pdfPopup;
        const pdfStudent = { ...student, photo:source };
        printWindow('Card test', () => StudentCardTemplate.render([pdfStudent], {}, 'assets/moeys-logo.png', '២០២៥-២០២៦'),
            [pdfStudent], null, { downloadPdf:true, pdfFilename:'Student-Cards-7C' });
        for (let i = 0; i < 100 && !pdfFilename; i++) await new Promise(resolve => setTimeout(resolve, 20));
        return { photoRepairRan:true, openedBeforePhoto, popupOpenCount, leftBlue:cornerIsBlue(4), rightBlue:cornerIsBlue(295),
            printCalled, printButtonEnabled:!iframe.contentDocument.getElementById('print-now-btn').disabled, previewOnFailure,
            pdfFilename };
    })()`);
    console.log(JSON.stringify(result));
    win.destroy();
    if (!result.photoRepairRan || !result.openedBeforePhoto || result.popupOpenCount !== 1 || result.leftBlue || result.rightBlue || !result.printCalled || !result.printButtonEnabled || !result.previewOnFailure || result.pdfFilename !== 'Student-Cards-7C') throw new Error('Card popup framing/PDF validation failed');
    app.quit();
}).catch(error => { console.error(error); app.exit(1); });
