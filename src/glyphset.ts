import Glyph from './glyph';
import { IFont, IGlyph } from './types';

// Define a property on the glyph that depends on the path being loaded.
function defineDependentProperty(glyph: any, externalName: string, internalName: string) {
    Object.defineProperty(glyph, externalName, {
        get: function() {
            // Request the path property to make sure the path is loaded.
            // optimization: do it only when the internal property is undefined,
            // in order to prevent unnecessary computations, as well endless loops
            // in the case of the points property
            if (typeof glyph[internalName] === 'undefined') {
                // accessing .path will trigger the deferred path loader if it exists
                const p = glyph.path;
            }
            return glyph[internalName];
        },
        set: function(newValue) {
            glyph[internalName] = newValue;
        },
        enumerable: true,
        configurable: true
    });
}

class GlyphSet {
    font: IFont;
    glyphs: { [key: number]: IGlyph | (() => IGlyph) };
    length: number;

    constructor(font: IFont, glyphs?: IGlyph[]) {
        this.font = font;
        this.glyphs = {};
        if (Array.isArray(glyphs)) {
            for (let i = 0; i < glyphs.length; i++) {
                const glyph = glyphs[i];
                (glyph.path as any).unitsPerEm = font.unitsPerEm;
                this.glyphs[i] = glyph;
            }
        }
        this.length = (glyphs && glyphs.length) || 0;
    }

    [Symbol.iterator]() {
        let n = -1;
        return {
            next: () => {
                n++;
                const done = n >= this.length;
                return { value: done ? undefined : this.get(n), done: done };
            }
        };
    }

    get(index: number): IGlyph | undefined {
        const font = this.font as any;
        // this.glyphs[index] is 'undefined' when low memory mode is on. glyph is pushed on request only.
        if (font._push && this.glyphs[index] === undefined) {
            font._push(index);
            if (typeof this.glyphs[index] === 'function') {
                this.glyphs[index] = (this.glyphs[index] as any)();
            }

            let glyph = this.glyphs[index] as IGlyph;
            let unicodeObj = font._IndexToUnicodeMap[index];

            if (unicodeObj) {
                for (let j = 0; j < unicodeObj.unicodes.length; j++)
                    glyph.addUnicode(unicodeObj.unicodes[j]);
            }

            if (font.cffEncoding) {
                glyph.name = font.cffEncoding.charset[index];
            } else if (font.glyphNames && font.glyphNames.names) {
                glyph.name = font.glyphNames.glyphIndexToName(index);
            }

            glyph.advanceWidth = font._hmtxTableData[index].advanceWidth;
            glyph.leftSideBearing = font._hmtxTableData[index].leftSideBearing;
        } else {
            if (typeof this.glyphs[index] === 'function') {
                this.glyphs[index] = (this.glyphs[index] as any)();
            }
        }

        return this.glyphs[index] as IGlyph;
    }

    push(index: number, loader: IGlyph | (() => IGlyph)): void {
        this.glyphs[index] = loader;
        this.length++;
    }
}

function glyphLoader(font: IFont, index: number): IGlyph {
    return new Glyph({ index: index });
}

function ttfGlyphLoader(font: IFont, index: number, parseGlyph: any, data: any, position: number, buildPath: any): () => IGlyph {
    return function() {
        const glyph = new Glyph({ index: index });

        const originalPathDef = Object.getOwnPropertyDescriptor(glyph, 'path');
        Object.defineProperty(glyph, 'path', {
            configurable: true,
            get: function() {
                parseGlyph(glyph, data, position);
                const path = buildPath(font.glyphs, glyph);
                path.unitsPerEm = font.unitsPerEm;
                // Once loaded, we should probably redefine .path as a simple value or restore standard behavior
                Object.defineProperty(glyph, 'path', { value: path, configurable: true, writable: true });
                return path;
            }
        });

        defineDependentProperty(glyph, 'numberOfContours', '_numberOfContours');
        defineDependentProperty(glyph, 'xMin', '_xMin');
        defineDependentProperty(glyph, 'xMax', '_xMax');
        defineDependentProperty(glyph, 'yMin', '_yMin');
        defineDependentProperty(glyph, 'yMax', '_yMax');
        defineDependentProperty(glyph, 'points', '_points');
        
        return glyph;
    };
}

function cffGlyphLoader(font: IFont, index: number, parseCFFCharstring: any, charstring: any, version: any): () => IGlyph {
    return function() {
        const glyph = new Glyph({ index: index });

        Object.defineProperty(glyph, 'path', {
            configurable: true,
            get: function() {
                const path = parseCFFCharstring(font, glyph, charstring, version);
                path.unitsPerEm = font.unitsPerEm;
                Object.defineProperty(glyph, 'path', { value: path, configurable: true, writable: true });
                return path;
            }
        });

        return glyph;
    };
}

export default { GlyphSet, glyphLoader, ttfGlyphLoader, cffGlyphLoader };
export { GlyphSet, glyphLoader, ttfGlyphLoader, cffGlyphLoader };
