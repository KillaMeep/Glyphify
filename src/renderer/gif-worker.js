/**
 * Web Worker for GIF Encoding
 * Runs GIF encoding in a separate thread to keep UI responsive
 */

// Import encoding classes into worker scope
self.importScripts = self.importScripts || function() {};

// ============================================
// ByteArray for GIF encoding
// ============================================
class ByteArray {
    constructor() {
        this.data = [];
    }

    writeByte(val) {
        this.data.push(val);
    }

    writeBytes(array, offset = 0, length) {
        length = length || array.length;
        for (let i = offset; i < length; i++) {
            this.writeByte(array[i]);
        }
    }

    getData() {
        return new Uint8Array(this.data);
    }
}

// ============================================
// NeuQuant Neural-Net Quantization Algorithm
// ============================================
class NeuQuant {
    constructor(pixels, samplefac) {
        this.netsize = 256;
        this.prime1 = 499;
        this.prime2 = 491;
        this.prime3 = 487;
        this.prime4 = 503;
        this.minpicturebytes = 3 * this.prime4;
        
        this.maxnetpos = this.netsize - 1;
        this.netbiasshift = 4;
        this.ncycles = 100;
        this.intbiasshift = 16;
        this.intbias = 1 << this.intbiasshift;
        this.gammashift = 10;
        this.gamma = 1 << this.gammashift;
        this.betashift = 10;
        this.beta = this.intbias >> this.betashift;
        this.betagamma = this.intbias << (this.gammashift - this.betashift);
        
        this.initrad = this.netsize >> 3;
        this.radiusbiasshift = 6;
        this.radiusbias = 1 << this.radiusbiasshift;
        this.initradius = this.initrad * this.radiusbias;
        this.radiusdec = 30;
        
        this.alphabiasshift = 10;
        this.initalpha = 1 << this.alphabiasshift;
        
        this.radbiasshift = 8;
        this.radbias = 1 << this.radbiasshift;
        this.alpharadbshift = this.alphabiasshift + this.radbiasshift;
        this.alpharadbias = 1 << this.alpharadbshift;
        
        this.thepicture = pixels;
        this.lengthcount = pixels.length;
        this.samplefac = samplefac;
        
        this.network = [];
        this.netindex = new Int32Array(256);
        this.bias = new Int32Array(this.netsize);
        this.freq = new Int32Array(this.netsize);
        this.radpower = new Int32Array(this.netsize >> 3);
        
        for (let i = 0; i < this.netsize; i++) {
            this.network[i] = new Float64Array([
                (i << (this.netbiasshift + 8)) / this.netsize,
                (i << (this.netbiasshift + 8)) / this.netsize,
                (i << (this.netbiasshift + 8)) / this.netsize,
                0
            ]);
            this.freq[i] = this.intbias / this.netsize;
            this.bias[i] = 0;
        }
    }

    process() {
        this.learn();
        this.unbiasnet();
        this.inxbuild();
        return this.colorMap();
    }

    colorMap() {
        const map = [];
        const index = [];
        
        for (let i = 0; i < this.netsize; i++) {
            index[this.network[i][3]] = i;
        }
        
        for (let i = 0; i < this.netsize; i++) {
            const j = index[i];
            map.push(this.network[j][0]);
            map.push(this.network[j][1]);
            map.push(this.network[j][2]);
        }
        
        return map;
    }

    inxbuild() {
        let previouscol = 0;
        let startpos = 0;
        
        for (let i = 0; i < this.netsize; i++) {
            const p = this.network[i];
            let smallpos = i;
            let smallval = p[1];
            
            for (let j = i + 1; j < this.netsize; j++) {
                const q = this.network[j];
                if (q[1] < smallval) {
                    smallpos = j;
                    smallval = q[1];
                }
            }
            
            const q = this.network[smallpos];
            if (i !== smallpos) {
                [p[0], q[0]] = [q[0], p[0]];
                [p[1], q[1]] = [q[1], p[1]];
                [p[2], q[2]] = [q[2], p[2]];
                [p[3], q[3]] = [q[3], p[3]];
            }
            
            if (smallval !== previouscol) {
                this.netindex[previouscol] = (startpos + i) >> 1;
                for (let j = previouscol + 1; j < smallval; j++) {
                    this.netindex[j] = i;
                }
                previouscol = smallval;
                startpos = i;
            }
        }
        
        this.netindex[previouscol] = (startpos + this.maxnetpos) >> 1;
        for (let j = previouscol + 1; j < 256; j++) {
            this.netindex[j] = this.maxnetpos;
        }
    }

