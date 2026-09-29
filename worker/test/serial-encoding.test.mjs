import test from 'node:test';
import assert from 'node:assert/strict';
import { createSerialDecoder, encodeSerialText, normalizeSerialEncoding } from '../../static/serial/serial-encoding.mjs';
import { GB2312_ROWS } from '../../static/serial/gb2312-table.mjs';

const bytes = (hex) => Uint8Array.from(hex.match(/../g) || [], (pair) => parseInt(pair, 16));

test('UTF-8 remains the default and invalid saved encoding names fall back safely', () => {
  for (const input of [undefined, null, '', 'GB2312', 'gbk', 'utf-16', {}, []]) {
    assert.equal(normalizeSerialEncoding(input), 'utf-8');
  }
  assert.equal(normalizeSerialEncoding('utf-8'), 'utf-8');
  assert.equal(normalizeSerialEncoding('gb2312'), 'gb2312');
  assert.equal(createSerialDecoder().encoding, 'utf-8');
  assert.throws(() => createSerialDecoder('gbk'), /不支持/);
  assert.throws(() => encodeSerialText('hello', 'gbk'), /不支持/);
});

test('UTF-8 text bytes and streamed Unicode decoding remain unchanged', () => {
  const text = 'ASCII 你好😀\r\n';
  const encoded = encodeSerialText(text);
  assert.deepEqual(encoded, new TextEncoder().encode(text));
  const decoder = createSerialDecoder();
  let actual = '';
  for (const byte of encoded) actual += decoder.decode(Uint8Array.of(byte), { stream: true });
  actual += decoder.decode();
  assert.equal(actual, text);
  assert.equal(createSerialDecoder().decode(bytes('e4')), '\ufffd');
});

test('GB2312 uses known Chinese, ASCII, symbols and standard-specific byte vectors', () => {
  for (const [text, hex] of [
    ['你好', 'c4e3bac3'],
    ['中文', 'd6d0cec4'],
    ['ASCII\0\r\n', '4153434949000d0a'],
    ['￥①α', 'a3a4a2d9a6c1'],
    ['　、。', 'a1a1a1a2a1a3'],
    // GBK changes A1A4 and A1AA; strict GB2312 preserves these original symbols.
    ['・―～', 'a1a4a1aaa1ab']
  ]) {
    assert.deepEqual(encodeSerialText(text, 'gb2312'), bytes(hex), text);
    assert.equal(createSerialDecoder('gb2312').decode(bytes(hex)), text);
  }
});

test('GB2312 rejects unsupported characters and GBK-only extensions before returning bytes', () => {
  for (const text of ['你好😀', '€', '丂', '·', '—', '\ud800', '\udfff']) {
    assert.throws(() => encodeSerialText(text, 'gb2312'), /GB2312 无法编码.*UTF-8/);
  }
  assert.equal(createSerialDecoder('gb2312').decode(bytes('8140')), '\ufffd@');
  assert.equal(createSerialDecoder('gb2312').decode(bytes('80')), '\ufffd');
});

test('GB2312 decoder preserves a split pair at every chunk boundary', () => {
  const text = '你好ASCII￥①α\r\n';
  const encoded = encodeSerialText(text, 'gb2312');
  for (let split = 0; split <= encoded.length; split += 1) {
    const decoder = createSerialDecoder('gb2312');
    const result = decoder.decode(encoded.slice(0, split), { stream: true })
      + decoder.decode(encoded.slice(split), { stream: true }) + decoder.decode();
    assert.equal(result, text, `split at byte ${split}`);
  }
  const decoder = createSerialDecoder('gb2312');
  assert.equal([...encoded].map((byte) => decoder.decode(Uint8Array.of(byte), { stream: true })).join('') + decoder.decode(), text);
});

test('GB2312 replaces malformed pairs while preserving subsequent ASCII and valid pairs', () => {
  for (const [hex, expected] of [
    ['a141', '\ufffdA'],
    ['a1ff', '\ufffd\ufffd'],
    ['a2a1', '\ufffd\ufffd'],
    ['a2a1a1', '\ufffd　'],
    ['ff41c4e3bac3', '\ufffdA你好']
  ]) {
    assert.equal(createSerialDecoder('gb2312').decode(bytes(hex)), expected);
    const decoder = createSerialDecoder('gb2312');
    const result = [...bytes(hex)].map((byte) => decoder.decode(Uint8Array.of(byte), { stream: true })).join('') + decoder.decode();
    assert.equal(result, expected, `streamed ${hex}`);
  }
});

test('finishing a GB2312 stream exposes an incomplete lead and resets decoding state', () => {
  const decoder = createSerialDecoder('gb2312');
  assert.equal(decoder.decode(bytes('c4'), { stream: true }), '');
  assert.equal(decoder.decode(undefined, { stream: true }), '');
  assert.equal(decoder.decode(), '\ufffd');
  assert.equal(decoder.decode(), '');
  assert.equal(decoder.decode(bytes('c4e3')), '你');
  assert.equal(decoder.decode(bytes('c4')), '\ufffd');
  assert.equal(decoder.decode(bytes('e3')), '\ufffd');
});

test('GB2312 decoding respects byte-view offsets and accepts an ArrayBuffer', () => {
  const backing = bytes('ffc4e3ff');
  assert.equal(createSerialDecoder('gb2312').decode(backing.subarray(1, 3)), '你');
  assert.equal(createSerialDecoder('gb2312').decode(new DataView(backing.buffer, 1, 2)), '你');
  assert.equal(createSerialDecoder('gb2312').decode(bytes('c4e3').buffer), '你');
  assert.throws(() => createSerialDecoder('gb2312').decode('你好'), /字节数组/);
});

test('the complete mapping contains 7,445 distinct characters and round-trips every assigned pair', () => {
  assert.equal(GB2312_ROWS.length, 87);
  const characters = new Set();
  const encoded = [];
  let text = '';
  GB2312_ROWS.forEach((row, lead) => {
    assert.equal(row.length, 94);
    [...row].forEach((character, trail) => {
      if (character === '\ufffd') return;
      characters.add(character);
      encoded.push(lead + 0xa1, trail + 0xa1);
      text += character;
    });
  });
  assert.equal(characters.size, 7445);
  assert.equal(text.length, 7445);
  assert.deepEqual(encodeSerialText(text, 'gb2312'), Uint8Array.from(encoded));
  assert.equal(createSerialDecoder('gb2312').decode(Uint8Array.from(encoded)), text);
});
