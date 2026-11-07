// Produce a disposable two-sided A4 PDF from the production card template.
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'tmp', 'pdfs', 'card-print-test.pdf');
app.setPath('userData', path.join(root, 'tmp', 'pdfs', 'electron-profile'));
app.disableHardwareAcceleration();

app.whenReady().then(async () => {
    fs.mkdirSync(path.dirname(output), { recursive:true });
    const win = new BrowserWindow({ show:false, width:1200, height:1200, webPreferences:{ offscreen:true } });
    await win.loadURL('about:blank');
    await win.webContents.executeJavaScript(fs.readFileSync(path.join(root, 'assets', 'student-card.js'), 'utf8'));
    const logo = 'data:image/png;base64,' + fs.readFileSync(path.join(root, 'assets', 'moeys-logo.png')).toString('base64');
    const emblem = 'data:image/png;base64,' + fs.readFileSync(path.join(root, 'assets', 'school-emblem.png')).toString('base64');
    const students = Array.from({ length:4 }, (_, index) => ({
        studentName:`សិស្ស លេខ ${index + 1}`, studentCode:`STU-${index + 1}`,
        gender:'ស្រី', className:'7A', dob:'2012-10-05'
    }));
    await win.webContents.executeJavaScript(`
        document.body.innerHTML = StudentCardTemplate.render(${JSON.stringify(students)}, {}, ${JSON.stringify(logo)}, '២០២៥-២០២៦', ${JSON.stringify(emblem)});
        document.body.style.margin = '0';
        Promise.all(Array.from(document.images, image => image.decode().catch(() => {})))
            .then(() => document.fonts.ready)
            .then(() => StudentCardTemplate.fitText(document));
    `);
    await win.webContents.executeJavaScript('document.fonts.ready');
    await win.webContents.executeJavaScript('Promise.all(Array.from(document.images, image => image.decode().catch(() => {})))');
    await win.webContents.executeJavaScript('StudentCardTemplate.fitText(document)');
    const pdf = await win.webContents.printToPDF({
        pageSize:'A4', preferCSSPageSize:true, printBackground:true,
        margins:{ top:0, bottom:0, left:0, right:0 }
    });
    fs.writeFileSync(output, pdf);
    console.log(output);
    win.destroy();
    app.quit();
}).catch(error => { console.error(error); app.exit(1); });