    learn() {
        if (this.lengthcount < this.minpicturebytes) {
            this.samplefac = 1;
        }
        
        const alphadec = 30 + ((this.samplefac - 1) / 3);
        const samplepixels = this.lengthcount / (3 * this.samplefac);
        let delta = ~~(samplepixels / this.ncycles);
        let alpha = this.initalpha;
        let radius = this.initradius;
        
        let rad = radius >> this.radiusbiasshift;
        if (rad <= 1) rad = 0;
        
        for (let i = 0; i < rad; i++) {
            this.radpower[i] = alpha * (((rad * rad - i * i) * this.radbias) / (rad * rad));
        }
        
        let step;
        if (this.lengthcount < this.minpicturebytes) {
            step = 3;
        } else if (this.lengthcount % this.prime1 !== 0) {
            step = 3 * this.prime1;
        } else if (this.lengthcount % this.prime2 !== 0) {
            step = 3 * this.prime2;
        } else if (this.lengthcount % this.prime3 !== 0) {
            step = 3 * this.prime3;
        } else {
            step = 3 * this.prime4;
        }
        
        let pix = 0;
        
        for (let i = 0; i < samplepixels;) {
            const r = (this.thepicture[pix] & 0xff) << this.netbiasshift;
            const g = (this.thepicture[pix + 1] & 0xff) << this.netbiasshift;
            const b = (this.thepicture[pix + 2] & 0xff) << this.netbiasshift;
            
            const j = this.contest(r, g, b);
            this.altersingle(alpha, j, r, g, b);
            
            if (rad !== 0) {
                this.alterneigh(rad, j, r, g, b);
            }
            
            pix += step;
            if (pix >= this.lengthcount) {
                pix -= this.lengthcount;
            }
            
            i++;
            
            if (delta === 0) delta = 1;
            if (i % delta === 0) {
                alpha -= alpha / alphadec;
                radius -= radius / this.radiusdec;
                rad = radius >> this.radiusbiasshift;
                if (rad <= 1) rad = 0;
                
                for (let j = 0; j < rad; j++) {
                    this.radpower[j] = alpha * (((rad * rad - j * j) * this.radbias) / (rad * rad));
                }
            }
        }
    }

    contest(r, g, b) {
        let bestd = ~(1 << 31);
        let bestbiasd = bestd;
        let bestpos = -1;
        let bestbiaspos = bestpos;
        
        for (let i = 0; i < this.netsize; i++) {
            const n = this.network[i];
            const dist = Math.abs(n[0] - r) + Math.abs(n[1] - g) + Math.abs(n[2] - b);
            
            if (dist < bestd) {
                bestd = dist;
                bestpos = i;
            }
            
            const biasdist = dist - ((this.bias[i]) >> (this.intbiasshift - this.netbiasshift));
            if (biasdist < bestbiasd) {
                bestbiasd = biasdist;
                bestbiaspos = i;
            }
            
            const betafreq = this.freq[i] >> this.betashift;
            this.freq[i] -= betafreq;
            this.bias[i] += betafreq << this.gammashift;
        }
        
        this.freq[bestpos] += this.beta;
        this.bias[bestpos] -= this.betagamma;
        
        return bestbiaspos;
    }

    altersingle(alpha, i, r, g, b) {
        const n = this.network[i];
        n[0] -= (alpha * (n[0] - r)) / this.initalpha;
        n[1] -= (alpha * (n[1] - g)) / this.initalpha;
        n[2] -= (alpha * (n[2] - b)) / this.initalpha;
    }

