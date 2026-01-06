// The Bounding Box object

import { BoundingBox as IBoundingBox } from './types';

function derive(v0: number, v1: number, v2: number, v3: number, t: number): number {
    return Math.pow(1 - t, 3) * v0 +
        3 * Math.pow(1 - t, 2) * t * v1 +
        3 * (1 - t) * Math.pow(t, 2) * v2 +
        Math.pow(t, 3) * v3;
}

/**
 * A bounding box is an enclosing box that describes the smallest measure within which all the points lie.
 * It is used to calculate the bounding box of a glyph or text path.
 *
 * On initialization, x1/y1/x2/y2 will be NaN. Check if the bounding box is empty using `isEmpty()`.
 */
class BoundingBox implements IBoundingBox {
    x1: number;
    y1: number;
    x2: number;
    y2: number;

    constructor() {
        this.x1 = Number.NaN;
        this.y1 = Number.NaN;
        this.x2 = Number.NaN;
        this.y2 = Number.NaN;
    }

    /**
     * Returns true if the bounding box is empty, that is, no points have been added to the box yet.
     */
    isEmpty(): boolean {
        return isNaN(this.x1) || isNaN(this.y1) || isNaN(this.x2) || isNaN(this.y2);
    }

    /**
     * Add the point to the bounding box.
     * The x1/y1/x2/y2 coordinates of the bounding box will now encompass the given point.
     * @param {number} x - The X coordinate of the point.
     * @param {number} y - The Y coordinate of the point.
     */
    addPoint(x: number | null, y: number | null): void {
        if (typeof x === 'number') {
            if (isNaN(this.x1) || isNaN(this.x2)) {
                this.x1 = x;
                this.x2 = x;
            }
            if (x < this.x1) {
                this.x1 = x;
            }
            if (x > this.x2) {
                this.x2 = x;
            }
        }
        if (typeof y === 'number') {
            if (isNaN(this.y1) || isNaN(this.y2)) {
                this.y1 = y;
                this.y2 = y;
            }
            if (y < this.y1) {
                this.y1 = y;
            }
            if (y > this.y2) {
                this.y2 = y;
            }
        }
    }

    /**
     * Add a X coordinate to the bounding box.
     * This extends the bounding box to include the X coordinate.
     * This function is used internally inside of addBezier.
     * @param {number} x - The X coordinate of the point.
     */
    addX(x: number): void {
        this.addPoint(x, null);
    }

    /**
     * Add a Y coordinate to the bounding box.
     * This extends the bounding box to include the Y coordinate.
     * This function is used internally inside of addBezier.
     * @param {number} y - The Y coordinate of the point.
     */
    addY(y: number): void {
        this.addPoint(null, y);
    }

    /**
     * Add a Bézier curve to the bounding box.
     * This extends the bounding box to include the entire Bézier.
     */
    addBezier(x0: number, y0: number, x1: number, y1: number, x2: number, y2: number, x: number, y: number): void {
        // This code is based on http://nishiohirokazu.blogspot.com/2009/06/how-to-calculate-bezier-curves-bounding.html
        // and https://github.com/icons8/svg-path-bounding-box
        this.addPoint(x0, y0);
        this.addPoint(x, y);

        for (let i = 0; i <= 1; i++) {
            const b = 6 * x0 - 12 * x1 + 6 * x2;
            const a = -3 * x0 + 9 * x1 - 9 * x2 + 3 * x;
            const c = 3 * x1 - 3 * x0;

            if (a === 0) {
                if (b === 0) continue;
                const t = -c / b;
                if (0 < t && t < 1) {
                    this.addX(derive(x0, x1, x2, x, t));
                }
                continue;
            }

            const b2ac = Math.pow(b, 2) - 4 * a * c;
            if (b2ac < 0) continue;
            const t1 = (-b + Math.sqrt(b2ac)) / (2 * a);
            if (0 < t1 && t1 < 1) this.addX(derive(x0, x1, x2, x, t1));
            const t2 = (-b - Math.sqrt(b2ac)) / (2 * a);
            if (0 < t2 && t2 < 1) this.addX(derive(x0, x1, x2, x, t2));
        }

        for (let i = 0; i <= 1; i++) {
            const b = 6 * y0 - 12 * y1 + 6 * y2;
            const a = -3 * y0 + 9 * y1 - 9 * y2 + 3 * y;
            const c = 3 * y1 - 3 * y0;

            if (a === 0) {
                if (b === 0) continue;
                const t = -c / b;
                if (0 < t && t < 1) {
                    this.addY(derive(y0, y1, y2, y, t));
                }
                continue;
            }

            const b2ac = Math.pow(b, 2) - 4 * a * c;
            if (b2ac < 0) continue;
            const t1 = (-b + Math.sqrt(b2ac)) / (2 * a);
            if (0 < t1 && t1 < 1) this.addY(derive(y0, y1, y2, y, t1));
            const t2 = (-b - Math.sqrt(b2ac)) / (2 * a);
            if (0 < t2 && t2 < 1) this.addY(derive(y0, y1, y2, y, t2));
        }
    }

    /**
     * Add a quadratic curve to the bounding box.
     * This extends the bounding box to include the entire quadratic curve.
     */
    addQuad(x0: number, y0: number, x1: number, y1: number, x: number, y: number): void {
        const cp1x = x0 + 2 / 3 * (x1 - x0);
        const cp1y = y0 + 2 / 3 * (y1 - y0);
        const cp2x = cp1x + 1 / 3 * (x - x0);
        const cp2y = cp1y + 1 / 3 * (y - y0);
        this.addBezier(x0, y0, cp1x, cp1y, cp2x, cp2y, x, y);
    }
}

export default BoundingBox;
