// Exercise the production photo composer with a transparent full-body sample.
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const suppliedPhotoPath = process.argv[2];
const suppliedPhoto = suppliedPhotoPath ? 'data:image/' + (/\.jpe?g$/i.test(suppliedPhotoPath) ? 'jpeg' : 'png') + ';base64,' + fs.readFileSync(path.resolve(suppliedPhotoPath)).toString('base64') : null;
const start = html.indexOf('    function drawSkyBackground(');
const end = html.indexOf('    async function processPhoto(', start);
if (start < 0 || end < 0) throw new Error('Production photo composer not found');
const composer = html.slice(start, end);
const outputDir = path.join(root, 'dist', 'photo-review');
app.setPath('userData', path.join(outputDir, 'chromium-profile'));
app.disableHardwareAcceleration();

app.whenReady().then(async () => {
    fs.mkdirSync(outputDir, { recursive:true });
    const win = new BrowserWindow({ show:false, width:300, height:400, webPreferences:{ offscreen:true } });
    await win.loadURL('about:blank');
    const metrics = await win.webContents.executeJavaScript(`(async () => {
        const STUDENT_PHOTO_WIDTH = 300;
        const STUDENT_PHOTO_HEIGHT = 400;
        const STUDENT_PHOTO_BLUE = '#1999fe';
        ${composer}
        const source = document.createElement('canvas');
        source.width = 315; source.height = 700;
        const sourceCtx = source.getContext('2d');
        sourceCtx.fillStyle = '#492f26';
        sourceCtx.beginPath(); sourceCtx.ellipse(157, 130, 48, 58, 0, 0, 2*Math.PI); sourceCtx.fill();
        sourceCtx.fillStyle = '#f0f3f7';
        sourceCtx.fillRect(48, 220, 218, 430);
        const input = new Image(); input.src = source.toDataURL('image/png'); await input.decode();
        const output = new Image(); output.src = composeStudentPhoto(input, true); await output.decode();
        const readyPortraitRecognized = isReferenceBluePortrait(output);
        const unprocessedPhotoRejected = !isReferenceBluePortrait(input);
        let suppliedReferenceRecognized = null;
        let suppliedPreparedLength = null;
        if (${suppliedPhoto ? 'true' : 'false'}) {
            const reference = new Image();
            reference.src = ${suppliedPhoto ? JSON.stringify(suppliedPhoto) : 'null'};
            await reference.decode();
            suppliedReferenceRecognized = isReferenceBluePortrait(reference);
            suppliedPreparedLength = composeStudentPhoto(reference, false).length;
        }
        const photo = document.createElement('canvas'); photo.width = 300; photo.height = 400;
        photo.getContext('2d').drawImage(output, 0, 0);
        document.body.style.margin = '0'; document.body.append(photo);
        const context = photo.getContext('2d');
        const top = context.getImageData(150, 12, 1, 1).data;
        const bottom = context.getImageData(150, 392, 1, 1).data;
        const bottomLeft = context.getImageData(4, 392, 1, 1).data;
        const bottomRight = context.getImageData(295, 392, 1, 1).data;
        const blueAbove = top[2] > top[1] + 35;
        const referenceBlue = Math.abs(top[0]-25)<12 && Math.abs(top[1]-153)<12 && Math.abs(top[2]-254)<12;
        const shirtAtBottom = bottom[0] > 185 && bottom[1] > 185 && bottom[2] > 185;
        const shirtAtBottomEdges = [bottomLeft, bottomRight].every(pixel => pixel[0] > 185 && pixel[1] > 185 && pixel[2] > 185);
        const narrow = document.createElement('canvas'); narrow.width = 300; narrow.height = 600;
        const narrowCtx = narrow.getContext('2d');
        narrowCtx.fillStyle = '#453126';
        narrowCtx.beginPath(); narrowCtx.ellipse(150, 140, 48, 60, 0, 0, 2*Math.PI); narrowCtx.fill();
        narrowCtx.fillStyle = '#f0f3f7';
        narrowCtx.beginPath(); narrowCtx.moveTo(50, 240); narrowCtx.lineTo(250, 240);
        narrowCtx.lineTo(218, 590); narrowCtx.lineTo(82, 590); narrowCtx.closePath(); narrowCtx.fill();
        const narrowInput = new Image(); narrowInput.src = narrow.toDataURL('image/png'); await narrowInput.decode();
        const narrowOutput = new Image(); narrowOutput.src = composeStudentPhoto(narrowInput, true); await narrowOutput.decode();
        const narrowPhoto = document.createElement('canvas'); narrowPhoto.width = 300; narrowPhoto.height = 400;
        const narrowPhotoCtx = narrowPhoto.getContext('2d'); narrowPhotoCtx.drawImage(narrowOutput, 0, 0);
        const narrowBottomFilled = [4, 150, 295].every(x => {
            const pixel = narrowPhotoCtx.getImageData(x, 392, 1, 1).data;
            return pixel[0] > 185 && pixel[1] > 185 && pixel[2] > 185;
        });
        const stale = document.createElement('canvas'); stale.width = 300; stale.height = 400;
        const staleCtx = stale.getContext('2d');
        staleCtx.fillStyle = '#1999fe'; staleCtx.fillRect(0, 0, 300, 400);
        staleCtx.fillStyle = '#453126'; staleCtx.beginPath(); staleCtx.ellipse(150, 125, 50, 60, 0, 0, 2*Math.PI); staleCtx.fill();
        staleCtx.fillStyle = '#f0f3f7'; staleCtx.fillRect(65, 180, 170, 170);
        const staleInput = new Image(); staleInput.src = stale.toDataURL('image/png'); await staleInput.decode();
        const oldBluePortraitRecognized = isReferenceBluePortrait(staleInput);
        const repaired = new Image(); repaired.src = composeStudentPhoto(staleInput, false); await repaired.decode();
        const repairedCtx = stale.getContext('2d'); repairedCtx.clearRect(0, 0, 300, 400); repairedCtx.drawImage(repaired, 0, 0);
        const oldBlueBottomRepaired = [4, 150, 295].every(x => {
            const pixel = repairedCtx.getImageData(x, 392, 1, 1).data;
            return pixel[0] > 185 && pixel[1] > 185 && pixel[2] > 185;
        });
        return { blueAbove, referenceBlue, shirtAtBottom, shirtAtBottomEdges, narrowBottomFilled, oldBluePortraitRecognized, oldBlueBottomRepaired, readyPortraitRecognized, unprocessedPhotoRejected, suppliedReferenceRecognized, suppliedPreparedLength, jpegBytes:output.src.length, width:output.width, height:output.height, preview:photo.toDataURL('image/png'), narrowPreview:narrowPhoto.toDataURL('image/png') };
    })()`);
    fs.writeFileSync(path.join(outputDir, 'portrait-framing.png'), Buffer.from(metrics.preview.split(',')[1], 'base64'));
    fs.writeFileSync(path.join(outputDir, 'portrait-narrow-shoulders.png'), Buffer.from(metrics.narrowPreview.split(',')[1], 'base64'));
    delete metrics.preview;
    delete metrics.narrowPreview;
    console.log(JSON.stringify(metrics));
    win.destroy();
    if (!metrics.blueAbove || !metrics.referenceBlue || !metrics.shirtAtBottom || !metrics.shirtAtBottomEdges || !metrics.narrowBottomFilled || !metrics.oldBluePortraitRecognized || !metrics.oldBlueBottomRepaired || !metrics.readyPortraitRecognized || !metrics.unprocessedPhotoRejected || (suppliedPhoto && (!metrics.suppliedReferenceRecognized || metrics.suppliedPreparedLength > 49000)) || metrics.jpegBytes > 49000 || metrics.width !== 300 || metrics.height !== 400) {
        throw new Error('Photo composition validation failed');
    }
    app.quit();
}).catch(error => { console.error(error); app.exit(1); });