    alterneigh(rad, i, r, g, b) {
        const lo = Math.max(i - rad, -1);
        const hi = Math.min(i + rad, this.netsize);
        
        let j = i + 1;
        let k = i - 1;
        let m = 1;
        
        while (j < hi || k > lo) {
            const a = this.radpower[m++];
            
            if (j < hi) {
                const n = this.network[j++];
                n[0] -= (a * (n[0] - r)) / this.alpharadbias;
                n[1] -= (a * (n[1] - g)) / this.alpharadbias;
                n[2] -= (a * (n[2] - b)) / this.alpharadbias;
            }
            
            if (k > lo) {
                const n = this.network[k--];
                n[0] -= (a * (n[0] - r)) / this.alpharadbias;
                n[1] -= (a * (n[1] - g)) / this.alpharadbias;
                n[2] -= (a * (n[2] - b)) / this.alpharadbias;
            }
        }
    }

    unbiasnet() {
        for (let i = 0; i < this.netsize; i++) {
            this.network[i][0] >>= this.netbiasshift;
            this.network[i][1] >>= this.netbiasshift;
            this.network[i][2] >>= this.netbiasshift;
            this.network[i][3] = i;
        }
    }

    map(r, g, b) {
        let bestd = 1000;
        let best = -1;
        let i = this.netindex[g];
        let j = i - 1;
        
        while (i < this.netsize || j >= 0) {
            if (i < this.netsize) {
                const n = this.network[i];
                let dist = n[1] - g;
                if (dist >= bestd) {
                    i = this.netsize;
                } else {
                    i++;
                    if (dist < 0) dist = -dist;
                    let a = n[0] - r;
                    if (a < 0) a = -a;
                    dist += a;
                    if (dist < bestd) {
                        a = n[2] - b;
                        if (a < 0) a = -a;
                        dist += a;
                        if (dist < bestd) {
                            bestd = dist;
                            best = n[3];
                        }
                    }
                }
            }
            
            if (j >= 0) {
                const n = this.network[j];
                let dist = g - n[1];
                if (dist >= bestd) {
                    j = -1;
                } else {
                    j--;
                    if (dist < 0) dist = -dist;
                    let a = n[0] - r;
                    if (a < 0) a = -a;
                    dist += a;
                    if (dist < bestd) {
                        a = n[2] - b;
                        if (a < 0) a = -a;
                        dist += a;
                        if (dist < bestd) {
                            bestd = dist;
                            best = n[3];
                        }
                    }
                }
            }
        }
        
        return best;
    }
}

// ============================================
// LZW Encoder for GIF
// ============================================
class LZWEncoder {
    constructor(width, height, pixels, colorDepth) {
        this.width = width;
        this.height = height;
        this.pixels = pixels;
        this.colorDepth = Math.max(2, colorDepth);
        this.initCodeSize = this.colorDepth;
        this.accum = new Uint8Array(256);
        this.htab = new Int32Array(5003);
        this.codetab = new Int32Array(5003);
        this.cur_accum = 0;
        this.cur_bits = 0;
        this.a_count = 0;
        this.remaining = 0;
        this.curPixel = 0;
        
        this.BITS = 12;
        this.HSIZE = 5003;
        this.masks = [
            0x0000, 0x0001, 0x0003, 0x0007, 0x000F, 0x001F,
            0x003F, 0x007F, 0x00FF, 0x01FF, 0x03FF, 0x07FF,
            0x0FFF, 0x1FFF, 0x3FFF, 0x7FFF, 0xFFFF
        ];
    }

    encode(outs) {
        outs.writeByte(this.initCodeSize);
        this.remaining = this.width * this.height;
        this.curPixel = 0;
        this.compress(this.initCodeSize + 1, outs);
        outs.writeByte(0);
    }

