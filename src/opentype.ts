import inflate from '@kuake/tiny-inflate';
import Font from './font';
import Glyph from './glyph';
import { CmapEncoding, GlyphNames, addGlyphNames } from './encoding';
import _parse from './parse';
import BoundingBox from './bbox';
import Path from './path';
import cpal from './tables/cpal';
import colr from './tables/colr';
import cmap from './tables/cmap';
import cff from './tables/cff';
import stat from './tables/stat';
import fvar from './tables/fvar';
import gvar from './tables/gvar';
import cvar from './tables/cvar';
import avar from './tables/avar';
import hvar from './tables/hvar';
import glyf from './tables/glyf';
import gdef from './tables/gdef';
import gpos from './tables/gpos';
import gsub from './tables/gsub';
import head from './tables/head';
import hhea from './tables/hhea';
import hmtx from './tables/hmtx';
import kern from './tables/kern';
import ltag from './tables/ltag';
import loca from './tables/loca';
import maxp from './tables/maxp';
import _name from './tables/name';
import os2 from './tables/os2';
import post from './tables/post';
import meta from './tables/meta';
import gasp from './tables/gasp';
import svg from './tables/svg';
import { isGzip, unGzip } from './util';

function parseOpenTypeTableEntries(data: DataView, numTables: number) {
    const tableEntries = [];
    let p = 12;
    for (let i = 0; i < numTables; i += 1) {
        const tag = _parse.getTag(data, p);
        const checksum = _parse.getULong(data, p + 4);
        const offset = _parse.getULong(data, p + 8);
        const length = _parse.getULong(data, p + 12);
        tableEntries.push({ tag: tag, checksum: checksum, offset: offset, length: length, compression: false });
        p += 16;
    }

    return tableEntries;
}

function parseWOFFTableEntries(data: DataView, numTables: number) {
    const tableEntries = [];
    let p = 44; // offset to the first table directory entry.
    for (let i = 0; i < numTables; i += 1) {
        const tag = _parse.getTag(data, p);
        const offset = _parse.getULong(data, p + 4);
        const compLength = _parse.getULong(data, p + 8);
        const origLength = _parse.getULong(data, p + 12);
        let compression: any;
        if (compLength < origLength) {
            compression = 'WOFF';
        } else {
            compression = false;
        }

        tableEntries.push({
            tag: tag, offset: offset, compression: compression,
            compressedLength: compLength, length: origLength
        });
        p += 20;
    }

    return tableEntries;
}

function uncompressTable(data: Uint8Array, entry: any): DataView {
    if (entry.compression === 'WOFF') {
        const inBuffer = data.subarray(entry.offset + 2, entry.offset + entry.compressedLength);
        const outBuffer = new Uint8Array(entry.length);
        inflate(inBuffer, outBuffer);
        if (outBuffer.byteLength !== entry.length) {
            throw new Error("Decompression error: " + entry.tag + " decompressed length doesn't match");
        }
        return new DataView(outBuffer.buffer, 0, outBuffer.byteLength);
    } else {
        const sub = data.subarray(entry.offset, entry.offset + entry.length);
        return new DataView(sub.buffer, sub.byteOffset, sub.byteLength);
    }
}

