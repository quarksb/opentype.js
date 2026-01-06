import assert from 'assert';
import { Font, Glyph, Path } from '../src/opentype';
import { GlyphNames } from '../src/encoding';

describe('API Coverage', function() {
    let font;
    const glyphs = [
        new Glyph({name: '.notdef', unicode: 0, path: new Path(), advanceWidth: 10}),
        new Glyph({name: 'a', unicode: 97, path: new Path(), advanceWidth: 10}),
        new Glyph({name: 'b', unicode: 98, path: new Path(), advanceWidth: 10})
    ];
    
    for (let i = 0; i < glyphs.length; i++) {
        glyphs[i].index = i;
    }

    beforeEach(function() {
        font = new Font({
            familyName: 'Test',
            styleName: 'Regular',
            unitsPerEm: 1000,
            ascender: 800,
            descender: -200,
            glyphs: glyphs
        });
        // satisfying internal expectations
        font.glyphNames = new GlyphNames({ version: 3 }); 
        font.glyphNames.names = glyphs.map(g => g.name);
        font.kerningPairs = {};
    });

    it('charToGlyphIndex', function() {
        assert.strictEqual(font.charToGlyphIndex('a'), 1);
        assert.strictEqual(font.charToGlyphIndex('b'), 2);
        assert.strictEqual(font.charToGlyphIndex('c'), null); 
    });

    it('charToGlyph', function() {
        assert.strictEqual(font.charToGlyph('a'), glyphs[1]);
        assert.strictEqual(font.charToGlyph('b'), glyphs[2]);
    });

    it('nameToGlyphIndex', function() {
        assert.strictEqual(font.nameToGlyphIndex('a'), 1);
        assert.strictEqual(font.nameToGlyphIndex('.notdef'), 0);
    });

    it('nameToGlyph', function() {
        assert.strictEqual(font.nameToGlyph('a'), glyphs[1]);
    });

    it('glyphIndexToName', function() {
        assert.strictEqual(font.glyphIndexToName(1), 'a');
    });

    it('getKerningValue', function() {
        assert.strictEqual(font.getKerningValue(glyphs[1], glyphs[2]), 0);
    });

    it('getEnglishName', function() {
        assert.strictEqual(font.getEnglishName('fontFamily'), 'Test');
    });

    it('toBuffer and toArrayBuffer', function() {
        const buf = font.toArrayBuffer();
        assert(buf instanceof ArrayBuffer);
        // toBuffer is deprecated but should still exist
        const buf2 = font.toBuffer();
        assert(buf2 instanceof ArrayBuffer);
    });
});
