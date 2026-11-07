/* Reference artwork coordinates, scaled only at the outer print boundary. */
(function () {
    const escape = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
    const khmer = value => String(value).replace(/\d/g, d => "០១២៣៤៥៦៧៨៩"[Number(d)]);
    const months = ["មករា","កុម្ភៈ","មីនា","មេសា","ឧសភា","មិថុនា","កក្កដា","សីហា","កញ្ញា","តុលា","វិច្ឆិកា","ធ្នូ"];
    function birthDate(value) {
        const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
        return match && Number(match[2]) >= 1 && Number(match[2]) <= 12
            ? `${khmer(Number(match[3]))}-${months[Number(match[2])-1]}-${khmer(match[1])}` : value || "";
    }
    function address(student, prefix) {
        return ["Village","Commune","District","Province"].map(part => student[prefix + part]).filter(Boolean).join(" ");
    }
    const blank = "........................";
    function render(students, settings, logoUrl, academicYear, schoolEmblemUrl = logoUrl) {
        const date = /^(\d{4})-(\d{2})-(\d{2})$/.exec(settings.issueDate || "");
        const artworkScaleX = 94.24 * 96 / 25.4 / 584;
        const artworkScaleY = 119.24 * 96 / 25.4 / 608;
        const dateDay = date ? khmer(Number(date[3])) : "................";
        const dateMonth = date ? khmer(Number(date[2])) : "................";
        const dateYear = date ? khmer(date[1]) : "................";
        const cardMarkup = students.map(s => `<article class="certificate-student-card" aria-label="កាតសិស្ស ${escape(s.studentName)}">
          <div class="reference-artwork">
            <img class="card-watermark" src="${escape(logoUrl)}" alt="">
            <img class="card-logo" src="${escape(logoUrl)}" alt="ក្រសួងអប់រំ យុវជន និងកីឡា">
            <div class="card-school-heading">
              <div>ក្រសួងអប់រំ យុវជន និងកីឡា</div>
              <div>មន្ទីរអប់រំ យុវជន និងកីឡាខេត្តតាកែវ</div>
              <div>វិទ្យាល័យសុខអានព្រៃមេលង</div>
            </div>
            <div class="card-kingdom"><div>ព្រះរាជាណាចក្រកម្ពុជា</div><div>ជាតិ សាសនា ព្រះមហាក្សត្រ</div>
              <svg class="kingdom-ornament" viewBox="0 0 170 12" aria-hidden="true"><path d="M4 6h162M45 4h80M45 8h80"/><path d="m63 6 5-3 5 3-5 3Zm12 0 5-4 5 4-5 4Zm12 0 5-4 5 4-5 4Zm12 0 5-3 5 3-5 3Z"/></svg>
            </div>
            <div class="reference-card-title" data-card-fit>ប័ណ្ណសម្គាល់ខ្លួនសិស្ស ឆ្នាំសិក្សា ${escape(academicYear)}</div>
            <div class="card-line identity-line"><span>គោត្តនាម និងនាម</span><strong data-card-fit>${escape(s.studentName || blank)}</strong><span>ភេទ</span><strong data-card-fit>${escape(s.gender || blank)}</strong></div>
            <div class="card-line birth-line"><span>ថ្ងៃខែឆ្នាំកំណើត</span><strong class="latin-value" data-card-fit>${escape(birthDate(s.dob) || blank)}</strong><span>ថ្នាក់ទី</span><strong class="latin-value" data-card-fit>${escape(s.className || blank)}</strong></div>
            <div class="card-line address-line birth-address"><span>ទីកន្លែងកំណើត</span><strong data-card-fit>${escape(address(s,"pob") || blank)}</strong></div>
            <div class="card-line address-line current-address"><span>អាសយដ្ឋានបច្ចុប្បន្ន</span><strong data-card-fit>${escape(address(s,"current") || blank)}</strong></div>
            <div class="card-line contacts-line"><span>លេខទូរសព្ទនាយក</span><strong class="latin-value" data-card-fit>${escape(settings.principalPhone || blank)}</strong><span>លេខទូរសព្ទ ICT</span><strong class="latin-value" data-card-fit>${escape(settings.ictPhone || blank)}</strong></div>
            <div class="reference-photo-box"><div class="card-id-code" data-card-fit>${escape(s.studentCode || s.studentId || "")}</div><div class="card-photo-slot">${s.photo ? `<img src="${escape(s.photo)}" alt="រូបថតសិស្ស" data-card-photo>` : "<span>3X4</span>"}</div></div>
            <div class="family-line father-line"><strong data-card-fit>ឪពុក៖ ${escape(s.fatherName || blank)}</strong><span>លេខទូរសព្ទ៖</span><strong class="latin-value" data-card-fit>${escape(s.fatherPhone || blank)}</strong></div>
            <div class="family-line mother-line"><strong data-card-fit>ម្តាយ៖ ${escape(s.motherName || blank)}</strong><span>លេខទូរសព្ទ៖</span><strong class="latin-value" data-card-fit>${escape(s.motherPhone || blank)}</strong></div>
            <div class="reference-lunar-date" data-card-fit><span>${escape(settings.cardLunarDate || "....................ខែ....................ឆ្នាំ....................ព.ស............")}</span></div>
            <div class="reference-solar-date">ថ្ងៃទី<span>${dateDay}</span>ខែ<span>${dateMonth}</span>ឆ្នាំ${dateYear}<span>............</span></div>
            <div class="reference-principal"><div>នាយក</div>${settings.principalName ? `<strong data-card-fit>${escape(settings.principalName)}</strong>` : ""}</div>
          </div>
        </article>`);
        const pages = [];
        for (let start = 0; start < cardMarkup.length; start += 4) {
            const front = cardMarkup.slice(start, start + 4);
            const backs = students.slice(start, start + 4).map((student, offset) => {
                const physicalIndex = start + offset;
                const mirroredColumn = physicalIndex % 2 === 0 ? 2 : 1;
                const row = Math.floor((physicalIndex % 4) / 2) + 1;
                return `<article class="certificate-student-card certificate-student-card-back" style="grid-column:${mirroredColumn};grid-row:${row}" aria-label="បទបញ្ជាផ្ទៃក្នុងសម្រាប់កាត ${escape(student.studentName)}">
                  <img class="regulations-watermark" src="${escape(schoolEmblemUrl)}" alt="">
                  <div class="regulations-content">
                    <header class="regulations-heading">បទបញ្ជាផ្ទៃក្នុងសាលា</header>
                    <div class="regulations-school-name">វិទ្យាល័យសុខអានព្រៃមេលង</div>
                    <div class="regulations-sections">
                    <section class="regulations-do"><h2>ផ្នែកទី១៖ ត្រូវធ្វើ</h2><ol>
                      <li>មកសាលាមុន ១៥ នាទី ដើម្បីគោរពទង់ជាតិ និងចូលរៀនទាន់ពេល។</li>
                      <li>ខិតខំរៀន និងអនុវត្តបទបញ្ជាសាលា។</li>
                      <li>និយាយសមរម្យ គោរពគ្រូ បុគ្គលិក និងមិត្តភក្ដិ។</li>
                      <li>រក្សាសាមគ្គីភាព ជួយគ្នា និងថែទ្រព្យសម្បត្តិសាលា។</li>
                    </ol></section>
                    <section class="regulations-dont"><h2>ផ្នែកទី២៖ មិនត្រូវធ្វើ</h2><ol>
                      <li>មិនអវត្តមានដោយគ្មានដំណឹង ឬការអនុញ្ញាតពីប្រធានថ្នាក់។</li>
                      <li>មិនប្រើទូរសព្ទក្នុងម៉ោងរៀន លើកលែងគ្រូអនុញ្ញាត។</li>
                      <li>មិនជេរប្រមាថ បៀតបៀន លេងល្បែងស៊ីសង ឬប្រព្រឹត្តអសីលធម៌។</li>
                      <li>មិននាំគ្រឿងអលង្ការថ្លៃ ឬវត្ថុគ្រោះថ្នាក់មកសាលា។</li>
                      <li>មិនបំផ្លាញសម្ភារៈ ឬសរសេរលើតុ និងជញ្ជាំង។</li>
                      <li>ហាមបារី បារីអេឡិចត្រូនិក (Vape) គ្រឿងស្រវឹង គ្រឿងញៀន អាវុធ និងគ្រឿងផ្ទុះ។</li>
                      <li>មិនបង្ហោះ ឬចែកចាយរូបភាពខុសសីលធម៌ដែលប៉ះពាល់កិត្តិយសសាលា។</li>
                    </ol></section>
                    <section class="regulations-discipline"><h2>ផ្នែកទី៣៖ វិធានការវិន័យ</h2><ol>
                      <li><strong>កម្រិតទី១៖</strong> អប់រំណែនាំ និងព្រមានផ្ទាល់មាត់។</li>
                      <li><strong>កម្រិតទី២៖</strong> កត់ត្រាកំហុស អញ្ជើញអាណាព្យាបាល និងធ្វើកិច្ចសន្យា។</li>
                      <li><strong>កម្រិតទី៣៖</strong> ផ្អាកការសិក្សាបណ្ដោះអាសន្ន ឬបញ្ជូនទៅគណៈគ្រប់គ្រងសាលា ឬអាជ្ញាធរ តាមបទបញ្ជាសាលា។</li>
                    </ol></section>
                    </div>
                  </div>
                </article>`;
            });
            pages.push(`<section class="cards-grid card-front-page" aria-label="កាតសិស្ស ខាងមុខ">${front.join("")}</section>`);
            pages.push(`<section class="cards-grid card-back-page" aria-label="កាតសិស្ស ខាងក្រោយ">${backs.join("")}</section>`);
        }
        return `<style>
          @page { size:A4 portrait; margin:8mm; }
          body { background:#fff; }
          .cards-grid { box-sizing:border-box; width:194mm; height:281mm; display:grid; grid-template-columns:repeat(2,95mm); grid-template-rows:repeat(2,120mm); gap:4mm 2mm; justify-content:center; align-content:center; break-after:page; page-break-after:always; }
          .cards-grid.card-back-page { direction:ltr; }
          .cards-grid:last-child { break-after:auto; page-break-after:auto; }
          .certificate-student-card { position:relative; width:95mm; height:120mm; border:.38mm solid #1717ff; background:#fff; box-sizing:border-box; overflow:hidden; break-inside:avoid; page-break-inside:avoid; print-color-adjust:exact; -webkit-print-color-adjust:exact; }
          .certificate-student-card-back { border-color:transparent; padding:3mm 3.5mm; display:flex; isolation:isolate; color:#111; font:11px/1.55 "Khmer OS Siemreap","Siemreap",sans-serif; }
          .regulations-watermark { position:absolute; z-index:0; width:78mm; height:78mm; left:50%; top:52%; transform:translate(-50%,-50%); object-fit:contain; opacity:.075; pointer-events:none; }
          .regulations-content { position:relative; z-index:1; flex:1; min-height:0; display:flex; flex-direction:column; }
          .regulations-heading { color:#204e78; text-align:center; font:16px/1.4 "Khmer OS Muol Light","Khmer OS Moul","Moul",serif; }
          .regulations-school-name { margin:.3mm 0 1.5mm; text-align:center; color:#234c8c; font:11px/1.4 "Khmer OS Siemreap","Siemreap",sans-serif; font-weight:bold; }
          .regulations-sections { flex:1; display:flex; flex-direction:column; gap:2.5mm; }
          .regulations-sections section { margin:0; }
          .regulations-sections h2 { margin:0; padding:.5mm 1mm; color:#fff; font:700 11px/1.4 "Khmer OS Siemreap","Siemreap",sans-serif; }
          .regulations-do h2 { background:#20517d; }
          .regulations-dont h2 { background:#c70000; }
          .regulations-discipline h2 { background:#8a6900; }
          .regulations-sections ol { margin:1mm 0 0; padding-left:5mm; display:grid; gap:.4mm; }
          .regulations-sections li { padding-left:.25mm; font:11px/1.55 "Khmer OS Siemreap","Siemreap",sans-serif; }
          .regulations-sections li::marker { font-family:Arial,sans-serif; font-size:10px; }
          .reference-artwork { --card-body:"Khmer OS Siemreap","KhmerOSSiemreap","Siemreap",sans-serif; --card-heading:"Khmer OS Muol Light","Khmer OS Moul","Moul",serif; position:relative; width:584px; height:608px; transform-origin:top left; transform:scale(${artworkScaleX.toFixed(9)},${artworkScaleY.toFixed(9)}); color:#102932; font:18px/1.65 var(--card-body); }
          .reference-artwork * { box-sizing:border-box; }
          .reference-artwork strong { color:#1111ff; font-weight:400; }
          .card-watermark { position:absolute; left:78px; top:90px; width:410px; height:420px; object-fit:fill; opacity:.13; }
          .card-logo { position:absolute; left:96px; top:15px; width:54px; height:73px; object-fit:contain; }
          .card-school-heading { position:absolute; left:22px; top:86px; width:325px; font:16.5px/2.02 var(--card-heading); white-space:nowrap; }
          .card-kingdom { position:absolute; left:331px; top:15px; width:226px; text-align:center; font:16.5px/2.02 var(--card-heading); white-space:nowrap; }
          .kingdom-ornament { display:block; width:158px; height:12px; margin:13px auto 0; fill:none; stroke:#637b85; stroke-width:1; }
          .reference-card-title { position:absolute; left:24px; top:183px; width:536px; height:41px; text-align:center; font:20px/1.9 var(--card-heading); color:#b96900; white-space:nowrap; }
          .card-line { position:absolute; left:22px; width:542px; display:grid; align-items:center; column-gap:8px; min-height:32px; grid-template-columns:132px 188px 74px 124px; }
          .card-line > *, .family-line > * { min-width:0; white-space:nowrap; }
          .card-line strong { font-size:18px; }
          .identity-line { top:222px; }
          .birth-line { top:257px; }
          .identity-line > :last-child, .birth-line > :last-child { text-align:center; }
          .address-line { grid-template-columns:132px 402px; }
          .birth-address { top:291px; }
          .current-address { top:325px; }
          .contacts-line { top:359px; grid-template-columns:153px 120px 146px 99px; }
          .latin-value { font-family:Arial,sans-serif; font-size:16px !important; font-weight:700 !important; }
          .reference-photo-box { position:absolute; left:17px; top:388px; width:134px; height:180px; border:2px solid #5585ff; display:grid; grid-template-rows:33px minmax(0,1fr); }
          .card-id-code { border-bottom:2px solid #5585ff; color:#152932; text-align:center; font:bold 16px/31px "Times New Roman",serif; white-space:nowrap; }
          .card-photo-slot { position:relative; min-height:0; display:grid; place-items:center; overflow:hidden; background:#1999fe; color:#111; font:16px Arial,sans-serif; }
          /* The card artwork is scaled non-uniformly for print. Filling this slot
             slot compensates for that scale, so the final photo stays 3:4 and uncropped. */
          .card-photo-slot img { position:absolute; inset:0; display:block; width:100%; height:100%; object-fit:fill; }
          .family-line { position:absolute; left:163px; width:410px; display:grid; grid-template-columns:138px 126px 130px; column-gap:8px; align-items:center; min-height:32px; }
          .father-line { top:393px; }
          .mother-line { top:428px; }
          .reference-lunar-date { position:absolute; left:163px; top:462px; width:412px; white-space:nowrap; font-size:17px; text-align:center; }
          .reference-solar-date { position:absolute; left:236px; top:497px; width:339px; display:flex; white-space:nowrap; align-items:baseline; font-size:17px; }
          .reference-solar-date span { flex:1; text-align:center; border-bottom:1px dotted #263238; }
          .reference-principal { position:absolute; top:537px; left:274px; width:188px; text-align:center; font:18px/1.7 var(--card-heading); }
          .reference-principal strong { display:block; font:18px/1.7 var(--card-body); white-space:nowrap; }
          @media print { .cards-grid { gap:4mm 2mm; } }
        </style>${pages.join("")}`;
    }
    function photoBackgroundSample(ctx, width, height) {
        const size = Math.max(3, Math.round(Math.min(width, height) * 0.025));
        const image = ctx.getImageData(0, 0, width, Math.min(height, size)).data;
        let red = 0, green = 0, blue = 0, count = 0;
        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                for (const px of [x, width - 1 - x]) {
                    const offset = ((y * width + px) * 4);
                    red += image[offset]; green += image[offset + 1]; blue += image[offset + 2]; count++;
                }
            }
        }
        return { red:red / count, green:green / count, blue:blue / count };
    }

    async function reframeBluePhoto(img, doc) {
        const width = img.naturalWidth || img.width;
        const height = img.naturalHeight || img.height;
        if (!width || !height || !String(img.currentSrc || img.src).startsWith("data:image/")) return;
        const sourceCanvas = doc.createElement("canvas");
        sourceCanvas.width = width;
        sourceCanvas.height = height;
        const sourceCtx = sourceCanvas.getContext("2d", { willReadFrequently:true });
        sourceCtx.drawImage(img, 0, 0, width, height);
        const background = photoBackgroundSample(sourceCtx, width, height);
        // Only touch photos that were already composed on the app's blue ID background.
        if (!(background.blue > 175 && background.blue > background.green + 45 && background.green > background.red + 35)) return;

        const sourceImage = sourceCtx.getImageData(0, 0, width, height);
        const pixels = sourceImage.data;
        const rowHits = new Uint32Array(height);
        const columnHits = new Uint32Array(width);
        const threshold = 48 * 48;
        const targetBlue = { red:25, green:153, blue:254 };
        const recolor = Math.abs(background.red - targetBlue.red) > 8 ||
            Math.abs(background.green - targetBlue.green) > 8 ||
            Math.abs(background.blue - targetBlue.blue) > 8;
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const offset = ((y * width + x) * 4);
                const dr = pixels[offset] - background.red;
                const dg = pixels[offset + 1] - background.green;
                const db = pixels[offset + 2] - background.blue;
                const distanceSquared = (dr * dr) + (dg * dg) + (db * db);
                if (distanceSquared > threshold) {
                    rowHits[y]++;
                    columnHits[x]++;
                }
                if (recolor && distanceSquared < 80 * 80) {
                    const distance = Math.sqrt(distanceSquared);
                    const strength = distance <= 48 ? 1 : (80 - distance) / 32;
                    pixels[offset] += (targetBlue.red - background.red) * strength;
                    pixels[offset + 1] += (targetBlue.green - background.green) * strength;
                    pixels[offset + 2] += (targetBlue.blue - background.blue) * strength;
                }
            }
        }
        const rowMinimum = Math.max(3, Math.round(width * 0.012));
        const columnMinimum = Math.max(3, Math.round(height * 0.01));
        const minX = columnHits.findIndex(value => value >= columnMinimum);
        const minY = rowHits.findIndex(value => value >= rowMinimum);
        let maxX = -1, maxY = -1;
        for (let x = width - 1; x >= 0; x--) if (columnHits[x] >= columnMinimum) { maxX = x; break; }
        for (let y = height - 1; y >= 0; y--) if (rowHits[y] >= rowMinimum) { maxY = y; break; }
        if (minX < 0 || minY < 0 || maxX <= minX || maxY <= minY) return;

        // Leave well-framed portraits at their original size; recolor only their
        // blue background when they came from an older version of the app.
        const alreadyFramed = (maxY >= height * 0.985 && minY >= height * 0.04 && minY <= height * 0.20) ||
            (minY <= height * 0.035 && maxY >= height * 0.95);
        const lowerY = Math.min(height - 1, Math.floor(height * 0.965));
        let lowerLeft = -1, lowerRight = -1;
        for (let x = 0; x < width; x++) {
            const offset = ((lowerY * width + x) * 4);
            const dr = pixels[offset] - background.red;
            const dg = pixels[offset + 1] - background.green;
            const db = pixels[offset + 2] - background.blue;
            if ((dr * dr) + (dg * dg) + (db * db) > threshold) {
                if (lowerLeft < 0) lowerLeft = x;
                lowerRight = x;
            }
        }
        const lowerWidth = lowerRight - lowerLeft + 1;
        const needsSideCrop = lowerWidth > width * .50 &&
            (lowerLeft > width * .035 || lowerRight < width * .965);
        const needsBottomFill = maxY < height - 2;
        if (alreadyFramed && !recolor && !needsSideCrop && !needsBottomFill) return;
        if (recolor) sourceCtx.putImageData(sourceImage, 0, 0);
        if (alreadyFramed) {
            const output = doc.createElement("canvas");
            output.width = 300;
            output.height = 400;
            const baseWidth = Math.min(width, height * .75);
            const baseHeight = baseWidth / .75;
        const sideZoom = needsSideCrop ? Math.min(1.35, Math.max(1.04, width * .99 / lowerWidth)) : 1;
        const verticalContentHeight = Math.max(1, maxY - minY + 1);
        const bottomZoom = needsBottomFill
            ? Math.min(1.35, height * .98 / verticalContentHeight)
            : 1;
        const zoom = Math.max(sideZoom, bottomZoom);
            const cropWidth = baseWidth / zoom;
            const cropHeight = baseHeight / zoom;
            const subjectCenter = needsSideCrop ? (lowerLeft + lowerRight) / 2 : width / 2;
            const cropX = Math.max(0, Math.min(width - cropWidth, subjectCenter - cropWidth / 2));
        const cropY = Math.max(0, Math.min(height - cropHeight, minY - cropHeight * .11));
            const outputCtx = output.getContext("2d");
            outputCtx.drawImage(sourceCanvas, cropX, cropY, cropWidth, cropHeight, 0, 0, 300, 400);
            img.src = output.toDataURL("image/jpeg", .88);
            try { await img.decode(); } catch {}
            return;
        }
        const subjectWidth = maxX - minX + 1;
        const subjectHeight = maxY - minY + 1;
        const padX = Math.round(subjectWidth * 0.05);
        const padTop = Math.round(subjectHeight * 0.008);
        const padBottom = 0;
        const sx = Math.max(0, minX - padX);
        const sy = Math.max(0, minY - padTop);
        const sw = Math.min(width - sx, subjectWidth + (padX * 2));
        const sh = Math.min(height - sy, subjectHeight + padTop + padBottom);
        const output = doc.createElement("canvas");
        output.width = 300;
        output.height = 400;
        const ctx = output.getContext("2d");
        ctx.fillStyle = "#1999fe";
        ctx.fillRect(0, 0, output.width, output.height);
        const scale = Math.min((output.width * 1.10) / sw, (output.height * 0.99) / sh);
        const drawWidth = sw * scale;
        const drawHeight = sh * scale;
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        // Keep the shoulders at the lower edge; any unused blue background belongs above the head.
        ctx.drawImage(sourceCanvas, sx, sy, sw, sh, (output.width - drawWidth) / 2, output.height - drawHeight, drawWidth, drawHeight);
        img.src = output.toDataURL("image/jpeg", .88);
        try { await img.decode(); } catch {}
    }

    async function preparePhotos(doc) {
        await Promise.all(Array.from(doc.querySelectorAll("img[data-card-photo]"), img => reframeBluePhoto(img, doc)));
    }

    async function fitText(doc, { skipPhotos=false }={}) {
        doc.querySelectorAll("[data-card-fit], .card-line > span, .family-line > span").forEach(el => {
            // Fit long real student data without ellipses or truncating the record.
            const size = parseFloat(doc.defaultView.getComputedStyle(el).fontSize);
            let current = size;
            while (el.scrollWidth > el.clientWidth + 1 && current > 9) {
                current -= .25;
                el.style.setProperty("font-size", `${current}px`, "important");
            }
        });
        if (!skipPhotos) await preparePhotos(doc);
    }
    globalThis.StudentCardTemplate = Object.freeze({ render, fitText, preparePhotos });
})();
