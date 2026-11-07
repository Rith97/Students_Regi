const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'assets', 'student-export.js'), 'utf8');
const context = { window:{}, TextEncoder, Uint32Array, Uint8Array, DataView, Blob, fetch };
vm.runInNewContext(source, context);

function localZipEntries(bytes) {
    const entries = new Map();
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let offset = 0;
    while (offset + 30 <= bytes.length && view.getUint32(offset, true) === 0x04034b50) {
        const compressedSize = view.getUint32(offset + 18, true);
        const nameLength = view.getUint16(offset + 26, true);
        const extraLength = view.getUint16(offset + 28, true);
        const nameStart = offset + 30;
        const dataStart = nameStart + nameLength + extraLength;
        const name = new TextDecoder().decode(bytes.subarray(nameStart, nameStart + nameLength));
        entries.set(name, bytes.slice(dataStart, dataStart + compressedSize));
        offset = dataStart + compressedSize;
    }
    return entries;
}

(async () => {
    const image = 'data:image/png;base64,iVBORw0KGgo=';
    const students = [
        { name:'សុខ ស្រីនីត', photo:image },
        { name:'សុខ ស្រីនីត', photo:image },
        { name:'គ្មានរូប', photo:'' }
    ];
    const result = await context.window.StudentExport.photosZip(students, student => student.name);
    assert.equal(result.count, 2);
    assert.equal(result.skipped.length, 1);
    const bytes = new Uint8Array(await result.blob.arrayBuffer());
    const view = new DataView(bytes.buffer);
    assert.equal(view.getUint32(0, true), 0x04034b50);
    assert.equal(view.getUint16(6, true), 0x0800);
    const names = new TextDecoder().decode(bytes);
    assert.match(names, /សុខ ស្រីនីត\.png/);
    assert.match(names, /សុខ ស្រីនីត \(2\)\.png/);
    assert.equal(view.getUint32(bytes.length - 22, true), 0x06054b50);

    const workbook = context.window.StudentExport.styledWorkbook({
        title:'បញ្ជីសិស្ស',
        sheets:[{
            name:'ថ្នាក់ 7A',
            title:'បញ្ជីឈ្មោះសិស្សថ្នាក់ 7A',
            subtitle:'វិទ្យាល័យសុខអានព្រៃមេលង',
            meta:'សរុប ២ នាក់',
            columns:[
                { header:'ល.រ', width:6, type:'integer' },
                { header:'អត្តលេខ', width:16, type:'code', align:'center' },
                { header:'គោត្តនាម និងនាម', width:24 },
                { header:'ថ្ងៃខែឆ្នាំកំណើត', width:15, type:'date' }
            ],
            rows:[[1, '9022607001', 'សុខ ស្រីនីត', '2012-06-23'], [2, '9022607002', 'សុខ ដារ៉ា', '2011-12-05']]
        }, {
            name:'ថ្នាក់ 8B',
            title:'បញ្ជីឈ្មោះសិស្សថ្នាក់ 8B',
            subtitle:'វិទ្យាល័យសុខអានព្រៃមេលង',
            meta:'សរុប ១ នាក់',
            columns:[
                { header:'ល.រ', width:6, type:'integer' },
                { header:'អត្តលេខ', width:16, type:'code', align:'center' },
                { header:'គោត្តនាម និងនាម', width:24 },
                { header:'ថ្ងៃខែឆ្នាំកំណើត', width:15, type:'date' }
            ],
            rows:[[1, '9022508001', 'ចាន់ វិសាល', '2011-01-15']]
        }]
    });
    assert.equal(workbook.type, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    const workbookBytes = new Uint8Array(await workbook.arrayBuffer());
    if (process.env.SAVE_XLSX) {
        fs.mkdirSync(path.dirname(process.env.SAVE_XLSX), { recursive:true });
        fs.writeFileSync(process.env.SAVE_XLSX, workbookBytes);
    }
    const entries = localZipEntries(workbookBytes);
    for (const required of [
        '[Content_Types].xml', 'xl/workbook.xml', 'xl/styles.xml',
        'xl/worksheets/sheet1.xml', 'xl/worksheets/_rels/sheet1.xml.rels', 'xl/tables/table1.xml',
        'xl/worksheets/sheet2.xml', 'xl/worksheets/_rels/sheet2.xml.rels', 'xl/tables/table2.xml'
    ]) assert.ok(entries.has(required), `Missing ${required}`);
    const sheet = new TextDecoder().decode(entries.get('xl/worksheets/sheet1.xml'));
    const table = new TextDecoder().decode(entries.get('xl/tables/table1.xml'));
    const styles = new TextDecoder().decode(entries.get('xl/styles.xml'));
    assert.match(sheet, /state="frozen"/);
    assert.ok(sheet.indexOf('<sheetPr>') < sheet.indexOf('<dimension '), 'sheetPr must precede dimension for Excel');
    assert.match(sheet, /fitToPage="1"/);
    assert.match(sheet, /paperSize="9" orientation="landscape" fitToWidth="1"/);
    assert.match(sheet, /width="24" customWidth="1"/);
    assert.match(sheet, /សុខ ស្រីនីត/);
    assert.match(sheet, /<c r="D6" s="7"><v>\d+<\/v><\/c>/);
    assert.match(table, /<autoFilter ref="A5:D7"\/>/);
    assert.match(table, /showRowStripes="1"/);
    assert.match(styles, /formatCode="dd\/mm\/yyyy"/);
    assert.match(styles, /Khmer OS Siemreap/);
    assert.equal(new DataView(workbookBytes.buffer).getUint32(workbookBytes.length - 22, true), 0x06054b50);
    assert.notEqual(new DataView(workbookBytes.buffer).getUint16(12, true), 0, 'ZIP date must be valid for Microsoft Excel');
    console.log('Photo ZIP and styled Excel workbook exports passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