function parseFont(buffer: ArrayBuffer, options: any = {}): Font {
    let data = new Uint8Array(buffer);
    if (isGzip(data)) {
        data = unGzip(data);
    }
    const dataView = new DataView(data.buffer, data.byteOffset, data.byteLength);

    let indexToLocFormat: number = 0;
    let ltagTable: any;

    const signature = _parse.getTag(dataView, 0);
    let tableEntries: any[];
    if (signature === 'wOFF' || signature === 'wOF2') {
        if (signature === 'wOF2') {
            throw new Error('WOFF2 is not supported.');
        }
        const numTables = _parse.getUShort(dataView, 12);
        tableEntries = parseWOFFTableEntries(dataView, numTables);
    } else {
        const numTables = _parse.getUShort(dataView, 4);
        tableEntries = parseOpenTypeTableEntries(dataView, numTables);
    }

    const font = new Font({
        empty: true,
        outlinesFormat: signature === 'OTTO' ? 'cff' : 'truetype'
    });

    const tables: any = {};
    tableEntries.forEach(function(entry) {
        tables[entry.tag] = entry;
    });

    // 1. Critical metadata tables
    if (tables.head) {
        const headTable = head.parse(uncompressTable(data, tables.head), 0);
        font.unitsPerEm = headTable.unitsPerEm;
        indexToLocFormat = headTable.indexToLocFormat;
        font.tables.head = headTable;
    }

    if (tables.maxp) {
        font.tables.maxp = maxp.parse(uncompressTable(data, tables.maxp), 0);
        font.numGlyphs = font.tables.maxp.numGlyphs;
    }

    if (tables.hhea) {
        font.tables.hhea = hhea.parse(uncompressTable(data, tables.hhea), 0);
        font.ascender = font.tables.hhea.ascender;
        font.descender = font.tables.hhea.descender;
        font.numberOfHMetrics = font.tables.hhea.numberOfHMetrics;
    }

    // 2. Outlines and Glyphs
    if (tables.loca && tables.glyf) {
        const locaTable = loca.parse(uncompressTable(data, tables.loca), 0, font.numGlyphs, indexToLocFormat === 0);
        font.glyphs = glyf.parse(uncompressTable(data, tables.glyf), 0, locaTable, font, options);
    } else if (tables['CFF ']) {
        cff.parse(uncompressTable(data, tables['CFF ']), 0, font, options);
    } else if (tables['CFF2']) {
        cff.parse(uncompressTable(data, tables['CFF2']), 0, font, options);
    }

    // 3. Metrics
    if (tables.hmtx) {
        hmtx.parse(font, uncompressTable(data, tables.hmtx), 0, font.numberOfHMetrics, font.numGlyphs, font.glyphs, options);
    }

    // 4. Other tables
    if (tables.cmap) {
        font.tables.cmap = cmap.parse(uncompressTable(data, tables.cmap), 0);
        font.encoding = new CmapEncoding(font.tables.cmap);
    }

    if (tables.name) {
        font.tables.name = _name.parse(uncompressTable(data, tables.name), 0, ltagTable);
        font.names = font.tables.name;
    }

    if (tables.ltag) {
        ltagTable = ltag.parse(uncompressTable(data, tables.ltag), 0);
    }

    if (tables['OS/2']) {
        font.tables.os2 = os2.parse(uncompressTable(data, tables['OS/2']), 0);
    }

    if (tables.post) {
        font.tables.post = post.parse(uncompressTable(data, tables.post), 0);
        font.glyphNames = new GlyphNames(font.tables.post);
    }

    if (tables.GPOS) {
        font.tables.gpos = gpos.parse(uncompressTable(data, tables.GPOS), 0);
        font.position.init();
    }

    if (tables.GSUB) {
        font.tables.gsub = gsub.parse(uncompressTable(data, tables.GSUB), 0);
    }

    if (tables.GDEF) {
        font.tables.gdef = gdef.parse(uncompressTable(data, tables.GDEF), 0);
    }

    if (tables.kern) {
        font.tables.kern = kern.parse(uncompressTable(data, tables.kern), 0);
        font.kerningPairs = font.tables.kern;
    } else {
        font.kerningPairs = {};
    }

    if (tables.fvar) {
        font.tables.fvar = fvar.parse(uncompressTable(data, tables.fvar), 0, font.names);
    }

    if (tables.meta) {
        font.tables.meta = meta.parse(uncompressTable(data, tables.meta), 0);
    }

    if (tables.avar) {
        font.tables.avar = avar.parse(uncompressTable(data, tables.avar), 0, font.tables.fvar);
    }

    if (tables.gvar) {
        font.tables.gvar = gvar.parse(uncompressTable(data, tables.gvar), 0, font.tables.fvar, font.glyphs);
    }

    if (tables.cvar) {
        font.tables.cvar = cvar.parse(uncompressTable(data, tables.cvar), 0, font.tables.fvar, font.tables.cvt || []);
    }

    if (tables.HVAR) {
        font.tables.hvar = hvar.parse(uncompressTable(data, tables.HVAR), 0, font.tables.fvar);
    }

    if (tables.COLR) {
        font.tables.colr = colr.parse(uncompressTable(data, tables.COLR), 0);
    }

    if (tables.CPAL) {
        font.tables.cpal = cpal.parse(uncompressTable(data, tables.CPAL), 0);
    }

    if (tables['cvt ']) {
        const t = uncompressTable(data, tables['cvt ']);
        const p = new _parse.Parser(t, 0);
        font.tables.cvt = p.parseShortList(tables['cvt '].length / 2);
    }

    if (tables.fpgm) {
        const t = uncompressTable(data, tables.fpgm);
        const p = new _parse.Parser(t, 0);
        font.tables.fpgm = p.parseByteList(tables.fpgm.length);
    }

    if (tables.prep) {
        const t = uncompressTable(data, tables.prep);
        const p = new _parse.Parser(t, 0);
        font.tables.prep = p.parseByteList(tables.prep.length);
    }

    if (tables.STAT) {
        font.tables.stat = stat.parse(uncompressTable(data, tables.STAT), 0, font.tables.fvar);
    }

    if (tables.SVG ) {
        font.tables.svg = svg.parse(uncompressTable(data, tables.SVG), 0);
    }

    if (tables.gasp) {
        font.tables.gasp = gasp.parse(uncompressTable(data, tables.gasp), 0);
    }

    addGlyphNames(font, options);

    return font;
}

function load(url: string, callback: (err: any, font?: Font) => void, options: any = {}) {
    fetch(url)
        .then(response => {
            if (!response.ok) throw new Error(response.statusText);
            return response.arrayBuffer();
        })
        .then(buffer => {
            try {
                const font = parseFont(buffer, options);
                callback(null, font);
            } catch (err) {
                callback(err);
            }
        })
        .catch(err => {
            callback(err);
        });
}

function loadSync(path: string, options: any = {}): Font {
    const fs = require('fs');
    const buffer = fs.readFileSync(path);
    return parseFont(buffer.buffer, options);
}

export {
    Font,
    Glyph,
    Path,
    BoundingBox,
    _parse as _parse,
    cpal,
    colr,
    cmap,
    cff,
    stat,
    fvar,
    gvar,
    cvar,
    avar,
    hvar,
    glyf,
    gdef,
    gpos,
    gsub,
    head,
    hhea,
    hmtx,
    kern,
    ltag,
    loca,
    maxp,
    _name as name,
    os2,
    post,
    meta,
    gasp,
    svg,
    load,
    loadSync,
    parseFont as parse
};

export default {
    Font,
    Glyph,
    Path,
    BoundingBox,
    parse: parseFont,
    load,
    loadSync
};
