import BoundingBox from './bbox';
import { Path as IPath, PathCommand, PathOptions, BoundingBox as IBoundingBox } from './types';

const decimalRoundingCache: Record<number, Record<number, number>> = {};

function roundDecimal(float: number, places: number): number {
    if (places === undefined || places === null) {
        return float;
    }
    const integerPart = Math.floor(float);
    const decimalPart = float - integerPart;

    if (!decimalRoundingCache[places]) {
        decimalRoundingCache[places] = {};
    }

    if (decimalRoundingCache[places][decimalPart] !== undefined) {
        const roundedDecimalPart = decimalRoundingCache[places][decimalPart];
        return integerPart + roundedDecimalPart;
    }

    const roundedDecimalPart = +(Math.round(Number(decimalPart + 'e+' + places)) + 'e-' + places);
    decimalRoundingCache[places][decimalPart] = roundedDecimalPart;

    return integerPart + roundedDecimalPart;
}

function optimizeCommands(commands: PathCommand[]): PathCommand[] {
    // separate subpaths
    let subpaths: PathCommand[][] = [[]];
    let startX = 0,
        startY = 0;
    for (let i = 0; i < commands.length; i += 1) {
        const subpath = subpaths[subpaths.length - 1];
        const cmd = commands[i];
        const firstCommand = subpath[0];
        const secondCommand = subpath[1];
        const previousCommand = subpath[subpath.length - 1];
        const nextCommand = commands[i + 1];
        subpath.push(cmd);

        if (cmd.type === 'M') {
            startX = cmd.x!;
            startY = cmd.y!;
        } else if (cmd.type === 'L' && (!nextCommand || (nextCommand as any).command === 'Z')) {
            if (!(Math.abs(cmd.x! - startX) > 1 || Math.abs(cmd.y! - startY) > 1)) {
                subpath.pop();
            }
        } else if (cmd.type === 'L' && previousCommand && previousCommand.x === cmd.x && previousCommand.y === cmd.y) {
            subpath.pop();
        } else if (cmd.type === 'Z') {
            // When closing at the same position as the path started,
            // remove unnecessary line command
            if (
                firstCommand &&
                secondCommand &&
                previousCommand &&
                firstCommand.type === 'M' &&
                secondCommand.type === 'L' &&
                previousCommand.type === 'L' &&
                previousCommand.x === firstCommand.x &&
                previousCommand.y === firstCommand.y
            ) {
                subpath.shift();
                subpath[0].type = 'M';
            }

            if (i + 1 < commands.length) {
                subpaths.push([]);
            }
        }
    }
    return ([] as PathCommand[]).concat(...subpaths); // flatten again
}

function createSVGParsingOptions(options?: PathOptions): Required<PathOptions> {
    const defaultOptions: Required<PathOptions> = {
        decimalPlaces: 2,
        optimize: true,
        flipY: true,
        flipYBase: 0, // Will be overridden if undefined
        scale: 1,
        x: 0,
        y: 0
    };
    return Object.assign({}, defaultOptions, options);
}

function createSVGOutputOptions(options?: number | PathOptions): PathOptions {
    if (typeof options === 'number') {
        return { decimalPlaces: options, flipY: false };
    }
    const defaultOptions: PathOptions = {
        decimalPlaces: 2,
        optimize: true,
        flipY: true,
        flipYBase: undefined
    };
    return Object.assign({}, defaultOptions, options);
}

class Path implements IPath {
    commands: PathCommand[];
    fill: string | null;
    stroke: string | null;
    strokeWidth: number;
    unitsPerEm: number | undefined;
    _layers?: Path[];
    _image?: any; // For SVG images

    constructor() {
        this.commands = [];
        this.fill = 'black';
        this.stroke = null;
        this.strokeWidth = 1;
        this.unitsPerEm = undefined;
    }

    moveTo(x: number, y: number): void {
        this.commands.push({ type: 'M', x, y });
    }

    lineTo(x: number, y: number): void {
        this.commands.push({ type: 'L', x, y });
    }

    curveTo(x1: number, y1: number, x2: number, y2: number, x: number, y: number): void {
        this.commands.push({ type: 'C', x1, y1, x2, y2, x, y });
    }

    bezierCurveTo(x1: number, y1: number, x2: number, y2: number, x: number, y: number): void {
        this.curveTo(x1, y1, x2, y2, x, y);
    }

    quadTo(x1: number, y1: number, x: number, y: number): void {
        this.commands.push({ type: 'Q', x1, y1, x, y });
    }

    quadraticCurveTo(x1: number, y1: number, x: number, y: number): void {
        this.quadTo(x1, y1, x, y);
    }

    close(): void {
        this.commands.push({ type: 'Z' });
    }

    closePath(): void {
        this.close();
    }

