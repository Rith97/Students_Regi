const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const preload = path.join(root, 'desktop', 'preload.cjs');
app.setPath('userData', path.join(root, 'tmp', 'pdfs', 'bridge-profile'));
app.disableHardwareAcceleration();

app.whenReady().then(async () => {
    const parent = new BrowserWindow({
        show:false, webPreferences:{ preload, contextIsolation:true, nodeIntegration:false, sandbox:true }
    });
    parent.webContents.setWindowOpenHandler(({ url }) => url === 'about:blank'
        ? { action:'allow', overrideBrowserWindowOptions:{ show:false, webPreferences:{ preload, contextIsolation:true, nodeIntegration:false, sandbox:true } } }
        : { action:'deny' });
    ipcMain.handle('card:save-pdf', (_event, name) => ({ saved:true, name }));
    await parent.loadURL('about:blank');
    const childCreated = new Promise(resolve => parent.webContents.once('did-create-window', resolve));
    await parent.webContents.executeJavaScript("!!window.open('about:blank')");
    const child = await childCreated;
    await child.webContents.executeJavaScript('new Promise(resolve => setTimeout(resolve, 100))');
    const result = await child.webContents.executeJavaScript("window.desktopCardExport?.savePdf('Student-Cards-7A')");
    console.log(JSON.stringify(result));
    child.destroy();
    parent.destroy();
    if (!result?.saved || result.name !== 'Student-Cards-7A') throw new Error('Child-window PDF bridge failed');
    app.quit();
}).catch(error => { console.error(error); app.exit(1); });
