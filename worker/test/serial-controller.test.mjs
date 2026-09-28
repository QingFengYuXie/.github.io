import test from 'node:test';
import assert from 'node:assert/strict';
import { SerialController, DEFAULT_SERIAL_OPTIONS, validateSerialOptions } from '../../static/serial/serial-controller.mjs';

const tick = () => new Promise((resolve) => setImmediate(resolve));
function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}
async function until(predicate) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (predicate()) return;
    await tick();
  }
  assert.fail('The expected serial state was never reached.');
}

class FakeSerial extends EventTarget {
  signal(type, port) {
    const event = new Event(type);
    Object.defineProperty(event, 'port', { value: port });
    this.dispatchEvent(event);
  }
}

class FakePort {
  constructor(name = 'A', events = []) {
    this.name = name;
    this.events = events;
    this.readable = null;
    this.writable = null;
    this.writes = [];
    this.openCalls = [];
    this.closeCalls = 0;
    this.abortCalls = 0;
  }
  newReadable() {
    return new ReadableStream({
      start: (controller) => { this.readController = controller; },
      cancel: () => { this.events.push(`${this.name}:cancel-read`); }
    });
  }
  async open(options) {
    this.events.push(`${this.name}:open`);
    this.openCalls.push({ ...options });
    if (this.openGate) await this.openGate.promise;
    if (this.openError) throw this.openError;
    if (this.readable || this.writable) throw new Error('Port already open');
    this.readable = this.newReadable();
    this.writable = new WritableStream({
      write: async (data, controller) => {
        this.events.push(`${this.name}:write-start`);
        if (this.writeGate) {
          let onAbort;
          const aborted = new Promise((resolve, reject) => {
            onAbort = () => reject(controller.signal.reason);
            controller.signal.addEventListener('abort', onAbort, { once: true });
          });
          try {
            await Promise.race([this.writeGate.promise, aborted]);
          } finally {
            controller.signal.removeEventListener('abort', onAbort);
          }
        }
        if (this.writeError) throw this.writeError;
        this.writes.push([...data]);
        this.events.push(`${this.name}:write-end`);
      },
      abort: () => { this.abortCalls += 1; }
    });
  }
  async close() {
    assert.equal(this.readable?.locked || false, false, 'read lock released before close');
    assert.equal(this.writable?.locked || false, false, 'write lock released before close');
    this.events.push(`${this.name}:close`);
    this.closeCalls += 1;
    if (this.closeError) throw this.closeError;
    this.readable = null;
    this.writable = null;
  }
  receive(data) { this.readController.enqueue(new Uint8Array(data)); }
  readFailure(error, recoverable = false) {
    const old = this.readController;
    this.readable = recoverable ? this.newReadable() : null;
    old.error(error);
  }
}

function fixture(t) {
  const serial = new FakeSerial();
  const states = [];
  const data = [];
  const sent = [];
  const errors = [];
  const controller = new SerialController({
    serial,
    onState: (state) => states.push(state),
    onData: (bytes) => data.push([...bytes]),
    onSent: (bytes) => sent.push([...bytes]),
    onError: (error) => errors.push(error)
  });
  t.after(() => controller.dispose());
  return { controller, serial, states, data, sent, errors };
}

test('serial options accept custom baud rates and reject invalid Web Serial parameters', () => {
  assert.deepEqual(validateSerialOptions({}), DEFAULT_SERIAL_OPTIONS);
  assert.deepEqual(validateSerialOptions({ baudRate: '250000', bufferSize: '4096', unknown: true }), {
    ...DEFAULT_SERIAL_OPTIONS, baudRate: 250000, bufferSize: 4096
  });
  for (const options of [
    null, [], { baudRate: 0 }, { baudRate: Infinity }, { baudRate: true }, { baudRate: '' },
    { baudRate: 2 ** 32 }, { dataBits: 6 }, { stopBits: 1.5 }, { parity: 'mark' },
    { flowControl: 'software' }, { bufferSize: 0 }, { bufferSize: 16 * 1024 * 1024 }
  ]) assert.throws(() => validateSerialOptions(options));
});

test('selection stays disconnected until explicit open; read/write use bytes and release locks', async (t) => {
  const { controller, serial, data, sent } = fixture(t);
  const port = new FakePort();
  await controller.selectPort(port);
  serial.signal('connect', port);
  await tick();
  assert.equal(controller.state, 'disconnected');
  assert.equal(port.openCalls.length, 0);
  await controller.open();
  assert.equal(controller.state, 'connected');
  assert.deepEqual(port.openCalls[0], DEFAULT_SERIAL_OPTIONS);
  port.receive([0xe4, 0xb8]);
  port.receive([0xad, 0, 255]);
  await until(() => data.length === 2);
  const payload = new Uint8Array([1, 2, 3]);
  const send = controller.send(payload);
  payload[0] = 9;
  await send;
  assert.deepEqual(port.writes, [[1, 2, 3]]);
  assert.deepEqual(sent, [[1, 2, 3]]);
  assert.deepEqual(data, [[0xe4, 0xb8], [0xad, 0, 255]]);
  await controller.close();
  assert.equal(controller.state, 'disconnected');
  assert.equal(controller.port, port);
  assert.equal(port.closeCalls, 1);
});

