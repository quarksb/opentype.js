import assert from 'assert';


import distOpentype from '../dist/opentype.js';
import distOpentypeMin from '../dist/opentype.min.js';

import { parse as parseBufferMod } from '../dist/opentype';
import { parse as parseBufferModMin } from '../dist/opentype.min';

import { parse as parseBufferSrc } from '../src/opentype';

import { readFileSync } from 'fs';

describe('opentype.js dist', function () {
    const dist_matrix = [
        [distOpentype.parse, '.js'],
        [distOpentypeMin.parse, '.min.js'],
        [parseBufferMod, ''],
        [parseBufferModMin, '.min'],
        [parseBufferSrc, ''],
    ]

    for (const [parse, ext] of dist_matrix) {
        for (const lowMemory in [true, false]) {
            it('can work with the ' + ext + ' distribution in lowMemory=' + lowMemory, function () {
                const font = parse(readFileSync('./test/fonts/Roboto-Black.ttf'), { lowMemory });
                assert.deepEqual(font.names.macintosh.fontFamily, { en: 'Roboto Black' });
                assert.deepEqual(font.names.windows.fontFamily, { en: 'Roboto Black' });
                assert.equal(font.unitsPerEm, 2048);
                assert.equal(font.glyphs.length, lowMemory ? 0 : 1294);
            });
        }
    }
});
