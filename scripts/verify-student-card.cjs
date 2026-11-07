// Render the real card template in Chromium, isolated from saved student records.
// Usage: electron scripts/verify-student-card.cjs [output directory]
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const out = path.resolve(process.argv[2] || path.join(root, 'dist', 'card-review'));
const suppliedPhotoPath = process.argv[3];
const suppliedPhoto = suppliedPhotoPath ? 'data:image/' + (/\.jpe?g$/i.test(suppliedPhotoPath) ? 'jpeg' : 'png') + ';base64,' + fs.readFileSync(path.resolve(suppliedPhotoPath)).toString('base64') : null;
const exampleCardScreenshot = process.argv[4] ? 'data:image/png;base64,' + fs.readFileSync(path.resolve(process.argv[4])).toString('base64') : null;
app.setPath('userData', path.join(out, 'chromium-profile'));
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('force-device-scale-factor', '2');
app.whenReady().then(async () => {
    fs.mkdirSync(out, { recursive:true });
    const win = new BrowserWindow({ show:false, width:1600, height:1600, webPreferences:{ offscreen:true } });
    await win.loadURL('about:blank');
    await win.webContents.executeJavaScript(fs.readFileSync(path.join(root, 'assets/student-card.js'), 'utf8'));
    const logo = 'data:image/png;base64,' + fs.readFileSync(path.join(root, 'assets/moeys-logo.png')).toString('base64');
    const schoolEmblem = 'data:image/png;base64,' + fs.readFileSync(path.join(root, 'assets/school-emblem.png')).toString('base64');
    const student = {
        studentName:'លុយ ស្រីនីត', gender:'ស្រី', dob:'2012-10-05', className:'7C', studentCode:'ID-2607081',
        pobVillage:'ភូមិព្រៃមេលងខាងត្បូង', pobCommune:'ឃុំព្រៃខ្លា', pobDistrict:'ស្រុកកោះអណ្តែត', pobProvince:'ខេត្តតាកែវ',
        fatherName:'សុខ សំណាង', motherName:'គង់ សុភី', fatherPhone:'012 345 678', motherPhone:'098 765 432'
    };
    for (const part of ['Village','Commune','District','Province']) student['current'+part] = student['pob'+part];
    const settings = { principalPhone:'092 30 59 01', ictPhone:'099 42 92 41', issueDate:'2026-08-05', principalName:'សុខ សុវណ្ណ' };
    await win.webContents.executeJavaScript(`
        const oldPhoto = document.createElement('canvas');
        oldPhoto.width = 315; oldPhoto.height = 400;
        const oldPhotoContext = oldPhoto.getContext('2d');
        oldPhotoContext.fillStyle = '#3b86ee'; oldPhotoContext.fillRect(0, 0, 315, 400);
        oldPhotoContext.fillStyle = '#33251f'; oldPhotoContext.beginPath(); oldPhotoContext.arc(157, 95, 52, 0, Math.PI * 2); oldPhotoContext.fill();
        oldPhotoContext.fillStyle = '#f0f3f7';
        oldPhotoContext.beginPath();
        oldPhotoContext.moveTo(35, 150); oldPhotoContext.lineTo(280, 150);
        oldPhotoContext.lineTo(272, 399); oldPhotoContext.lineTo(43, 399);
        oldPhotoContext.closePath(); oldPhotoContext.fill();
        const studentWithPhoto = { ...${JSON.stringify(student)}, photo:${suppliedPhoto ? JSON.stringify(suppliedPhoto) : "oldPhoto.toDataURL('image/png')"} };
        document.body.innerHTML = StudentCardTemplate.render([studentWithPhoto], ${JSON.stringify(settings)}, ${JSON.stringify(logo)}, '២០២៥-២០២៦', ${JSON.stringify(schoolEmblem)});
        document.body.style.margin='0';
        document.querySelector('.cards-grid').style.justifyContent='start';
        document.querySelector('.cards-grid').style.gridTemplateColumns='95mm';
    `);
    await win.webContents.executeJavaScript('document.fonts.ready');
    await win.webContents.executeJavaScript('Promise.all(Array.from(document.images, i => i.decode().catch(() => {})))');
    await win.webContents.executeJavaScript('StudentCardTemplate.fitText(document)');
    await win.webContents.executeJavaScript('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
    const metrics = await win.webContents.executeJavaScript(`(() => {
        const card = document.querySelector('.certificate-student-card').getBoundingClientRect();
        const overflow = [...document.querySelectorAll('[data-card-fit]')].filter(el => el.scrollWidth > el.clientWidth + 1).map(el => el.textContent);
        const photo = document.querySelector('[data-card-photo]');
        const slot = document.querySelector('.card-photo-slot').getBoundingClientRect();
        const photoBounds = photo.getBoundingClientRect();
        const frame = document.querySelector('.reference-photo-box').getBoundingClientRect();
        const photoPixels = document.createElement('canvas');
        photoPixels.width = 300; photoPixels.height = 400;
        const photoPixelsContext = photoPixels.getContext('2d');
        photoPixelsContext.drawImage(photo, 0, 0, 300, 400);
        const topPixel = photoPixelsContext.getImageData(150, 12, 1, 1).data;
        const bottomPixel = photoPixelsContext.getImageData(150, 392, 1, 1).data;
        const bottomLeftPixel = photoPixelsContext.getImageData(4, 392, 1, 1).data;
        const bottomRightPixel = photoPixelsContext.getImageData(295, 392, 1, 1).data;
        const blueAboveNotBelow = topPixel[2] > topPixel[1] + 35 && bottomPixel[0] > 185 && bottomPixel[1] > 185 && bottomPixel[2] > 185;
        const shirtAtBottomEdges = [bottomLeftPixel, bottomRightPixel].every(pixel => pixel[0] > 185 && pixel[1] > 185 && pixel[2] > 185);
        const blueMatchesReference = Math.abs(topPixel[0]-25)<12 && Math.abs(topPixel[1]-153)<12 && Math.abs(topPixel[2]-254)<12;
        const portraitFill = getComputedStyle(photo).objectFit==='fill' && slot.width / slot.height > .72 && slot.width / slot.height < .78;
        const probe = document.createElement('div');
        probe.style.cssText='position:fixed;left:-2000px;top:0';
        const fiveStudents = Array.from({length:5}, (_,i) => ({...${JSON.stringify(student)},studentName:'សិស្ស '+(i+1),studentCode:'STU-'+(i+1)}));
        probe.innerHTML = StudentCardTemplate.render(fiveStudents, ${JSON.stringify(settings)}, ${JSON.stringify(logo)}, '២០២៥-២០២៦');
        document.body.append(probe);
        const frontPages = [...probe.querySelectorAll('.card-front-page')];
        const backPages = [...probe.querySelectorAll('.card-back-page')];
        const frontFirst = frontPages[0], backFirst = backPages[0];
        const frontRect = frontFirst.getBoundingClientRect(), backRect = backFirst.getBoundingClientRect();
        const frontCards = [...frontFirst.querySelectorAll('.certificate-student-card')];
        const backCards = [...backFirst.querySelectorAll('.certificate-student-card-back')];
        const duplexPositionsMirror = frontCards.length === 4 && backCards.length === 4 && frontCards.every((el,i) => {
            const f=el.getBoundingClientRect(), b=backCards[i].getBoundingClientRect();
            return Math.abs((f.left-frontRect.left)-(backRect.right-b.right))<1 &&
                Math.abs((f.top-frontRect.top)-(b.top-backRect.top))<1;
        });
        const regulationsFit = [...probe.querySelectorAll('.certificate-student-card-back')].every(el => el.scrollHeight <= el.clientHeight + 1);
        const regulationCard = probe.querySelector('.certificate-student-card-back');
        const regulationContent = regulationCard.querySelector('.regulations-content').getBoundingClientRect();
        const regulationCardRect = regulationCard.getBoundingClientRect();
        const watermark = regulationCard.querySelector('.regulations-watermark');
        const backWatermarkVisible = !!watermark && watermark.complete && watermark.naturalWidth > 0 && Number(getComputedStyle(watermark).opacity) > 0;
        const regulationsFillPanel = regulationContent.height >= regulationCardRect.height * .92;
        const ruleSections = [...regulationCard.querySelectorAll('.regulations-sections section')];
        const regulationHeadings = ruleSections.map(section => section.querySelector('h2').textContent.trim());
        const regulationCounts = ruleSections.map(section => section.querySelectorAll('ol > li').length);
        const regulationBarColors = ruleSections.map(section => getComputedStyle(section.querySelector('h2')).backgroundColor);
        const rulesDoNotOverlap = ruleSections.every((section, index) => index === ruleSections.length - 1 || section.getBoundingClientRect().bottom + 1 < ruleSections[index + 1].getBoundingClientRect().top) &&
            ruleSections.at(-1).getBoundingClientRect().bottom < regulationCardRect.bottom - 2;
        const lastRule = ruleSections.at(-1).querySelector('li:last-child');
        const lastRuleFullyVisible = lastRule.getBoundingClientRect().bottom <= regulationCardRect.bottom - 4 &&
            lastRule.textContent.trim().endsWith('តាមបទបញ្ជាសាលា។');
        const a4PageSize = Math.abs(frontRect.width - 194*96/25.4)<1 && Math.abs(frontRect.height - 281*96/25.4)<1;
        const fourPerSheet = frontPages.length===2 && backPages.length===2 &&
            [...frontPages,...backPages].every(page => page.querySelectorAll('.certificate-student-card').length<=4);
        const frontCard = document.querySelector('.certificate-student-card:not(.certificate-student-card-back)');
        return { width:card.width, height:card.height, overflow, teacherVisible:frontCard?.innerText.includes('គ្រូបន្ទុកថ្នាក់'), fonts:document.fonts.check('18px "Khmer OS Siemreap"'), photoReframed:photo?.src.startsWith('data:image/jpeg'), photoFillsSlot:Math.abs(photoBounds.height-slot.height)<1 && Math.abs(photoBounds.width-slot.width)<1, portraitFill, photoAspect:slot.width/slot.height, objectFit:getComputedStyle(photo).objectFit, blueAboveNotBelow, shirtAtBottomEdges, bottomEdgePixels:[...bottomLeftPixel.slice(0,3),...bottomRightPixel.slice(0,3)], blueMatchesReference, frameHeight:frame.height, fourPerSheet, a4PageSize, duplexPositionsMirror, regulationsFit, regulationsFillPanel, rulesDoNotOverlap, lastRuleFullyVisible, regulationHeadings, regulationCounts, regulationBarColors, regulationContentHeight:regulationContent.height, regulationCardHeight:regulationCardRect.height, backWatermarkVisible };
    })()`);
    const shot = await win.webContents.capturePage({ x:0,y:0,width:Math.ceil(metrics.width),height:Math.ceil(metrics.height) });
    fs.writeFileSync(path.join(out, 'student-card-95x120.png'), shot.toPNG());
    const actualBackRect = await win.webContents.executeJavaScript(`(() => {const r=document.querySelector('.certificate-student-card-back').getBoundingClientRect();return {x:Math.floor(r.x),y:Math.floor(r.y),width:Math.ceil(r.width),height:Math.ceil(r.height)}})()`);
    win.webContents.debugger.attach('1.3');
    const actualBackShot = await win.webContents.debugger.sendCommand('Page.captureScreenshot', { format:'png', captureBeyondViewport:true, clip:{...actualBackRect,scale:2} });
    fs.writeFileSync(path.join(out, 'student-card-back-95x120.png'), Buffer.from(actualBackShot.data, 'base64'));
    win.webContents.debugger.detach();
    // Reference-sized review makes placement comparison with the user's screenshot easy.
    await win.webContents.executeJavaScript(`
        const style=document.createElement('style');
        style.textContent='.certificate-student-card{width:590px;height:614px;border:3px solid #1717ff}.reference-artwork{transform:none}.cards-grid{grid-template-columns:590px!important}';
        document.body.append(style);
    `);
    await win.webContents.executeJavaScript('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
    win.webContents.debugger.attach('1.3');
    const referenceShot = await win.webContents.debugger.sendCommand('Page.captureScreenshot', {
        format:'png', captureBeyondViewport:true, clip:{ x:0,y:0,width:590,height:614,scale:1 }
    });
    fs.writeFileSync(path.join(out, 'student-card-reference-review.png'), Buffer.from(referenceShot.data, 'base64'));
    const regulationRect = await win.webContents.executeJavaScript(`(() => {const r=document.querySelector('.certificate-student-card-back').getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}})()`);
    const regulationShot = await win.webContents.debugger.sendCommand('Page.captureScreenshot', { format:'png', captureBeyondViewport:true, clip:{...regulationRect,scale:1} });
    fs.writeFileSync(path.join(out, 'student-card-back-review.png'), Buffer.from(regulationShot.data, 'base64'));
    win.webContents.debugger.detach();
    metrics.alreadyFramedBlueSidesFixed = await win.webContents.executeJavaScript(`(async () => {
        const stale = document.createElement('canvas'); stale.width = 315; stale.height = 400;
        const ctx = stale.getContext('2d');
        ctx.fillStyle = '#1999fe'; ctx.fillRect(0, 0, 315, 400);
        ctx.fillStyle = '#33251f'; ctx.beginPath(); ctx.arc(157, 80, 52, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#f0f3f7'; ctx.fillRect(35, 190, 245, 210);
        const img = document.querySelector('[data-card-photo]');
        img.src = stale.toDataURL('image/png'); await img.decode();
        await StudentCardTemplate.fitText(document);
        const output = document.createElement('canvas'); output.width = 300; output.height = 400;
        const outputCtx = output.getContext('2d'); outputCtx.drawImage(img, 0, 0, 300, 400);
        return [4, 150, 295].every(x => {
            const pixel = outputCtx.getImageData(x, 392, 1, 1).data;
            return pixel[0] > 185 && pixel[1] > 185 && pixel[2] > 185;
        });
    })()`);
    if (exampleCardScreenshot) {
        metrics.suppliedScreenshot = await win.webContents.executeJavaScript(`(async () => {
            const screenshot = new Image();
            screenshot.src = ${JSON.stringify(exampleCardScreenshot)};
            await screenshot.decode();
            const photoCanvas = document.createElement('canvas'); photoCanvas.width = 300; photoCanvas.height = 400;
            const ctx = photoCanvas.getContext('2d');
            ctx.drawImage(screenshot, 30, 390, 456, 610, 0, 0, 300, 400);
            const blueAtCorner = () => {
                const pixel = ctx.getImageData(5, 392, 1, 1).data;
                return pixel[2] > pixel[0] + 120;
            };
            const beforeBlue = blueAtCorner();
            const img = document.querySelector('[data-card-photo]');
            img.src = photoCanvas.toDataURL('image/png'); await img.decode();
            await StudentCardTemplate.fitText(document);
            ctx.clearRect(0, 0, 300, 400); ctx.drawImage(img, 0, 0, 300, 400);
            return { beforeBlue, afterBlue:blueAtCorner(), reframed:img.src.startsWith('data:image/jpeg') };
        })()`);
    }
    fs.writeFileSync(path.join(out, 'metrics.json'), JSON.stringify(metrics, null, 2));
    console.log(JSON.stringify(metrics));
    win.destroy();
    if (Math.abs(metrics.width - 95*96/25.4) > .1 || Math.abs(metrics.height - 120*96/25.4) > .1 || metrics.overflow.length || metrics.teacherVisible || (!suppliedPhoto && !metrics.photoReframed) || !metrics.photoFillsSlot || !metrics.portraitFill || !metrics.blueAboveNotBelow || !metrics.shirtAtBottomEdges || !metrics.alreadyFramedBlueSidesFixed || (exampleCardScreenshot && (!metrics.suppliedScreenshot.beforeBlue || metrics.suppliedScreenshot.afterBlue || !metrics.suppliedScreenshot.reframed)) || !metrics.blueMatchesReference || !metrics.fourPerSheet || !metrics.a4PageSize || !metrics.duplexPositionsMirror || !metrics.regulationsFit || !metrics.regulationsFillPanel || !metrics.rulesDoNotOverlap || !metrics.lastRuleFullyVisible || !metrics.backWatermarkVisible || metrics.regulationCounts.join(',') !== '4,7,3' || metrics.regulationBarColors.join('|') !== 'rgb(32, 81, 125)|rgb(199, 0, 0)|rgb(138, 105, 0)' || metrics.frameHeight < 130 || metrics.frameHeight > 136) throw new Error('Card layout validation failed');
    app.quit();
}).catch(error => { console.error(error); app.exit(1); });
