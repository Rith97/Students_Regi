// Read-only Apps Script photo diagnostic. Reports counts/timing only, never student data.
const { app, BrowserWindow } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '..');
app.setPath('userData', path.join(root, 'dist', 'live-google-review', 'photo-diagnostic-profile'));
app.disableHardwareAcceleration();

app.whenReady().then(async () => {
    const win = new BrowserWindow({ show:false, webPreferences:{ partition:`photo-diagnostic-${Date.now()}` } });
    await win.loadURL(pathToFileURL(path.join(root, 'index.html')).href);
    const result = await win.webContents.executeJavaScript(`(async () => {
        const base = 'https://script.google.com/macros/s/AKfycbyc_1v8DBczUTac1CprLsj2Ae5uKt8In-XGpB6lXXmCZj7Mm-4OL1DPSJjNXsD-G2GK/exec';
        const jsonp = params => new Promise((resolve, reject) => {
            const callback = 'photoDiagnostic_' + Math.random().toString(36).slice(2);
            const script = document.createElement('script');
            const timer = setTimeout(() => { cleanup(); reject(new Error('timeout')); }, 60000);
            function cleanup() { clearTimeout(timer); script.remove(); delete window[callback]; }
            window[callback] = data => { cleanup(); resolve(data); };
            script.onerror = () => { cleanup(); reject(new Error('script error')); };
            const url = new URL(base);
            Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
            url.searchParams.set('callback', callback);
            script.src = url.href;
            document.head.append(script);
        });
        const listStarted = performance.now();
        const page = await jsonp({action:'listpage', offset:0, limit:64, includePhotos:0});
        if (!page.ok) throw new Error(page.error || 'listpage failed');
        const keys = [...new Set(page.students.slice(0, 12).flatMap(student =>
            [student.id, student.studentCode].filter(Boolean)))];
        const photoStarted = performance.now();
        const photos = await jsonp({action:'photos', studentIds:keys.join(',')});
        if (!photos.ok) throw new Error(photos.error || 'photos failed');
        return {
            total:page.total,
            requestedKeys:keys.length,
            received:photos.students.length,
            withPhoto:photos.students.filter(student => Boolean(student.photo)).length,
            listMs:Math.round(photoStarted - listStarted),
            photoMs:Math.round(performance.now() - photoStarted)
        };
    })()`);
    console.log(JSON.stringify(result));
    win.destroy();
    app.quit();
}).catch(error => { console.error(error.message); app.exit(1); });