    compress(init_bits, outs) {
        let fcode, c, i, ent, disp, hsize_reg, hshift;
        
        const g_init_bits = init_bits;
        let g_bits = g_init_bits;
        let g_maxcode = (1 << g_bits) - 1;
        
        const ClearCode = 1 << (init_bits - 1);
        const EOFCode = ClearCode + 1;
        let free_ent = ClearCode + 2;
        
        this.a_count = 0;
        
        ent = this.nextPixel();
        
        hshift = 0;
        for (fcode = this.HSIZE; fcode < 65536; fcode *= 2) {
            hshift++;
        }
        hshift = 8 - hshift;
        hsize_reg = this.HSIZE;
        
        for (i = 0; i < hsize_reg; i++) {
            this.htab[i] = -1;
        }
        
        this.output(ClearCode, g_bits, outs);
        
        outer: while ((c = this.nextPixel()) !== -1) {
            fcode = (c << this.BITS) + ent;
            i = (c << hshift) ^ ent;
            
            if (this.htab[i] === fcode) {
                ent = this.codetab[i];
                continue;
            } else if (this.htab[i] >= 0) {
                disp = hsize_reg - i;
                if (i === 0) disp = 1;
                
                do {
                    if ((i -= disp) < 0) i += hsize_reg;
                    if (this.htab[i] === fcode) {
                        ent = this.codetab[i];
                        continue outer;
                    }
                } while (this.htab[i] >= 0);
            }
            
            this.output(ent, g_bits, outs);
            ent = c;
            
            if (free_ent < (1 << this.BITS)) {
                this.codetab[i] = free_ent++;
                this.htab[i] = fcode;
            } else {
                for (i = 0; i < this.HSIZE; i++) {
                    this.htab[i] = -1;
                }
                free_ent = ClearCode + 2;
                this.output(ClearCode, g_bits, outs);
                g_bits = g_init_bits;
                g_maxcode = (1 << g_bits) - 1;
            }
            
            if (free_ent > g_maxcode) {
                g_bits++;
                if (g_bits > this.BITS) {
                    g_bits = this.BITS;
                }
                g_maxcode = (1 << g_bits) - 1;
            }
        }
        
        this.output(ent, g_bits, outs);
        this.output(EOFCode, g_bits, outs);
    }

    output(code, bits, outs) {
        this.cur_accum &= this.masks[this.cur_bits];
        
        if (this.cur_bits > 0) {
            this.cur_accum |= code << this.cur_bits;
        } else {
            this.cur_accum = code;
        }
        
        this.cur_bits += bits;
        
        while (this.cur_bits >= 8) {
            this.char_out(this.cur_accum & 0xff, outs);
            this.cur_accum >>= 8;
            this.cur_bits -= 8;
        }
        
        if (this.a_count >= 254) {
            this.flush_char(outs);
        }
    }

    char_out(c, outs) {
        this.accum[this.a_count++] = c;
    }

    flush_char(outs) {
        if (this.a_count > 0) {
            outs.writeByte(this.a_count);
            outs.writeBytes(this.accum, 0, this.a_count);
            this.a_count = 0;
        }
    }

    nextPixel() {
        if (this.remaining === 0) return -1;
        this.remaining--;
        return this.pixels[this.curPixel++] & 0xff;
    }
}

// ============================================
// GIF Encoder
// ============================================
class GIFEncoder {
    constructor(width, height) {
        this.width = ~~width;
        this.height = ~~height;
        this.transparent = null;
        this.transIndex = 0;
        this.repeat = 0;
        this.delay = 0;
        this.image = null;
        this.pixels = null;
        this.indexedPixels = null;
        this.colorDepth = null;
        this.colorTab = null;
        this.usedEntry = [];
        this.palSize = 7;
        this.dispose = -1;
        this.firstFrame = true;
        this.sample = 10;
        this.out = new ByteArray();
    }

    setDelay(ms) {
        this.delay = Math.round(ms / 10);
    }

    setRepeat(iter) {
        this.repeat = iter;
    }

    setQuality(quality) {
        if (quality < 1) quality = 1;
        this.sample = quality;
    }