    extend(pathOrCommands: IPath | IBoundingBox | PathCommand[]): void {
        if (Array.isArray(pathOrCommands)) {
            for (let i = 0; i < pathOrCommands.length; i += 1) {
                this.commands.push(pathOrCommands[i]);
            }
        } else if (pathOrCommands instanceof Path) {
            for (let i = 0; i < pathOrCommands.commands.length; i += 1) {
                this.commands.push(pathOrCommands.commands[i]);
            }
        } else if (pathOrCommands instanceof BoundingBox) {
            const box = pathOrCommands as BoundingBox;
            this.moveTo(box.x1, box.y1);
            this.lineTo(box.x2, box.y1);
            this.lineTo(box.x2, box.y2);
            this.lineTo(box.x1, box.y2);
            this.close();
        } else if ((pathOrCommands as any).commands) {
             // Fallback for objects that look like Paths but aren't instances
             const cmds = (pathOrCommands as any).commands;
             for (let i = 0; i < cmds.length; i += 1) {
                this.commands.push(cmds[i]);
            }
        }
    }

    getBoundingBox(): BoundingBox {
        const box = new BoundingBox();

        let startX = 0;
        let startY = 0;
        let prevX = 0;
        let prevY = 0;
        for (let i = 0; i < this.commands.length; i += 1) {
            const cmd = this.commands[i];
            if (cmd.type === 'M') {
                box.addPoint(cmd.x!, cmd.y!);
                startX = prevX = cmd.x!;
                startY = prevY = cmd.y!;
            } else if (cmd.type === 'L') {
                box.addPoint(cmd.x!, cmd.y!);
                prevX = cmd.x!;
                prevY = cmd.y!;
            } else if (cmd.type === 'Q') {
                box.addQuad(prevX, prevY, cmd.x1!, cmd.y1!, cmd.x!, cmd.y!);
                prevX = cmd.x!;
                prevY = cmd.y!;
            } else if (cmd.type === 'C') {
                box.addBezier(prevX, prevY, cmd.x1!, cmd.y1!, cmd.x2!, cmd.y2!, cmd.x!, cmd.y!);
                prevX = cmd.x!;
                prevY = cmd.y!;
            } else if (cmd.type === 'Z') {
                prevX = startX;
                prevY = startY;
            }
        }

        if (box.isEmpty()) {
            box.addPoint(0, 0);
        }
        return box;
    }

    draw(ctx: CanvasRenderingContext2D): void {
        if (this._layers && this._layers.length) {
            for (let l = 0; l < this._layers.length; l++) {
                this._layers[l].draw(ctx);
            }
            return;
        }

        if (this._image) {
            ctx.drawImage(this._image.image, this._image.x, this._image.y, this._image.width, this._image.height);
            return;
        }

        ctx.beginPath();
        for (let i = 0; i < this.commands.length; i += 1) {
            const cmd = this.commands[i];
            if (cmd.type === 'M') {
                ctx.moveTo(cmd.x!, cmd.y!);
            } else if (cmd.type === 'L') {
                ctx.lineTo(cmd.x!, cmd.y!);
            } else if (cmd.type === 'C') {
                ctx.bezierCurveTo(cmd.x1!, cmd.y1!, cmd.x2!, cmd.y2!, cmd.x!, cmd.y!);
            } else if (cmd.type === 'Q') {
                ctx.quadraticCurveTo(cmd.x1!, cmd.y1!, cmd.x!, cmd.y!);
            } else if (cmd.type === 'Z' && this.stroke && this.strokeWidth) {
                ctx.closePath();
            }
        }

        if (this.fill) {
            ctx.fillStyle = this.fill;
            ctx.fill();
        }

        if (this.stroke) {
            ctx.strokeStyle = this.stroke;
            ctx.lineWidth = this.strokeWidth;
            ctx.stroke();
        }
    }

