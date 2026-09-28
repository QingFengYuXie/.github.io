/**
 * Serial lifecycle adapted for 我的 OS from itldg/web-serial-debug (c0fc58b9).
 * Upstream is licensed under Apache-2.0; see LICENSE and NOTICE.md.
 * This module owns stream locks so UI changes cannot race an open connection.
 */

export const DEFAULT_SERIAL_OPTIONS = Object.freeze({
  baudRate: 115200,
  dataBits: 8,
  stopBits: 1,
  parity: 'none',
  bufferSize: 1024,
  flowControl: 'none'
});

export function validateSerialOptions(input = DEFAULT_SERIAL_OPTIONS) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError('串口参数无效。');
  }
  const options = { ...DEFAULT_SERIAL_OPTIONS, ...input };
  for (const key of ['baudRate', 'dataBits', 'stopBits', 'bufferSize']) {
    const value = options[key];
    if (!['string', 'number'].includes(typeof value) || String(value).trim() === '') {
      throw new TypeError('串口参数必须为整数。');
    }
    options[key] = Number(value);
    if (!Number.isSafeInteger(options[key])) throw new TypeError('串口参数必须为整数。');
  }
  if (options.baudRate < 1 || options.baudRate > 0xffffffff) throw new RangeError('波特率必须为有效的正整数。');
  if (![7, 8].includes(options.dataBits)) throw new RangeError('数据位只支持 7 或 8。');
  if (![1, 2].includes(options.stopBits)) throw new RangeError('停止位只支持 1 或 2。');
  if (options.bufferSize < 1 || options.bufferSize >= 16 * 1024 * 1024) throw new RangeError('缓冲区必须大于 0 且小于 16 MB。');
  if (!['none', 'even', 'odd'].includes(options.parity)) throw new RangeError('校验位无效。');
  if (!['none', 'hardware'].includes(options.flowControl)) throw new RangeError('流控制无效。');
  return Object.fromEntries(Object.keys(DEFAULT_SERIAL_OPTIONS).map((key) => [key, options[key]]));
}

function aborted() {
  return new DOMException('串口连接已改变，已取消待发送数据。', 'AbortError');
}

function sameOptions(left, right) {
  return Object.keys(DEFAULT_SERIAL_OPTIONS).every((key) => left[key] === right[key]);
}

export class SerialController {
  constructor({ serial, onState = () => {}, onData = () => {}, onSent = () => {}, onError = () => {} } = {}) {
    this.serial = serial;
    this._callbacks = { onState, onData, onSent, onError };
    this._state = 'disconnected';
    this._port = null;
    this._options = DEFAULT_SERIAL_OPTIONS;
    this._session = null;
    this._operations = Promise.resolve();
    this._desiredOpen = false;
    this._disposed = false;
    this._revision = 0;
    this._onDisconnect = (event) => {
      const port = event.port || event.target;
      if (this._disposed || port !== this.port) return;
      this._invalidate();
      this._enqueue(async () => {
        if (this.port === port) await this._close();
      }).catch(() => {});
    };
    this._onConnect = (event) => {
      const port = event.port || event.target;
      if (this._disposed || port !== this.port || !this._desiredOpen) return;
      this._enqueue(async () => {
        if (!this._disposed && this.port === port && this._desiredOpen && !this._session) {
          await this._open(this._revision, true);
        }
      }).catch(() => {});
    };
    serial?.addEventListener('disconnect', this._onDisconnect);
    serial?.addEventListener('connect', this._onConnect);
  }

  get state() { return this._state; }
  get port() { return this._port; }
  get options() { return this._options; }

  _notify(name, value) {
    // A view callback must never strand a serial lock or break the read loop.
    try { this._callbacks[name](value); } catch (error) { console.error('串口页面回调失败', error); }
  }

  _report(error) {
    this._notify('onError', error instanceof Error ? error : new Error(String(error)));
  }

  _setState(state) {
    this._state = state;
    this._notify('onState', { state, port: this.port });
  }

  _assertUsable() {
    if (this._disposed) throw new Error('串口终端已关闭。');
  }

  _enqueue(operation) {
    const result = this._operations.then(operation);
    this._operations = result.catch(() => {});
    return result;
  }

  _invalidate() {
    if (this._session) this._session.invalidated = true;
  }

  async selectPort(port) {
    this._assertUsable();
    if (port !== null && (!port || typeof port.open !== 'function' || typeof port.close !== 'function')) {
      throw new TypeError('请选择有效的串口设备。');
    }
    const revision = ++this._revision;
    const reopen = this._desiredOpen;
    if (port !== this.port) this._invalidate();
    return this._enqueue(async () => {
      this._assertUsable();
      if (port === this.port) return;
      await this._close();
      this._port = port;
      this._setState('disconnected');
      if (port && reopen && this._desiredOpen) await this._open(revision);
    });
  }

  async open(options = this.options) {
    this._assertUsable();
    const normalized = Object.freeze(validateSerialOptions(options));
    const revision = ++this._revision;
    this._desiredOpen = true;
    if (!sameOptions(normalized, this.options)) this._invalidate();
    return this._enqueue(async () => {
      this._assertUsable();
      if (this._session && !this._session.invalidated && sameOptions(normalized, this.options)) return;
      await this._close();
      this._options = normalized;
      await this._open(revision);
    });
  }