    addFrame(imageData) {
        this.image = imageData;
        this.getImagePixels();
        this.analyzePixels();
        
        if (this.firstFrame) {
            this.writeLSD();
            this.writePalette();
            if (this.repeat >= 0) {
                this.writeNetscapeExt();
            }
        }
        
        this.writeGraphicCtrlExt();
        this.writeImageDesc();
        
        if (!this.firstFrame) {
            this.writePalette();
        }
        
        this.writePixels();
        this.firstFrame = false;
    }

    finish() {
        this.out.writeByte(0x3b);
    }

    stream() {
        return this.out;
    }

    getImagePixels() {
        const w = this.width;
        const h = this.height;
        this.pixels = new Uint8Array(w * h * 3);
        
        const data = this.image;
        let count = 0;
        
        for (let i = 0; i < h; i++) {
            for (let j = 0; j < w; j++) {
                const b = (i * w * 4) + j * 4;
                this.pixels[count++] = data[b];
                this.pixels[count++] = data[b + 1];
                this.pixels[count++] = data[b + 2];
            }
        }
    }

    analyzePixels() {
        const len = this.pixels.length;
        const nPix = len / 3;
        
        this.indexedPixels = new Uint8Array(nPix);
        
        // Always use NeuQuant for proper color quantization
        // Sample rate: 10 = good quality/speed balance for ASCII art
        console.log('[GIF Worker] Using NeuQuant color quantization');
        const nq = new NeuQuant(this.pixels, this.sample || 10);
        this.colorTab = nq.process();
        
        // Simple pixel mapping
        const width = this.width;
        const height = this.height;
        let k = 0;
        
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const r = this.pixels[k] & 0xff;
                const g = this.pixels[k + 1] & 0xff;
                const b = this.pixels[k + 2] & 0xff;
                
                const index = nq.map(r, g, b);
                this.usedEntry[index] = true;
                this.indexedPixels[y * width + x] = index;
                k += 3;
            }
        }
        
        this.pixels = null;
        this.colorDepth = 8;
        this.palSize = 7;
    }

    writeLSD() {
        this.writeString('GIF89a');
        this.writeShort(this.width);
        this.writeShort(this.height);
        this.out.writeByte(0x80 | 0x70 | 0x00 | this.palSize);
        this.out.writeByte(0);
        this.out.writeByte(0);
    }

    writePalette() {
        this.out.writeBytes(this.colorTab);
        const n = (3 * 256) - this.colorTab.length;
        for (let i = 0; i < n; i++) {
            this.out.writeByte(0);
        }
    }

    writeNetscapeExt() {
        this.out.writeByte(0x21);
        this.out.writeByte(0xff);
        this.out.writeByte(11);
        this.writeString('NETSCAPE2.0');
        this.out.writeByte(3);
        this.out.writeByte(1);
        this.writeShort(this.repeat);
        this.out.writeByte(0);
    }

    writeGraphicCtrlExt() {
        this.out.writeByte(0x21);
        this.out.writeByte(0xf9);
        this.out.writeByte(4);
        this.out.writeByte(0);
        this.writeShort(this.delay);
        this.out.writeByte(0);
        this.out.writeByte(0);
    }

    writeImageDesc() {
        this.out.writeByte(0x2c);
        this.writeShort(0);
        this.writeShort(0);
        this.writeShort(this.width);
        this.writeShort(this.height);
        
        if (this.firstFrame) {
            this.out.writeByte(0);
        } else {
            this.out.writeByte(0x80 | 0 | 0 | 0 | this.palSize);
        }
    }

    writePixels() {
        const enc = new LZWEncoder(this.width, this.height, this.indexedPixels, this.colorDepth);
        enc.encode(this.out);
    }

    writeShort(value) {
        this.out.writeByte(value & 0xff);
        this.out.writeByte((value >> 8) & 0xff);
    }

    writeString(s) {
        for (let i = 0; i < s.length; i++) {
            this.out.writeByte(s.charCodeAt(i));
        }
    }
}

