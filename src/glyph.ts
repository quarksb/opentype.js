import check from './check';
import draw from './draw';
import Path from './path';
import { getPaletteColor, formatColor } from './tables/cpal';
import { IGlyph, PathCommand, BoundingBox, GlyphOptions, PathOptions, IFont } from './types';

function getPathDefinition(glyph: Glyph, path: any) {
    let _path = path || new Path();
    return {
        configurable: true,
        get: function() {
            if (typeof _path === 'function') {
                _path = _path();
                // If it's a Path object now, make sure it has unitsPerEm if the glyph has it
                if (_path instanceof Path && !(_path as any).unitsPerEm && (glyph as any).unitsPerEm) {
                     (_path as any).unitsPerEm = (glyph as any).unitsPerEm;
                }
            }
            return _path;
        },
        set: function(p: any) {
            _path = p;
        }
    };
}

class Glyph implements IGlyph {
    index: number;
    name: string | null;
    unicode?: number;
    unicodes: number[];
    xMin?: number;
    yMin?: number;
    xMax?: number;
    yMax?: number;
    advanceWidth?: number;
    leftSideBearing?: number;
    points?: any[];
    path!: Path; // Defined by Object.defineProperty in constructor

    constructor(options: GlyphOptions) {
        this.index = options.index || 0;

        if (options.name === '.notdef') {
            this.name = '.notdef';
            this.unicode = undefined;
        } else if (options.name === '.null') {
            this.name = '.null';
            this.unicode = 0;
        } else {
            this.name = options.name || null;
            this.unicode = options.unicode;
        }

        if (this.unicode === 0 && this.name !== '.null') {
            throw new Error('The unicode value "0" is reserved for the glyph name ".null" and cannot be used by any other glyph.');
        }

        this.unicodes = options.unicodes || (this.unicode !== undefined ? [this.unicode] : []);

        if ('xMin' in options) this.xMin = options.xMin;
        if ('yMin' in options) this.yMin = options.yMin;
        if ('xMax' in options) this.xMax = options.xMax;
        if ('yMax' in options) this.yMax = options.yMax;
        if ('advanceWidth' in options) this.advanceWidth = options.advanceWidth;
        if ('leftSideBearing' in options) this.leftSideBearing = options.leftSideBearing;
        if ('points' in options) this.points = options.points;

        Object.defineProperty(this, 'path', getPathDefinition(this, options.path));
    }

    addUnicode(unicode: number): void {
        if (this.unicodes.length === 0) {
            this.unicode = unicode;
        }
        this.unicodes.push(unicode);
    }

    getBoundingBox(): BoundingBox {
        return this.path.getBoundingBox();
    }

    getPath(x: number = 0, y: number = 0, fontSize: number = 72, options: any = {}, font?: IFont): Path {
        const renderOptions = Object.assign({}, font && (font as any).defaultRenderOptions, options);
        let commands: PathCommand[];
        let hPoints: any;
        let xScale = renderOptions.xScale;
        let yScale = renderOptions.yScale;
        const scale = 1 / ((this.path as any).unitsPerEm || 1000) * fontSize;

        let useGlyph: any = this;

        if (font && (font as any).variation) {
            useGlyph = (font as any).variation.getTransform(this, renderOptions.variation);
        }

        if (renderOptions.hinting && font && (font as any).hinting) {
            hPoints = useGlyph.path && (font as any).hinting.exec(useGlyph, fontSize, renderOptions);
        }

        if (hPoints) {
            commands = (font as any).hinting.getCommands(hPoints);
            x = Math.round(x);
            y = Math.round(y);
            xScale = yScale = 1;
        } else {
            commands = useGlyph.path.commands;
            if (xScale === undefined) xScale = scale;
            if (yScale === undefined) yScale = scale;
        }

        const p = new Path();
        if (renderOptions.drawSVG) {
            const svgImage = this.getSvgImage(font);
            if (svgImage) {
                const layer = new Path();
                layer._image = {
                    image: (svgImage as any).image,
                    x: x + (svgImage as any).leftSideBearing * scale,
                    y: y - (svgImage as any).baseline * scale,
                    width: (svgImage as any).image.width * scale,
                    height: (svgImage as any).image.height * scale,
                };
                p._layers = [layer];
                return p;
            }
        }
        if (renderOptions.drawLayers) {
            const layers = this.getLayers(font);
            if (layers && layers.length) {
                p._layers = [];
                for (let i = 0; i < layers.length; i += 1) {
                    const layer = layers[i];
                    let color = getPaletteColor(font!, layer.paletteIndex, renderOptions.usePalette);
                    if (color === 'currentColor') {
                        color = renderOptions.fill || 'black';
                    } else {
                        color = formatColor(color, renderOptions.colorFormat || 'rgba');
                    }
                    const layerOptions = Object.assign({}, renderOptions, { fill: color });
                    p._layers!.push(this.getPath.call(layer.glyph, x, y, fontSize, layerOptions, font));
                }
                return p;
            }
        }

        p.fill = renderOptions.fill || this.path.fill;
        p.stroke = this.path.stroke;
        p.strokeWidth = this.path.strokeWidth * scale;
        for (let i = 0; i < commands.length; i += 1) {
            const cmd = commands[i];
            if (cmd.type === 'M') {
                p.moveTo(x + (cmd.x! * xScale), y + (-cmd.y! * yScale));
            } else if (cmd.type === 'L') {
                p.lineTo(x + (cmd.x! * xScale), y + (-cmd.y! * yScale));
            } else if (cmd.type === 'Q') {
                p.quadraticCurveTo(x + (cmd.x1! * xScale), y + (-cmd.y1! * yScale),
                    x + (cmd.x! * xScale), y + (-cmd.y! * yScale));
            } else if (cmd.type === 'C') {
                p.curveTo(x + (cmd.x1! * xScale), y + (-cmd.y1! * yScale),
                    x + (cmd.x2! * xScale), y + (-cmd.y2! * yScale),
                    x + (cmd.x! * xScale), y + (-cmd.y! * yScale));
            } else if (cmd.type === 'Z' && p.stroke && p.strokeWidth) {
                p.closePath();
            }
        }
        return p;
    }

