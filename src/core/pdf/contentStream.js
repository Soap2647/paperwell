// PDF içerik akışı (content stream) ayrıştırıcısı.
// Her operatörü, operandlarıyla ve akış içindeki bayt aralığıyla birlikte döndürür;
// böylece düzenleme sırasında yalnızca ilgili operatör yeniden yazılabilir.

const WS = new Uint8Array(256);
[0x00, 0x09, 0x0a, 0x0c, 0x0d, 0x20].forEach((c) => (WS[c] = 1));
const DELIM = new Uint8Array(256);
[0x28, 0x29, 0x3c, 0x3e, 0x5b, 0x5d, 0x7b, 0x7d, 0x2f, 0x25].forEach((c) => (DELIM[c] = 1));

const isRegular = (c) => !WS[c] && !DELIM[c];

/**
 * @typedef {{type:'num', v:number} | {type:'name', v:string} | {type:'str', bytes:Uint8Array, hex:boolean}
 *  | {type:'arr', items:Operand[]} | {type:'dict', entries:Object} | {type:'bool', v:boolean} | {type:'null'}} Operand
 * @typedef {{op:string, args:Operand[], start:number, end:number}} Op
 */

/**
 * @param {Uint8Array} bytes
 * @returns {Op[]}
 */
export function parseContentStream(bytes) {
    const ops = [];
    const len = bytes.length;
    let i = 0;
    let args = [];
    let opStart = -1;

    const skipWs = () => {
        while (i < len) {
            const c = bytes[i];
            if (WS[c]) i++;
            else if (c === 0x25) { // % yorum
                while (i < len && bytes[i] !== 0x0a && bytes[i] !== 0x0d) i++;
            } else break;
        }
    };

    const readLiteralString = () => {
        // i '(' üzerinde
        i++;
        let depth = 1;
        const out = [];
        while (i < len) {
            let c = bytes[i++];
            if (c === 0x5c) { // ters bölü
                c = bytes[i++];
                switch (c) {
                    case 0x6e: out.push(0x0a); break; // n
                    case 0x72: out.push(0x0d); break; // r
                    case 0x74: out.push(0x09); break; // t
                    case 0x62: out.push(0x08); break; // b
                    case 0x66: out.push(0x0c); break; // f
                    case 0x0d: if (bytes[i] === 0x0a) i++; break; // satır devamı
                    case 0x0a: break;
                    default:
                        if (c >= 0x30 && c <= 0x37) { // sekizlik
                            let v = c - 0x30;
                            for (let k = 0; k < 2 && bytes[i] >= 0x30 && bytes[i] <= 0x37; k++) v = v * 8 + (bytes[i++] - 0x30);
                            out.push(v & 0xff);
                        } else {
                            out.push(c);
                        }
                }
            } else if (c === 0x28) {
                depth++;
                out.push(c);
            } else if (c === 0x29) {
                depth--;
                if (depth === 0) break;
                out.push(c);
            } else {
                out.push(c);
            }
        }
        return { type: 'str', bytes: Uint8Array.from(out), hex: false };
    };

    const readHexString = () => {
        i++; // '<'
        const out = [];
        let hi = -1;
        while (i < len && bytes[i] !== 0x3e) {
            const c = bytes[i++];
            let v = -1;
            if (c >= 0x30 && c <= 0x39) v = c - 0x30;
            else if (c >= 0x41 && c <= 0x46) v = c - 0x37;
            else if (c >= 0x61 && c <= 0x66) v = c - 0x57;
            if (v < 0) continue;
            if (hi < 0) hi = v;
            else { out.push(hi * 16 + v); hi = -1; }
        }
        if (hi >= 0) out.push(hi * 16);
        i++; // '>'
        return { type: 'str', bytes: Uint8Array.from(out), hex: true };
    };

    const readName = () => {
        i++; // '/'
        let s = '';
        while (i < len && isRegular(bytes[i])) {
            const c = bytes[i++];
            if (c === 0x23 && i + 1 < len) { // #xx
                s += String.fromCharCode(parseInt(String.fromCharCode(bytes[i], bytes[i + 1]), 16));
                i += 2;
            } else {
                s += String.fromCharCode(c);
            }
        }
        return { type: 'name', v: s };
    };

    const readToken = () => {
        let s = '';
        while (i < len && isRegular(bytes[i])) s += String.fromCharCode(bytes[i++]);
        return s;
    };

    const readObject = () => {
        skipWs();
        const c = bytes[i];
        if (c === 0x28) return readLiteralString();
        if (c === 0x3c) {
            if (bytes[i + 1] === 0x3c) return readDict();
            return readHexString();
        }
        if (c === 0x2f) return readName();
        if (c === 0x5b) {
            i++;
            const items = [];
            for (;;) {
                skipWs();
                if (i >= len) break;
                if (bytes[i] === 0x5d) { i++; break; }
                const o = readObject();
                if (o) items.push(o);
                else i++;
            }
            return { type: 'arr', items };
        }
        const tok = readToken();
        if (!tok) return null;
        return tokenToOperand(tok);
    };

    const readDict = () => {
        i += 2; // '<<'
        const entries = {};
        for (;;) {
            skipWs();
            if (i >= len) break;
            if (bytes[i] === 0x3e && bytes[i + 1] === 0x3e) { i += 2; break; }
            const key = readObject();
            const val = readObject();
            if (key?.type === 'name') entries[key.v] = val;
            else if (!key) i++;
        }
        return { type: 'dict', entries };
    };

    while (i < len) {
        skipWs();
        if (i >= len) break;
        if (opStart < 0) opStart = i;
        const c = bytes[i];

        if (isRegular(c) && !isNumberStart(c)) {
            const tokStart = i;
            const tok = readToken();
            if (tok === 'true' || tok === 'false') { args.push({ type: 'bool', v: tok === 'true' }); continue; }
            if (tok === 'null') { args.push({ type: 'null' }); continue; }

            if (tok === 'BI') {
                // Satır içi görsel: BI <anahtar/değer> ID <ikili veri> EI
                const dict = {};
                for (;;) {
                    skipWs();
                    if (i >= len) break;
                    if (bytes[i] === 0x49 && bytes[i + 1] === 0x44 && !isRegular(bytes[i + 2] ?? 0x20)) { i += 2; break; }
                    const k = readObject();
                    const v = readObject();
                    if (k?.type === 'name') dict[k.v] = v;
                    if (!k) i++;
                }
                i++; // ID sonrası tek boşluk
                // EI'yi bul: önünde ve arkasında boşluk olmalı
                while (i < len) {
                    if (bytes[i] === 0x45 && bytes[i + 1] === 0x49 && WS[bytes[i - 1]] && (i + 2 >= len || !isRegular(bytes[i + 2]))) {
                        i += 2;
                        break;
                    }
                    i++;
                }
                ops.push({ op: 'BI', args: [{ type: 'dict', entries: dict }], start: opStart, end: i });
                args = [];
                opStart = -1;
                continue;
            }

            ops.push({ op: tok, args, start: opStart, end: tokStart + tok.length });
            args = [];
            opStart = -1;
            continue;
        }

        const o = readObject();
        if (o) args.push(o);
        else i++; // tanınmayan bayt
    }

    return ops;
}

