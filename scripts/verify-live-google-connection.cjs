// Diagnose the published Apps Script connection without retaining student records.
// Usage: electron scripts/verify-live-google-connection.cjs
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '..');
const headerOnly = process.argv.includes('--header-only');
const livePhone = process.argv.includes('--phone-live');
app.setPath('userData', path.join(root, 'dist', 'live-google-review', 'chromium-profile'));
app.disableHardwareAcceleration();

app.whenReady().then(async () => {
    const win = new BrowserWindow({
        show:false,
        width:livePhone ? 390 : 1280,
        height:livePhone ? 844 : 900,
        webPreferences:{ offscreen:true, partition:`temporary-live-${Date.now()}` }
    });
    const errors = [];
    if (headerOnly) {
        win.webContents.session.webRequest.onBeforeRequest(
            { urls:['https://script.google.com/*', 'https://script.googleusercontent.com/*'] },
            (_details, callback) => callback({ cancel:true })
        );
    }
    win.webContents.on('console-message', (details) => {
        if (details.level === 'error') {
            errors.push(String(details.message).replace(/https?:\/\/\S+/g, '[URL]').slice(0, 180));
        }
    });
    await win.loadURL(pathToFileURL(path.join(root, 'index.html')).href);
    const result = headerOnly ? { status:'header-only' } : await win.webContents.executeJavaScript(`(async () => {
        const started = Date.now();
        while (Date.now() - started < 70000) {
            const status = document.getElementById('connection-text')?.textContent || '';
            if (status === 'Google Sheet' || status.includes('មិនបានភ្ជាប់')) break;
            await new Promise(resolve => setTimeout(resolve, 250));
        }
        return {
            status:document.getElementById('connection-text')?.textContent || '',
            state:document.getElementById('connection-status')?.className || '',
            count:document.getElementById('total-students')?.textContent || '',
            elapsedSeconds:Math.round((Date.now() - started) / 1000),
            visibleError:document.querySelector('.toast')?.textContent?.trim().slice(0, 180) || ''
        };
    })()`);
    console.log(JSON.stringify({ ...result, errors:errors.slice(-4) }));
    const headerReview = {};
    win.webContents.debugger.attach('1.3');
    for (const [label, width, height] of [['desktop', 1900, 900], ['phone', 390, 844]]) {
        win.setSize(width, height);
        await win.webContents.executeJavaScript('new Promise(resolve => setTimeout(resolve, 300))');
        headerReview[label] = await win.webContents.executeJavaScript(`(() => {
            const header=document.querySelector('.topbar').getBoundingClientRect();
            const groups=[...document.querySelectorAll('.topbar .action-group')].map(el => el.getBoundingClientRect());
            return {
                width:Math.round(header.width),
                height:Math.round(header.height),
                groupRows:[...new Set(groups.map(rect => Math.round(rect.top)))],
                overflows:groups.some(rect => rect.right > header.right + 1),
                menuVisible:getComputedStyle(document.getElementById('mobile-menu-btn')).display !== 'none'
            };
        })()`);
        const preview = await win.webContents.debugger.sendCommand('Page.captureScreenshot', {
            format:'png', captureBeyondViewport:true,
            clip:{ x:0, y:0, width, height:Math.ceil(headerReview[label].height), scale:1 }
        });
        fs.mkdirSync(path.join(root, 'dist', 'live-google-review'), { recursive:true });
        fs.writeFileSync(path.join(root, 'dist', 'live-google-review', `${label}-header.png`), Buffer.from(preview.data, 'base64'));
    }
    win.webContents.debugger.detach();
    console.log(JSON.stringify({ headerReview }));
    win.destroy();
    app.quit();
}).catch(error => { console.error(error); app.exit(1); });