    getLayers(font?: IFont): any[] | undefined {
        if (!font) {
            throw Error('The font object is required to read the colr/cpal tables in order to get the layers.');
        }
        return (font as any).layers.get(this.index);
    }

    getSvgImage(font?: IFont): any | undefined {
        if (!font) {
            throw Error('The font object is required to read the svg table in order to get the image.');
        }
        return (font as any).svgImages.get(this.index);
    }

    getContours(transformedPoints: any[] | null = null): any[][] {
        if (this.points === undefined && !transformedPoints) {
            return [];
        }
        const contours: any[][] = [];
        let currentContour: any[] = [];
        const points = transformedPoints ? transformedPoints : this.points!;
        for (let i = 0; i < points.length; i += 1) {
            const pt = points[i];
            currentContour.push(pt);
            if (pt.lastPointOfContour) {
                contours.push(currentContour);
                currentContour = [];
            }
        }
        check.argument(currentContour.length === 0, 'There are still points left in the current contour.');
        return contours;
    }

    getMetrics(): any {
        const commands = this.path.commands;
        const xCoords: number[] = [];
        const yCoords: number[] = [];
        for (let i = 0; i < commands.length; i += 1) {
            const cmd = commands[i];
            if (cmd.type !== 'Z') {
                xCoords.push(cmd.x!);
                yCoords.push(cmd.y!);
            }
            if (cmd.type === 'Q' || cmd.type === 'C') {
                xCoords.push(cmd.x1!);
                yCoords.push(cmd.y1!);
            }
            if (cmd.type === 'C') {
                xCoords.push(cmd.x2!);
                yCoords.push(cmd.y2!);
            }
        }

        const metrics: any = {
            xMin: Math.min(...xCoords),
            yMin: Math.min(...yCoords),
            xMax: Math.max(...xCoords),
            yMax: Math.max(...yCoords),
            leftSideBearing: this.leftSideBearing
        };

        if (!isFinite(metrics.xMin)) metrics.xMin = 0;
        if (!isFinite(metrics.xMax)) metrics.xMax = this.advanceWidth || 0;
        if (!isFinite(metrics.yMin)) metrics.yMin = 0;
        if (!isFinite(metrics.yMax)) metrics.yMax = 0;
        metrics.rightSideBearing = (this.advanceWidth || 0) - (this.leftSideBearing || 0) - (metrics.xMax - metrics.xMin);
        return metrics;
    }

    draw(ctx: CanvasRenderingContext2D, x: number = 0, y: number = 0, fontSize: number = 72, options: any = {}, font?: IFont): void {
        const renderOptions = Object.assign({}, font && (font as any).defaultRenderOptions, options);
        const path = this.getPath(x, y, fontSize, renderOptions, font);
        path.draw(ctx);
    }