function isNumberStart(c) {
    return (c >= 0x30 && c <= 0x39) || c === 0x2b || c === 0x2d || c === 0x2e;
}

function tokenToOperand(tok) {
    const n = Number(tok);
    if (!Number.isNaN(n) && /^[+-]?(\d+\.?\d*|\.\d+)$/.test(tok)) return { type: 'num', v: n };
    if (/^[+-]?\d*\.?\d*$/.test(tok)) return { type: 'num', v: parseFloat(tok) || 0 };
    return { type: 'name', v: tok }; // beklenmeyen; operand gibi davran
}

// ─── Serileştirme ───────────────────────────────────────────────────────────

const enc = new TextEncoder();

export function hexString(bytes) {
    let s = '<';
    for (const b of bytes) s += b.toString(16).padStart(2, '0');
    return s + '>';
}

export function fmtNum(n) {
    if (!Number.isFinite(n)) return '0';
    const r = Math.round(n * 10000) / 10000;
    return String(r === 0 ? 0 : r);
}

export function serializeOperand(o) {
    switch (o.type) {
        case 'num': return fmtNum(o.v);
        case 'name': return '/' + o.v.replace(/[^!-~]|[()<>[\]{}/%#]/g, (ch) => '#' + ch.charCodeAt(0).toString(16).padStart(2, '0'));
        case 'str': return hexString(o.bytes);
        case 'arr': return '[' + o.items.map(serializeOperand).join(' ') + ']';
        case 'dict': return '<<' + Object.entries(o.entries).map(([k, v]) => serializeOperand({ type: 'name', v: k }) + ' ' + serializeOperand(v)).join(' ') + '>>';
        case 'bool': return o.v ? 'true' : 'false';
        default: return 'null';
    }
}

/**
 * Akıştaki bayt aralıklarını yeni metinle değiştirir.
 * @param {Uint8Array} bytes
 * @param {{start:number, end:number, text:string}[]} patches - örtüşmemeli
 */
export function applyPatches(bytes, patches) {
    const sorted = [...patches].sort((a, b) => a.start - b.start);
    const parts = [];
    let pos = 0;
    for (const p of sorted) {
        if (p.start < pos) continue; // örtüşen yamayı atla
        parts.push(bytes.subarray(pos, p.start));
        parts.push(enc.encode(p.text));
        pos = p.end;
    }
    parts.push(bytes.subarray(pos));
    const total = parts.reduce((s, p) => s + p.length, 0);
    const out = new Uint8Array(total);
    let off = 0;
    for (const p of parts) { out.set(p, off); off += p.length; }
    return out;
}