test('simultaneous sends remain ordered without competing writer locks', async (t) => {
  const { controller, errors } = fixture(t);
  const port = new FakePort();
  await controller.selectPort(port);
  await controller.open();
  await Promise.all(Array.from({ length: 30 }, (_, number) => controller.send(Uint8Array.of(number))));
  assert.deepEqual(port.writes, Array.from({ length: 30 }, (_, number) => [number]));
  assert.deepEqual(errors, []);
});

test('close waits for an active write and cancels all queued sends', async (t) => {
  const { controller, errors } = fixture(t);
  const port = new FakePort();
  await controller.selectPort(port);
  await controller.open();
  port.writeGate = deferred();
  const first = controller.send(Uint8Array.of(1));
  const second = controller.send(Uint8Array.of(2));
  const results = Promise.allSettled([first, second]);
  await until(() => port.events.includes('A:write-start'));
  const closing = controller.close();
  await tick();
  assert.equal(port.closeCalls, 0);
  port.writeGate.resolve();
  await closing;
  const settled = await results;
  assert.equal(settled[0].status, 'fulfilled');
  assert.equal(settled[1].reason.name, 'AbortError');
  assert.deepEqual(port.writes, [[1]]);
  assert.ok(port.events.indexOf('A:write-end') < port.events.indexOf('A:close'));
  assert.deepEqual(errors, []);
});

test('switching ports and options fully closes the old connection before opening the next', async (t) => {
  const { controller } = fixture(t);
  const events = [];
  const first = new FakePort('A', events);
  const second = new FakePort('B', events);
  await controller.selectPort(first);
  await controller.open();
  await controller.selectPort(second);
  assert.ok(events.indexOf('A:close') < events.indexOf('B:open'));
  assert.equal(controller.port, second);
  await controller.updateOptions({ baudRate: 9600, parity: 'even' });
  assert.equal(second.closeCalls, 1);
  assert.equal(second.openCalls.length, 2);
  assert.equal(second.openCalls[1].baudRate, 9600);
  assert.equal(second.openCalls[1].parity, 'even');
  assert.equal(controller.state, 'connected');
});

test('updating disconnected options never opens an authorized port', async (t) => {
  const { controller } = fixture(t);
  const port = new FakePort();
  await controller.selectPort(port);
  await controller.updateOptions({ baudRate: 4800 });
  assert.equal(port.openCalls.length, 0);
  await controller.open();
  assert.equal(port.openCalls[0].baudRate, 4800);
});

test('unplug reconnects only the selected port; manual close disables reconnect', async (t) => {
  const { controller, serial } = fixture(t);
  const port = new FakePort();
  const other = new FakePort('B');
  await controller.selectPort(port);
  await controller.open();
  serial.signal('disconnect', other);
  serial.signal('connect', other);
  await tick();
  assert.equal(controller.state, 'connected');
  assert.equal(other.openCalls.length, 0);
  serial.signal('disconnect', port);
  await until(() => controller.state === 'disconnected');
  serial.signal('connect', other);
  await tick();
  assert.equal(port.openCalls.length, 1);
  serial.signal('connect', port);
  await until(() => controller.state === 'connected');
  assert.equal(port.openCalls.length, 2);
  await controller.close();
  serial.signal('disconnect', port);
  serial.signal('connect', port);
  await tick();
  assert.equal(port.openCalls.length, 2);
  assert.equal(controller.state, 'disconnected');
});

test('an immediate reconnect event waits for disconnect cleanup', async (t) => {
  const { controller, serial, errors } = fixture(t);
  const port = new FakePort();
  await controller.selectPort(port);
  await controller.open();
  serial.signal('disconnect', port);
  serial.signal('connect', port);
  await until(() => port.openCalls.length === 2 && controller.state === 'connected');
  assert.equal(port.closeCalls, 1);
  assert.deepEqual(errors, []);
});

test('open failure recovers state and permits a later explicit retry', async (t) => {
  const { controller, errors, serial } = fixture(t);
  const port = new FakePort();
  port.openError = new Error('Device is busy');
  await controller.selectPort(port);
  await assert.rejects(controller.open(), /Device is busy/);
  assert.equal(controller.state, 'disconnected');
  assert.deepEqual(errors, [port.openError]);
  serial.signal('connect', port);
  await tick();
  assert.equal(port.openCalls.length, 1);
  port.openError = null;
  await controller.open();
  assert.equal(controller.state, 'connected');
});

test('recoverable read errors resume with the replacement readable stream', async (t) => {
  const { controller, data, errors } = fixture(t);
  const port = new FakePort();
  await controller.selectPort(port);
  await controller.open();
  const error = new Error('Framing error');
  port.readFailure(error, true);
  await tick();
  port.receive([42]);
  await until(() => data.length === 1);
  assert.deepEqual(data, [[42]]);
  assert.deepEqual(errors, [error]);
  assert.equal(controller.state, 'connected');
});

