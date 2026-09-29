/** Strict GB2312 and native UTF-8 codecs for serial text; see NOTICE.md. */
import { GB2312_ROWS } from './gb2312-table.mjs?v=20260929-1';

export const SERIAL_ENCODINGS = Object.freeze(['utf-8', 'gb2312']);
const utf8Encoder = new TextEncoder();
const replacement = '\ufffd';
let gb2312Encoder;

export function normalizeSerialEncoding(value) {
  return SERIAL_ENCODINGS.includes(value) ? value : 'utf-8';
}

function assertEncoding(encoding) {
  if (!SERIAL_ENCODINGS.includes(encoding)) throw new RangeError('不支持的串口文本编码。');
}

function encodingMap() {
  if (!gb2312Encoder) {
    gb2312Encoder = new Map();
    GB2312_ROWS.forEach((row, lead) => {
      for (let trail = 0; trail < row.length; trail += 1) {
        if (row[trail] !== replacement) gb2312Encoder.set(row[trail], ((lead + 0xa1) << 8) | (trail + 0xa1));
      }
    });
  }
  return gb2312Encoder;
}

export function encodeSerialText(text, encoding = 'utf-8') {
  assertEncoding(encoding);
  if (typeof text !== 'string') throw new TypeError('发送内容必须为文本。');
  if (encoding === 'utf-8') return utf8Encoder.encode(text);
  const map = encodingMap();
  const bytes = new Uint8Array(text.length * 2);
  let length = 0;
  for (const character of text) {
    const point = character.codePointAt(0);
    if (point <= 0x7f) bytes[length++] = point;
    else {
      const pair = map.get(character);
      if (pair === undefined) {
        const label = `U+${point.toString(16).toUpperCase().padStart(4, '0')}`;
        throw new Error(`GB2312 无法编码字符“${character}”（${label}），请修改内容或切换为 UTF-8。`);
      }
      bytes[length++] = pair >> 8;
      bytes[length++] = pair & 0xff;
    }
  }
  return bytes.slice(0, length);
}

function byteView(input) {
  if (input === undefined) return new Uint8Array();
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  if (ArrayBuffer.isView(input)) return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  throw new TypeError('解码数据必须为字节数组。');
}

class GB2312Decoder {
  constructor() {
    this.encoding = 'gb2312';
    this.pendingLead = null;
  }

  decode(input, { stream = false } = {}) {
    const bytes = byteView(input);
    const output = [];
    for (let index = 0; index < bytes.length; index += 1) {
      const byte = bytes[index];
      if (this.pendingLead !== null) {
        const lead = this.pendingLead;
        this.pendingLead = null;
        const character = byte >= 0xa1 && byte <= 0xfe ? GB2312_ROWS[lead - 0xa1][byte - 0xa1] : replacement;
        if (character !== replacement) {
          output.push(character);
          continue;
        }
        output.push(replacement);
        // An invalid/unassigned pair consumes only its lead. Reprocess the
        // current byte so following ASCII and valid pairs survive corruption.
      }
      if (byte <= 0x7f) output.push(String.fromCharCode(byte));
      else if (byte >= 0xa1 && byte <= 0xf7) this.pendingLead = byte;
      else output.push(replacement);
    }
    if (!stream && this.pendingLead !== null) {
      output.push(replacement);
      this.pendingLead = null;
    }
    return output.join('');
  }
}

export function createSerialDecoder(encoding = 'utf-8') {
  assertEncoding(encoding);
  // Browsers treat the label "gb2312" as GBK. Use the strict table for both
  // directions so symbols and unsupported extensions have identical semantics.
  return encoding === 'gb2312' ? new GB2312Decoder() : new TextDecoder('utf-8');
}