    toPathData(options?: number | PathOptions): string {
        const opt = createSVGOutputOptions(options);

        function floatToString(v: number): string {
            const rounded = roundDecimal(v, opt.decimalPlaces!);
            if (Math.round(v) === rounded) {
                return '' + rounded;
            } else {
                return rounded.toFixed(opt.decimalPlaces);
            }
        }

        function packValues(...args: number[]): string {
            let s = '';
            for (let i = 0; i < args.length; i += 1) {
                const v = args[i];
                if (v >= 0 && i > 0) {
                    s += ' ';
                }
                s += floatToString(v);
            }
            return s;
        }

        let commandsCopy = this.commands;
        if (opt.optimize) {
            commandsCopy = JSON.parse(JSON.stringify(this.commands));
            commandsCopy = optimizeCommands(commandsCopy);
        }

        const flipY = opt.flipY;
        let flipYBase = opt.flipYBase;
        if (flipY === true && flipYBase === undefined) {
            const tempPath = new Path();
            tempPath.extend(commandsCopy);
            const boundingBox = tempPath.getBoundingBox();
            flipYBase = boundingBox.y1 + boundingBox.y2;
        }

        let d = '';
        for (let i = 0; i < commandsCopy.length; i += 1) {
            const cmd = commandsCopy[i];
            if (cmd.type === 'M') {
                d += 'M' + packValues(cmd.x!, flipY ? (flipYBase! - cmd.y!) : cmd.y!);
            } else if (cmd.type === 'L') {
                d += 'L' + packValues(cmd.x!, flipY ? (flipYBase! - cmd.y!) : cmd.y!);
            } else if (cmd.type === 'C') {
                d += 'C' + packValues(
                    cmd.x1!, flipY ? (flipYBase! - cmd.y1!) : cmd.y1!,
                    cmd.x2!, flipY ? (flipYBase! - cmd.y2!) : cmd.y2!,
                    cmd.x!, flipY ? (flipYBase! - cmd.y!) : cmd.y!
                );
            } else if (cmd.type === 'Q') {
                d += 'Q' + packValues(
                    cmd.x1!, flipY ? (flipYBase! - cmd.y1!) : cmd.y1!,
                    cmd.x!, flipY ? (flipYBase! - cmd.y!) : cmd.y!
                );
            } else if (cmd.type === 'Z') {
                d += 'Z';
            }
        }
        return d;
    }

    toSVG(options?: number | PathOptions, pathData?: string): string {
        if (!pathData) {
            pathData = this.toPathData(options);
        }
        let svg = '<path d="' + pathData + '"';
        if (this.fill !== undefined && this.fill !== 'black') {
            if (this.fill === null) {
                svg += ' fill="none"';
            } else {
                svg += ' fill="' + this.fill + '"';
            }
        }
        if (this.stroke) {
            svg += ' stroke="' + this.stroke + '" stroke-width="' + this.strokeWidth + '"';
        }
        svg += '/>';
        return svg;
    }

    toDOMElement(options?: number | PathOptions, pathData?: string): SVGPathElement {
        if (!pathData) {
            pathData = this.toPathData(options);
        }
        const namespace = 'http://www.w3.org/2000/svg';
        const pathElement = document.createElementNS(namespace, 'path') as SVGPathElement;
        pathElement.setAttribute('d', pathData);
        if (this.fill !== undefined && this.fill !== 'black') {
            if (this.fill === null) {
                pathElement.setAttribute('fill', 'none');
            } else {
                pathElement.setAttribute('fill', this.fill);
            }
        }
        if (this.stroke) {
            pathElement.setAttribute('stroke', this.stroke);
            pathElement.setAttribute('stroke-width', this.strokeWidth.toString());
        }
        return pathElement;
    }