// ============================================
// Worker Message Handler - Optimized Batch Mode
// ============================================
let encoder = null;
let totalFrames = 0;
let processedFrames = 0;
let width = 0;
let height = 0;

self.onmessage = function(e) {
    try {
        if (e.data.type === 'init') {
            // Initialize encoder with validated quality
            const { width: w, height: h, quality, repeat, totalFrames: total, transparent } = e.data;
            totalFrames = total;
            processedFrames = 0;
            width = w;
            height = h;
            
            encoder = new GIFEncoder(width, height);
            encoder.setRepeat(repeat !== undefined ? repeat : 0);
            
            // Clamp quality to valid range (1-30, lower = better but slower)
            const clampedQuality = Math.max(1, Math.min(30, quality || 10));
            // Increase quality value to favor speed (higher = faster) while staying in valid range
            const fastQuality = Math.min(30, Math.max(1, Math.round(clampedQuality * 1.8)));
            encoder.setQuality(fastQuality);
            // Disable dithering and use a global palette derived from the first frame to speed up subsequent frames,
            // but guard in case the worker's GIFEncoder implementation does not support these helpers.
            if (typeof encoder.setDither === 'function') {
                encoder.setDither(false);
            }
            if (typeof encoder.setGlobalPalette === 'function') {
                encoder.setGlobalPalette(true);
            }
            
            if (transparent !== null && transparent !== undefined) {
                encoder.setTransparent(transparent);
            }
            
            console.log(`[GIF Worker] Initialized: ${width}x${height}, quality=${fastQuality}, frames=${totalFrames}, dither=false, globalPalette=true`);
            
            // Signal ready for frames
            self.postMessage({ type: 'ready' });
            
        } else if (e.data.type === 'frame') {
            // Process single frame (backward compatibility)
            if (!encoder) {
                throw new Error('Encoder not initialized');
            }
            
            const { data, delay } = e.data;
            encoder.setDelay(delay || 100);
            encoder.addFrame(data);
            
            processedFrames++;
            
            // Send progress update
            self.postMessage({
                type: 'progress',
                progress: processedFrames / totalFrames
            });
            
        } else if (e.data.type === 'frames') {
            // Process batch of frames (optimized)
            if (!encoder) {
                throw new Error('Encoder not initialized');
            }
            
            const { frames } = e.data;
            
            for (const frame of frames) {
                encoder.setDelay(frame.delay || 100);
                encoder.addFrame(frame.data);
                processedFrames++;
            }
            
            // Send progress update after batch
            self.postMessage({
                type: 'progress',
                progress: processedFrames / totalFrames
            });
            
        } else if (e.data.type === 'finish') {
            // Finish encoding and send result
            if (!encoder) {
                throw new Error('Encoder not initialized');
            }
            
            console.log(`[GIF Worker] Finishing encoding: ${processedFrames} frames processed`);
            
            encoder.finish();
            
            // Get the encoded GIF data
            const data = encoder.stream().getData();
            
            console.log(`[GIF Worker] Encoding complete: ${data.length} bytes`);
            
            // Validate GIF header
            if (data.length < 6 || String.fromCharCode(...data.slice(0, 3)) !== 'GIF') {
                throw new Error('Invalid GIF data generated');
            }
            
            // Send the result back
            self.postMessage({
                type: 'complete',
                data: data.buffer
            }, [data.buffer]); // Transfer buffer ownership
            
            // Clean up
            encoder = null;
            totalFrames = 0;
            processedFrames = 0;
        } else if (e.data.type === 'abort') {
            console.log('[GIF Worker] Abort requested');
            // Try to stop encoding cleanly
            encoder = null;
            totalFrames = 0;
            processedFrames = 0;
            self.postMessage({ type: 'error', error: 'Aborted by user' });
        }
        
    } catch (error) {
        console.error('[GIF Worker] Error:', error);
        self.postMessage({
            type: 'error',
            error: error.message || 'Unknown error in GIF worker'
        });
    }
};