    drawPoints(ctx: CanvasRenderingContext2D, x: number = 0, y: number = 0, fontSize: number = 72, options: any = {}, font?: IFont): void {
        const renderOptions = Object.assign({}, font && (font as any).defaultRenderOptions, options);
        if (renderOptions.drawLayers) {
            const layers = this.getLayers(font);
            if (layers && layers.length) {
                for (let l = 0; l < layers.length; l += 1) {
                    if (layers[l].glyph.index !== this.index) {
                        layers[l].glyph.drawPoints(ctx, x, y, fontSize, renderOptions, font);
                    }
                }
                return;
            }
        }

        const drawCircles = (l: any[], x: number, y: number, scale: number) => {
            ctx.beginPath();
            for (let j = 0; j < l.length; j += 1) {
                ctx.moveTo(x + (l[j].x * scale), y + (l[j].y * scale));
                ctx.arc(x + (l[j].x * scale), y + (l[j].y * scale), 2, 0, Math.PI * 2, false);
            }
            ctx.fill();
        };

        x = x !== undefined ? x : 0;
        y = y !== undefined ? y : 0;
        fontSize = fontSize !== undefined ? fontSize : 24;
        const scale = 1 / ((this.path as any).unitsPerEm || 1000) * fontSize;
        const blueCircles: any[] = [];
        const redCircles: any[] = [];
        let commands = this.path.commands;

        if (font && (font as any).variation) {
            commands = (font as any).variation.getTransform(this, renderOptions.variation).path.commands;
        }

        for (let i = 0; i < commands.length; i += 1) {
            const cmd = commands[i];
            if (cmd.x !== undefined) blueCircles.push({ x: cmd.x, y: -cmd.y! });
            if (cmd.x1 !== undefined) redCircles.push({ x: cmd.x1, y: -cmd.y1! });
            if (cmd.x2 !== undefined) redCircles.push({ x: cmd.x2, y: -cmd.y2! });
        }

        ctx.fillStyle = 'blue';
        drawCircles(blueCircles, x, y, scale);
        ctx.fillStyle = 'red';
        drawCircles(redCircles, x, y, scale);
    }

    drawMetrics(ctx: CanvasRenderingContext2D, x: number = 0, y: number = 0, fontSize: number = 72): void {
        x = x !== undefined ? x : 0;
        y = y !== undefined ? y : 0;
        fontSize = fontSize !== undefined ? fontSize : 24;
        const scale = 1 / ((this.path as any).unitsPerEm || 1000) * fontSize;
        ctx.lineWidth = 1;
        ctx.strokeStyle = 'black';
        draw.line(ctx, x, -10000, x, 10000);
        draw.line(ctx, -10000, y, 10000, y);
        const xMin = this.xMin || 0;
        const yMin = this.yMin || 0;
        const xMax = this.xMax || 0;
        const yMax = this.yMax || 0;
        const advanceWidth = this.advanceWidth || 0;
        ctx.strokeStyle = 'blue';
        draw.line(ctx, x + (xMin * scale), -10000, x + (xMin * scale), 10000);
        draw.line(ctx, x + (xMax * scale), -10000, x + (xMax * scale), 10000);
        draw.line(ctx, -10000, y + (-yMin * scale), 10000, y + (-yMin * scale));
        draw.line(ctx, -10000, y + (-yMax * scale), 10000, y + (-yMax * scale));
        ctx.strokeStyle = 'green';
        draw.line(ctx, x + (advanceWidth * scale), -10000, x + (advanceWidth * scale), 10000);
    }

    toPathData(options?: number | PathOptions, font?: IFont): string {
        const renderOptions: any = Object.assign({}, { variation: font && (font as any).defaultRenderOptions.variation }, options);
        let useGlyph: any = this;
        if (font && (font as any).variation) {
            useGlyph = (font as any).variation.getTransform(this, renderOptions.variation);
        }
        let usePath = useGlyph.points && renderOptions.pointsTransform ? renderOptions.pointsTransform(useGlyph.points) : useGlyph.path;
        if (renderOptions.pathTransform) { // Fixed typo in original code: pathTramsform -> pathTransform? Wait, original had pathTramsform.
            usePath = renderOptions.pathTransform(usePath);
        }
        return usePath.toPathData(renderOptions);
    }

    fromSVG(pathData: string | SVGPathElement, options: PathOptions = {}): void {
        this.path.fromSVG(pathData, options);
    }

    toSVG(options?: number | PathOptions, font?: IFont): string {
        const pathData = this.toPathData(options, font);
        return this.path.toSVG(options as any, pathData);
    }

    toDOMElement(options?: number | PathOptions, font?: IFont): SVGPathElement {
        const renderOptions: any = Object.assign({}, { variation: font && (font as any).defaultRenderOptions.variation }, options);
        let usePath = this.path;
        if (font && (font as any).variation) {
            usePath = (font as any).variation.getTransform(this, renderOptions.variation).path;
        }
        return usePath.toDOMElement(renderOptions);
    }
}

export default Glyph;