test('fatal read errors close the port and release its writable stream', async (t) => {
  const { controller, errors } = fixture(t);
  const port = new FakePort();
  await controller.selectPort(port);
  await controller.open();
  const error = new Error('Device removed');
  port.readFailure(error);
  await until(() => controller.state === 'disconnected');
  assert.deepEqual(errors, [error]);
  assert.equal(port.closeCalls, 1);
});

test('failed writes reject, cancel subsequent writes and close without deadlocking', async (t) => {
  const { controller, errors } = fixture(t);
  const port = new FakePort();
  await controller.selectPort(port);
  await controller.open();
  port.writeError = new Error('Write failed');
  const results = await Promise.allSettled([controller.send(Uint8Array.of(1)), controller.send(Uint8Array.of(2))]);
  assert.equal(results[0].reason, port.writeError);
  assert.equal(results[1].reason.name, 'AbortError');
  await until(() => controller.state === 'disconnected');
  assert.deepEqual(errors, [port.writeError]);
  assert.equal(port.closeCalls, 1);
});

test('manual close during an outstanding open releases the late connection', async (t) => {
  const { controller, serial, states } = fixture(t);
  const port = new FakePort();
  port.openGate = deferred();
  await controller.selectPort(port);
  const opening = controller.open();
  await until(() => controller.state === 'connecting');
  const closing = controller.close();
  port.openGate.resolve();
  await Promise.all([opening, closing]);
  assert.equal(controller.state, 'disconnected');
  assert.equal(states.some(({ state }) => state === 'connected'), false);
  assert.equal(port.closeCalls, 1);
  serial.signal('connect', port);
  await tick();
  assert.equal(port.openCalls.length, 1);
});

test('dispose closes an active session and removes reconnect listeners', async (t) => {
  const { controller, serial } = fixture(t);
  const port = new FakePort();
  await controller.selectPort(port);
  await controller.open();
  await controller.dispose();
  serial.signal('connect', port);
  serial.signal('disconnect', port);
  await tick();
  assert.equal(port.openCalls.length, 1);
  assert.equal(port.closeCalls, 1);
  await assert.rejects(controller.open(), /终端已关闭/);
  await assert.rejects(controller.send(Uint8Array.of(1)), /终端已关闭/);
});

test('invalid operations fail without changing the selected connection', async (t) => {
  const { controller } = fixture(t);
  await assert.rejects(controller.open(), /先选择/);
  await assert.rejects(controller.selectPort({}), /有效/);
  const port = new FakePort();
  await controller.selectPort(port);
  await controller.open();
  await assert.rejects(controller.updateOptions({ dataBits: 5 }), /数据位/);
  await assert.rejects(controller.send('hello'), /字节数组/);
  assert.equal(controller.state, 'connected');
  assert.equal(port.closeCalls, 0);
});

test('select followed immediately by open uses the requested options on its first connection', async (t) => {
  const { controller } = fixture(t);
  const port = new FakePort();
  await Promise.all([controller.selectPort(port), controller.open({ baudRate: 9600 })]);
  assert.equal(controller.state, 'connected');
  assert.equal(port.openCalls.length, 1);
  assert.equal(port.openCalls[0].baudRate, 9600);
});

test('close aborts a write stalled by hardware flow control before releasing its lock', { timeout: 5000 }, async (t) => {
  const { controller, errors } = fixture(t);
  const port = new FakePort();
  await controller.selectPort(port);
  await controller.open({ flowControl: 'hardware' });
  port.writeGate = deferred();
  const writing = controller.send(Uint8Array.of(1));
  const settled = Promise.allSettled([writing]);
  await until(() => port.events.includes('A:write-start'));
  await controller.close();
  assert.equal((await settled)[0].reason.name, 'AbortError');
  assert.equal(port.abortCalls, 1);
  assert.equal(port.closeCalls, 1);
  assert.deepEqual(errors, []);
  assert.equal(controller.state, 'disconnected');
});

test('a failed OS close retains the session so the next open retries resource cleanup', async (t) => {
  const { controller, errors } = fixture(t);
  const port = new FakePort();
  await controller.selectPort(port);
  await controller.open();
  port.closeError = new Error('Close failed');
  await assert.rejects(controller.close(), /Close failed/);
  assert.equal(controller.state, 'disconnected');
  assert.equal(controller.port, port);
  assert.deepEqual(errors, [port.closeError]);
  port.closeError = null;
  await controller.open();
  assert.equal(port.closeCalls, 2);
  assert.equal(port.openCalls.length, 2);
  assert.equal(controller.state, 'connected');
});

test('native detached streams clean up even if the removed port rejects close', async (t) => {
  const { controller, serial, errors } = fixture(t);
  const port = new FakePort();
  await controller.selectPort(port);
  await controller.open();
  port.readable = null;
  port.writable = null;
  port.closeError = new Error('Device disconnected');
  serial.signal('disconnect', port);
  await until(() => controller.state === 'disconnected');
  assert.deepEqual(errors, []);
  port.closeError = null;
  serial.signal('connect', port);
  await until(() => controller.state === 'connected');
  assert.equal(port.openCalls.length, 2);
});