  async updateOptions(options) {
    this._assertUsable();
    const normalized = Object.freeze(validateSerialOptions(options));
    const revision = ++this._revision;
    if (!sameOptions(normalized, this.options)) this._invalidate();
    return this._enqueue(async () => {
      this._assertUsable();
      if (sameOptions(normalized, this.options)) return;
      const reopen = Boolean(this._session) && this._desiredOpen;
      await this._close();
      this._options = normalized;
      if (reopen) await this._open(revision);
    });
  }

  async close({ manual = true } = {}) {
    if (manual) this._desiredOpen = false;
    ++this._revision;
    this._invalidate();
    return this._enqueue(() => this._close());
  }

  async _open(revision, reconnect = false) {
    if (!this.port) {
      this._desiredOpen = false;
      const error = new Error('请先选择串口设备。');
      this._report(error);
      throw error;
    }
    const session = {
      port: this.port,
      invalidated: false,
      opened: false,
      reader: null,
      writer: null,
      readTask: null,
      writeTail: Promise.resolve()
    };
    this._session = session;
    this._setState('connecting');
    try {
      await session.port.open(this.options);
      session.opened = true;
    } catch (error) {
      if (this._session === session) this._session = null;
      if (!reconnect && revision === this._revision) this._desiredOpen = false;
      this._setState('disconnected');
      this._report(error);
      throw error;
    }
    if (this._disposed || !this._desiredOpen || session.invalidated) {
      await this._close();
      return;
    }
    this._setState('connected');
    session.readTask = this._read(session);
  }

  async _read(session) {
    let failure;
    while (!session.invalidated && session.port.readable) {
      const stream = session.port.readable;
      let reader;
      let readError;
      try {
        reader = stream.getReader();
        session.reader = reader;
        while (!session.invalidated) {
          const { value, done } = await reader.read();
          if (done) break;
          if (value?.byteLength && !session.invalidated) this._notify('onData', new Uint8Array(value));
        }
      } catch (error) {
        readError = error;
      } finally {
        if (reader) reader.releaseLock();
        if (session.reader === reader) session.reader = null;
      }
      if (session.invalidated) return;
      if (readError && session.port.readable && session.port.readable !== stream) {
        this._report(readError);
        continue; // Recoverable framing/parity errors expose a fresh readable stream.
      }
      failure = readError || new Error('串口接收已结束，连接已断开。');
      break;
    }
    if (!session.invalidated) this._failSession(session, failure || new Error('串口已断开。'));
  }

  _failSession(session, error) {
    if (session.invalidated) return;
    session.invalidated = true;
    this._report(error);
    this._enqueue(async () => {
      if (this._session === session) await this._close();
    }).catch(() => {});
  }

  async send(bytes) {
    this._assertUsable();
    if (!(bytes instanceof Uint8Array)) throw new TypeError('发送数据必须为字节数组。');
    const session = this._session;
    if (this.state !== 'connected' || !session || session.invalidated) throw new Error('请先打开串口。');
    const data = bytes.slice();
    const result = session.writeTail.then(async () => {
      if (session.invalidated || this._session !== session || this._disposed) throw aborted();
      let writer;
      try {
        if (!session.port.writable) throw new Error('串口不可写，连接可能已断开。');
        writer = session.port.writable.getWriter();
        session.writer = writer;
        await writer.write(data);
        this._notify('onSent', data);
      } catch (error) {
        if (!session.invalidated) this._failSession(session, error);
        throw error;
      } finally {
        writer?.releaseLock();
        if (session.writer === writer) session.writer = null;
      }
    });
    session.writeTail = result.catch(() => {});
    return result;
  }

  async _finishWrites(session) {
    // Hardware flow control can stall a native write forever. Let ordinary
    // writes finish, then abort the native sink before releasing its writer.
    let abortTask = Promise.resolve();
    const timer = setTimeout(() => {
      if (session.writer) abortTask = session.writer.abort(aborted()).catch(() => {});
    }, 1000);
    try {
      await session.writeTail;
      await abortTask;
    } finally {
      clearTimeout(timer);
    }
  }

  async _close() {
    const session = this._session;
    if (!session) return;
    session.invalidated = true;
    this._setState('closing');
    let released = false;
    try {
      if (session.reader) {
        try { await session.reader.cancel(); } catch { /* An unplugged/errored stream is already closed. */ }
      }
      await session.readTask;
      await this._finishWrites(session);
      if (session.opened) {
        try {
          await session.port.close();
        } catch (error) {
          // A removed device can already have null streams by the time close runs.
          if (session.port.readable || session.port.writable) {
            this._report(error);
            throw error;
          }
        }
      }
      released = true;
    } finally {
      // If the OS rejects close while streams still exist, retain ownership so
      // the next close/open can retry cleanup instead of leaking an open port.
      if (released && this._session === session) this._session = null;
      this._setState('disconnected');
    }
  }

  async dispose() {
    this._disposed = true;
    this._desiredOpen = false;
    ++this._revision;
    this._invalidate();
    this.serial?.removeEventListener('disconnect', this._onDisconnect);
    this.serial?.removeEventListener('connect', this._onConnect);
    return this._enqueue(() => this._close());
  }
}