    fromSVG(pathData: string | SVGPathElement, options?: PathOptions): this {
        if (typeof SVGPathElement !== 'undefined' && pathData instanceof SVGPathElement) {
            pathData = pathData.getAttribute('d') || '';
        }
        if (typeof pathData !== 'string') return this;

        const opt = createSVGParsingOptions(options);
        this.commands = [];

        const number = '0123456789';
        const supportedCommands = 'MmLlQqCcZzHhVv';
        const sign = '-+';

        let command: { type?: string } = {};
        let buffer: string[] = [''];
        let isUnexpected = false;

        const parseBuffer = (b: string[]) => {
            return b.filter(s => s.length).map(s => {
                let float = parseFloat(s);
                if (opt.decimalPlaces !== undefined) {
                    float = roundDecimal(float, opt.decimalPlaces);
                }
                return float;
            });
        };

        const applyCommand = () => {
            if (command.type === undefined) return;
            const commandType = command.type.toUpperCase();
            const relative = command.type.toUpperCase() !== command.type;
            const parsedBuffer = parseBuffer(buffer);
            buffer = [''];

            if (!parsedBuffer.length && commandType !== 'Z') return;

            const lastCmd = this.commands[this.commands.length - 1];
            let x = lastCmd ? (lastCmd.x || 0) : 0;
            let y = lastCmd ? (lastCmd.y || 0) : 0;

            switch (commandType) {
                case 'M':
                    for (let i = 0; i < parsedBuffer.length; i += 2) {
                        x = (relative ? x : 0) + parsedBuffer[i];
                        y = (relative ? y : 0) + parsedBuffer[i + 1];
                        if (i === 0) {
                            this.moveTo(x, y);
                        } else {
                            this.lineTo(x, y);
                        }
                    }
                    break;
                case 'L':
                    for (let i = 0; i < parsedBuffer.length; i += 2) {
                        x = (relative ? x : 0) + parsedBuffer[i];
                        y = (relative ? y : 0) + parsedBuffer[i + 1];
                        this.lineTo(x, y);
                    }
                    break;
                case 'V':
                    for (let i = 0; i < parsedBuffer.length; i++) {
                        y = (relative ? y : 0) + parsedBuffer[i];
                        this.lineTo(x, y);
                    }
                    break;
                case 'H':
                    for (let i = 0; i < parsedBuffer.length; i++) {
                        x = (relative ? x : 0) + parsedBuffer[i];
                        this.lineTo(x, y);
                    }
                    break;
                case 'C':
                    for (let i = 0; i < parsedBuffer.length; i += 6) {
                        const x1 = (relative ? x : 0) + parsedBuffer[i];
                        const y1 = (relative ? y : 0) + parsedBuffer[i + 1];
                        const x2 = (relative ? x : 0) + parsedBuffer[i + 2];
                        const y2 = (relative ? y : 0) + parsedBuffer[i + 3];
                        x = (relative ? x : 0) + parsedBuffer[i + 4];
                        y = (relative ? y : 0) + parsedBuffer[i + 5];
                        this.bezierCurveTo(x1, y1, x2, y2, x, y);
                    }
                    break;
                case 'Q':
                    for (let i = 0; i < parsedBuffer.length; i += 4) {
                        const x1 = (relative ? x : 0) + parsedBuffer[i];
                        const y1 = (relative ? y : 0) + parsedBuffer[i + 1];
                        x = (relative ? x : 0) + parsedBuffer[i + 2];
                        y = (relative ? y : 0) + parsedBuffer[i + 3];
                        this.quadraticCurveTo(x1, y1, x, y);
                    }
                    break;
                case 'Z':
                    if (!this.commands.length || this.commands[this.commands.length - 1].type !== 'Z') {
                        this.close();
                    }
                    break;
            }
        };

        for (let i = 0; i < pathData.length; i++) {
            const token = pathData.charAt(i);
            const lastBuffer = buffer[buffer.length - 1];
            if (number.indexOf(token) > -1) {
                buffer[buffer.length - 1] += token;
            } else if (sign.indexOf(token) > -1) {
                if (!command.type && !this.commands.length) {
                    command.type = 'L';
                }
                if (token === '-') {
                    if (!command.type || lastBuffer.indexOf('-') > 0) {
                        isUnexpected = true;
                    } else if (lastBuffer.length) {
                        buffer.push('-');
                    } else {
                        buffer[buffer.length - 1] = token;
                    }
                } else {
                    if (!command.type || lastBuffer.length > 0) {
                        isUnexpected = true;
                    }
                }
            } else if (supportedCommands.indexOf(token) > -1) {
                if (command.type) {
                    applyCommand();
                    command = { type: token };
                } else {
                    command.type = token;
                }
            } else if (' ,\t\n\r\f\v'.indexOf(token) > -1) {
                buffer.push('');
            } else if (token === '.') {
                if (!command.type || lastBuffer.indexOf(token) > -1) {
                    isUnexpected = true;
                } else {
                    buffer[buffer.length - 1] += token;
                }
            } else {
                isUnexpected = true;
            }

            if (isUnexpected) {
                throw new Error('Unexpected character: ' + token + ' at offset ' + i);
            }
        }
        applyCommand();

        if (opt.optimize) {
            this.commands = optimizeCommands(this.commands);
        }

        let flipY = opt.flipY;
        let flipYBase = opt.flipYBase;
        if (flipY === true && options?.flipYBase === undefined) {
            const boundingBox = this.getBoundingBox();
            flipYBase = boundingBox.y1 + boundingBox.y2;
        }

        for (let i = 0; i < this.commands.length; i++) {
            const cmd = this.commands[i];
            if (cmd.x !== undefined) cmd.x = opt.x + cmd.x * opt.scale;
            if (cmd.y !== undefined) cmd.y = opt.y + (flipY ? flipYBase - cmd.y : cmd.y) * opt.scale;
            if (cmd.x1 !== undefined) cmd.x1 = opt.x + cmd.x1 * opt.scale;
            if (cmd.y1 !== undefined) cmd.y1 = opt.y + (flipY ? flipYBase - cmd.y1 : cmd.y1) * opt.scale;
            if (cmd.x2 !== undefined) cmd.x2 = opt.x + cmd.x2 * opt.scale;
            if (cmd.y2 !== undefined) cmd.y2 = opt.y + (flipY ? flipYBase - cmd.y2 : cmd.y2) * opt.scale;
        }

        return this;
    }

    static fromSVG(pathData: string | SVGPathElement, options?: PathOptions): Path {
        const newPath = new Path();
        return newPath.fromSVG(pathData, options);
    }
}

export default Path;
