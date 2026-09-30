/**
 * Adapted from itldg/web-serial-debug, commit c0fc58b9 (Apache-2.0).
 * Native OS UI, bounded logs, validated storage and streaming text decoding.
 * Right-side command sets, config files, scripts and analytics were removed.
 * See LICENSE and NOTICE.md for provenance and third-party notices.
 */
import { SerialController, DEFAULT_SERIAL_OPTIONS, validateSerialOptions } from './serial-controller.mjs?v=20260928-1';
import { createSerialDecoder, encodeSerialText, normalizeSerialEncoding } from './serial-encoding.mjs?v=20260929-1';
import { createBaudPicker } from './baud-picker.mjs?v=20260929-1';

const $ = (id) => document.getElementById(id);
const settingsKey = 'lightwind-serial-settings-v1';
const defaultTools = Object.freeze({
  autoScroll: true, showTime: true, logType: 'hex&text', timeout: 50,
  hexSend: false, addCRLF: false, loopInterval: 1000, sendContent: '', encoding: 'utf-8'
});
const serialFields = {
  baudRate: 'serial-baud', dataBits: 'serial-data-bits', stopBits: 'serial-stop-bits',
  parity: 'serial-parity', bufferSize: 'serial-buffer-size', flowControl: 'serial-flow-control'
};
const toolFields = {
  autoScroll: 'serial-auto-scroll', showTime: 'serial-show-time', logType: 'serial-log-type',
  timeout: 'serial-timer-out', hexSend: 'serial-hex-send', addCRLF: 'serial-add-crlf',
  loopInterval: 'serial-loop-send-time', sendContent: 'serial-send-content', encoding: 'serial-encoding'
};
const maxRecords = 5000;
const maxLogMemory = 4 * 1024 * 1024;
const maxReceiveBatch = 64 * 1024;
const maxPendingAnsi = 4096;
const reportedErrors = new WeakSet();
let settingsWarning = '';
let storageWarningShown = false;
let serialOptions = { ...DEFAULT_SERIAL_OPTIONS };
let toolOptions = { ...defaultTools };
let controller;
let availablePorts = [];
let selecting = false;
let leaving = false;
let hadConnection = false;
let connectionFailed = false;
let baudPicker;
let loopTimer;
let loopToken = 0;
let receiveTimer;
let receiveChunks = [];
let receiveSize = 0;
let receiveDecoder = createSerialDecoder();
let ansiParsers = {};
let records = [];
let logMemory = 0;
let droppedRecords = 0;
let receivedCount = 0;
let sentCount = 0;
let renderFrame;
let fullRender = false;

function showMessage(text, tone = 'info') {
  const message = $('serial-message');
  message.textContent = text;
  message.dataset.tone = tone;
  message.hidden = !text;
}

function reportError(error) {
  if (leaving || error?.name === 'AbortError') return;
  if (error && typeof error === 'object') {
    if (reportedErrors.has(error)) return;
    reportedErrors.add(error);
  }
  const descriptions = {
    NetworkError: '无法访问串口，请检查设备连接，或关闭其他占用此串口的程序。',
    SecurityError: '浏览器未允许访问串口，请检查此网站的串口权限。',
    NotAllowedError: '串口访问未获授权，请重新选择设备。',
    NotSupportedError: '设备不支持当前串口参数，请调整后重试。'
  };
  const text = descriptions[error?.name] || error?.message || String(error);
  showMessage(text, 'error');
}

function reportConnectionError(error) {
  connectionFailed = true;
  reportError(error);
}

function validInteger(value, fallback, minimum, maximum) {
  return typeof value === 'number' && Number.isInteger(value) && value >= minimum && value <= maximum ? value : fallback;
}

function loadSettings() {
  try {
    const stored = localStorage.getItem(settingsKey);
    if (!stored) return;
    const saved = JSON.parse(stored);
    if (!saved || typeof saved !== 'object' || Array.isArray(saved)) throw new Error('Invalid settings');
    try { serialOptions = validateSerialOptions(saved.serialOptions ?? DEFAULT_SERIAL_OPTIONS); }
    catch { settingsWarning = '已保存的串口参数无效，已恢复默认参数。'; }
    const tools = saved.toolOptions && typeof saved.toolOptions === 'object' ? saved.toolOptions : {};
    for (const key of ['autoScroll', 'showTime', 'hexSend', 'addCRLF']) {
      if (typeof tools[key] === 'boolean') toolOptions[key] = tools[key];
    }
    if (['hex&text', 'hex', 'text', 'ansi'].includes(tools.logType)) toolOptions.logType = tools.logType;
    toolOptions.encoding = normalizeSerialEncoding(tools.encoding);
    toolOptions.timeout = validInteger(tools.timeout, defaultTools.timeout, 0, 60000);
    toolOptions.loopInterval = validInteger(tools.loopInterval, defaultTools.loopInterval, 1, 3600000);
    if (typeof tools.sendContent === 'string') toolOptions.sendContent = tools.sendContent.slice(0, 262144);
  } catch {
    settingsWarning = '无法读取已保存的设置，已使用默认参数。';
  }
}

function saveSettings() {
  try { localStorage.setItem(settingsKey, JSON.stringify({ serialOptions, toolOptions })); }
  catch {
    if (storageWarningShown) return;
    storageWarningShown = true;
    showMessage('浏览器无法保存设置，本次页面仍可正常使用。');
  }
}

function populateSettings() {
  for (const [key, id] of Object.entries(serialFields)) $(id).value = String(serialOptions[key]);
  for (const [key, id] of Object.entries(toolFields)) {
    if (typeof toolOptions[key] === 'boolean') $(id).checked = toolOptions[key];
    else $(id).value = String(toolOptions[key]);
  }
  document.body.dataset.showTime = String(toolOptions.showTime);
  receiveDecoder = createSerialDecoder(toolOptions.encoding);
}

function readSerialOptions() {
  if (!$('serial-options-form').reportValidity()) throw new Error('请填写有效的串口参数。');
  return validateSerialOptions(Object.fromEntries(Object.entries(serialFields).map(([key, id]) => [key, $(id).value])));
}

function portLabel(port) {
  const number = Math.max(0, availablePorts.indexOf(port)) + 1;
  let info = {};
  try { info = port.getInfo(); } catch { /* A detached port may no longer expose its info. */ }
  const hex = (value) => Number(value).toString(16).padStart(4, '0').toUpperCase();
  return info.usbVendorId !== undefined
    ? `串口 ${number} · USB ${hex(info.usbVendorId)}:${hex(info.usbProductId ?? 0)}`
    : `串口 ${number}`;
}

function renderPorts() {
  const select = $('serial-port-list');
  if (controller?.port && !availablePorts.includes(controller.port)) availablePorts.push(controller.port);
  select.replaceChildren();
  if (!availablePorts.length) select.add(new Option('暂无已授权设备', ''));
  else {
    if (!controller?.port) select.add(new Option('选择已授权设备', ''));
    availablePorts.forEach((port, index) => select.add(new Option(portLabel(port), String(index))));
  }
  select.value = controller?.port ? String(availablePorts.indexOf(controller.port)) : '';
}

function updateControls() {
  const state = controller?.state || 'disconnected';
  const busy = selecting || leaving || state === 'connecting' || state === 'closing';
  const supported = Boolean(controller);
  const connected = state === 'connected';
  document.body.dataset.state = state;
  $('connection-fields').disabled = !supported || busy;
  baudPicker?.syncDisabled();
  $('serial-select-port').disabled = !supported || busy;
  $('serial-port-list').disabled = !supported || busy || !availablePorts.length;
  $('serial-open-or-close').disabled = !supported || busy || !controller.port;
  $('serial-open-or-close').querySelector('span').textContent = connected ? '关闭串口' : state === 'connecting' ? '正在打开…' : state === 'closing' ? '正在关闭…' : '打开串口';
  $('serial-send').disabled = !connected || busy;
  $('serial-loop-send').disabled = !connected || busy;
  $('connection-state').querySelector('span').textContent = ({ disconnected: '未连接', connecting: '连接中', connected: '已连接', closing: '关闭中' })[state];
}

function handleState({ state }) {
  if (state !== 'connected') stopLoop();
  if (state === 'connecting') connectionFailed = false;
  if (state === 'connected') {
    receiveDecoder = createSerialDecoder(toolOptions.encoding);
    ansiParsers = {};
    hadConnection = true;
    showMessage(`已打开 ${portLabel(controller.port)} · ${controller.options.baudRate} baud`, 'success');
  } else if (state === 'disconnected' && hadConnection) {
    finishReceive();
    hadConnection = false;
    if (!connectionFailed) showMessage('串口已关闭或断开。');
  }
  renderPorts();
  updateControls();
}

async function deviceAction(action) {
  if (!controller || selecting || leaving) return;
  selecting = true;
  updateControls();
  try { await action(); }
  catch (error) {
    if (error.name === 'NotFoundError') showMessage('已取消选择串口设备。');
    else reportError(error);
  } finally {
    selecting = false;
    renderPorts();
    updateControls();
  }
}

async function refreshPorts({ selectFirst = false } = {}) {
  if (!controller || leaving) return;
  try {
    availablePorts = await navigator.serial.getPorts();
    if (leaving) return;
    // Do not replace a device the user selected while getPorts was pending.
    if (selectFirst && !selecting && !controller.port && availablePorts.length) await controller.selectPort(availablePorts[0]);
    renderPorts();
    updateControls();
  } catch (error) { reportError(error); }
}

function formatTime(time) {
  const date = new Date(time);
  const two = (value) => String(value).padStart(2, '0');
  return `${two(date.getHours())}:${two(date.getMinutes())}:${two(date.getSeconds())}.${String(date.getMilliseconds()).padStart(3, '0')}`;
}

function hexText(bytes) {
  return Array.from(bytes || [], (value) => value.toString(16).padStart(2, '0').toUpperCase()).join(' ');
}

function ansiHTML(text, direction) {
  if (typeof window.AnsiUp !== 'function') return null;
  if (!ansiParsers[direction]) ansiParsers[direction] = new window.AnsiUp();
  const parser = ansiParsers[direction];
  const html = parser.ansi_to_html(text);
  // ansi_up 5.1.0 retains incomplete escapes in _buffer. A malformed CSI or
  // never-terminated OSC must not swallow the stream or bypass the log limit.
  const pending = parser._buffer;
  const invalidCSI = pending.startsWith('\x1b[') && !/^\x1b\[[\x30-\x3f]*[\x20-\x2f]*$/.test(pending);
  if (pending.length > maxPendingAnsi || invalidCSI) {
    const plain = document.createElement('span');
    plain.textContent = pending;
    ansiParsers[direction] = new window.AnsiUp();
    return html + plain.innerHTML;
  }
  return html;
}

function addRecord(record) {
  record.time = Date.now();
  record.ansi = ansiHTML(record.text, record.direction);
  record.cost = (record.bytes?.byteLength || 0) + record.text.length * 2 + (record.ansi?.length || 0) * 2 + 128;
  records.push(record);
  logMemory += record.cost;
  while (records.length > maxRecords || logMemory > maxLogMemory) {
    const old = records.shift();
    old.element?.remove();
    logMemory -= old.cost;
    droppedRecords += 1;
  }
  scheduleRender();
}

function adaptAnsiToDarkSurface(fragment) {
  // Lift dark ANSI foregrounds toward white while retaining their hue. Explicit
  // ANSI backgrounds keep their original foreground/background pairing.
  const luminance = (rgb) => rgb.map((value) => {
    const channel = value / 255;
    return channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4;
  }).reduce((total, channel, index) => total + channel * [.2126, .7152, .0722][index], 0);
  const surfaceLuminance = luminance([0, 0, 0]); // .log-viewport: #000
  for (const span of fragment.querySelectorAll('span[style]')) {
    if (!span.style.color || span.style.backgroundColor) continue;
    const channels = span.style.color.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/);
    if (!channels) continue;
    let rgb = channels.slice(1).map(Number);
    while ((luminance(rgb) + .05) / (surfaceLuminance + .05) < 4.5) {
      rgb = rgb.map((value) => Math.ceil(value + (255 - value) * .1));
    }
    span.style.color = `rgb(${rgb.join(', ')})`;
  }
}

function renderRecord(record) {
  const row = document.createElement('div');
  row.className = 'log-entry';
  row.dataset.direction = record.direction;
  const time = document.createElement('time');
  time.className = 'log-time';
  time.dateTime = new Date(record.time).toISOString();
  time.textContent = formatTime(record.time);
  const direction = document.createElement('span');
  direction.className = 'log-direction';
  direction.textContent = ({ rx: 'RX', tx: 'TX' })[record.direction];
  const content = document.createElement('div');
  content.className = 'log-content';
  const mode = toolOptions.logType;
  if (record.bytes && mode.includes('hex')) {
    const hex = document.createElement('div');
    hex.className = 'log-hex';
    hex.textContent = hexText(record.bytes);
    content.append(hex);
  }
  if (mode !== 'hex') {
    const text = document.createElement('div');
    text.className = 'log-text';
    if (mode === 'ansi' && record.ansi !== null && record.ansi !== undefined) {
      // ansi_up escapes device text. Keep its colors, but render OSC links as text.
      const template = document.createElement('template');
      template.innerHTML = record.ansi;
      template.content.querySelectorAll('a').forEach((link) => link.replaceWith(document.createTextNode(link.textContent)));
      adaptAnsiToDarkSurface(template.content);
      text.append(template.content);
    } else text.textContent = record.text;
    content.append(text);
  }
  row.append(time, direction, content);
  record.element = row;
  return row;
}

function scheduleRender(full = false) {
  fullRender ||= full;
  if (renderFrame || leaving) return;
  renderFrame = requestAnimationFrame(() => {
    renderFrame = undefined;
    const logs = $('serial-logs');
    if (fullRender) {
      logs.replaceChildren();
      records.forEach((record) => { record.element = null; });
      fullRender = false;
    }
    const fragment = document.createDocumentFragment();
    records.forEach((record) => { if (!record.element) fragment.append(renderRecord(record)); });
    logs.append(fragment);
    $('empty-logs').hidden = records.length > 0;
    $('received-count').textContent = String(receivedCount);
    $('sent-count').textContent = String(sentCount);
    $('log-count').textContent = `${records.length} 条记录${droppedRecords ? ` · 已移除 ${droppedRecords} 条较早记录` : ''}`;
    for (const id of ['serial-clear', 'serial-copy', 'serial-save']) $(id).disabled = !records.length;
    if (toolOptions.autoScroll) $('log-viewport').scrollTop = $('log-viewport').scrollHeight;
  });
}

function receive(bytes) {
  receivedCount += bytes.byteLength;
  // Flush large continuous streams even when they never reach the idle timeout.
  for (let offset = 0; offset < bytes.length; offset += maxReceiveBatch) {
    const chunk = bytes.slice(offset, offset + maxReceiveBatch);
    receiveChunks.push(chunk);
    receiveSize += chunk.length;
    if (receiveSize >= maxReceiveBatch) flushReceive();
  }
  clearTimeout(receiveTimer);
  if (toolOptions.timeout === 0) flushReceive();
  else if (receiveSize) receiveTimer = setTimeout(flushReceive, toolOptions.timeout);
  scheduleRender();
}

function flushReceive() {
  clearTimeout(receiveTimer);
  receiveTimer = undefined;
  if (!receiveSize) return;
  const bytes = new Uint8Array(receiveSize);
  let offset = 0;
  receiveChunks.forEach((chunk) => { bytes.set(chunk, offset); offset += chunk.length; });
  receiveChunks = [];
  receiveSize = 0;
  addRecord({ direction: 'rx', bytes, text: receiveDecoder.decode(bytes, { stream: true }) });
}

function finishReceive() {
  flushReceive();
  const remainder = receiveDecoder.decode();
  if (remainder) addRecord({ direction: 'rx', bytes: new Uint8Array(), text: remainder });
  receiveDecoder = createSerialDecoder(toolOptions.encoding);
}

function sent(bytes, encoding) {
  sentCount += bytes.length;
  addRecord({ direction: 'tx', bytes: bytes.slice(), text: createSerialDecoder(encoding).decode(bytes) });
}

function encodeSendContent(encoding) {
  const value = $('serial-send-content').value;
  let bytes;
  if ($('serial-hex-send').checked) {
    const hex = value.replace(/\s/g, '');
    if (!/^[0-9a-f]*$/i.test(hex) || hex.length % 2 !== 0) throw new Error('HEX 数据须由偶数个十六进制字符组成，例如 48 65 6C 6C 6F。');
    bytes = Uint8Array.from(hex.match(/.{2}/g) || [], (pair) => parseInt(pair, 16));
  } else bytes = encodeSerialText(value, encoding);
  if ($('serial-add-crlf').checked) {
    const framed = new Uint8Array(bytes.length + 2);
    framed.set(bytes);
    framed.set([13, 10], bytes.length);
    bytes = framed;
  }
  if (!bytes.length) throw new Error('请输入要发送的数据。');
  return bytes;
}

async function sendContent() {
  // Each queued write keeps its encoding even if the selector changes while
  // the serial device is still accepting an earlier write.
  const encoding = toolOptions.encoding;
  const bytes = encodeSendContent(encoding);
  await controller.send(bytes);
  sent(bytes, encoding);
}

function stopLoop() {
  ++loopToken;
  clearTimeout(loopTimer);
  loopTimer = undefined;
  $('serial-loop-send').checked = false;
}

function startLoop() {
  clearTimeout(loopTimer);
  const token = ++loopToken;
  const tick = async () => {
    if (token !== loopToken || controller?.state !== 'connected' || leaving) return;
    try {
      if (!$('serial-loop-send-time').reportValidity()) throw new Error('循环发送间隔须为 1 至 3600000 毫秒的整数。');
      await sendContent();
      if (token === loopToken && controller.state === 'connected') loopTimer = setTimeout(tick, toolOptions.loopInterval);
    } catch (error) {
      if (token === loopToken) stopLoop();
      reportError(error);
    }
  };
  void tick();
}

function plainLogText() {
  return records.map((record) => {
    const prefix = `${toolOptions.showTime ? `[${formatTime(record.time)}] ` : ''}${({ rx: 'RX', tx: 'TX' })[record.direction]} `;
    if (toolOptions.logType === 'hex') return prefix + hexText(record.bytes);
    if (toolOptions.logType === 'hex&text') return prefix + hexText(record.bytes) + '\n' + record.text;
    if (toolOptions.logType === 'ansi' && record.ansi != null) {
      const template = document.createElement('template');
      template.innerHTML = record.ansi;
      return prefix + template.content.textContent;
    }
    return prefix + record.text;
  }).join('\n');
}

function clearLogs() {
  clearTimeout(receiveTimer);
  receiveChunks = [];
  receiveSize = 0;
  // Keep decoder/ANSI state for a character or escape split at clear.
  records = [];
  logMemory = 0;
  droppedRecords = 0;
  receivedCount = 0;
  sentCount = 0;
  $('serial-logs').replaceChildren();
  scheduleRender(true);
}

loadSettings();
populateSettings();
baudPicker = createBaudPicker({ input: $('serial-baud'), toggle: $('serial-baud-toggle'), listbox: $('baud-options') });
if (window.isSecureContext && navigator.serial) {
  controller = new SerialController({ serial: navigator.serial, onState: handleState, onData: receive, onError: reportConnectionError });
  void controller.updateOptions(serialOptions).catch(reportError);
  void refreshPorts({ selectFirst: true });
  navigator.serial.addEventListener('connect', refreshPorts);
  navigator.serial.addEventListener('disconnect', refreshPorts);
  if (settingsWarning) showMessage(settingsWarning);
} else {
  showMessage(window.isSecureContext
    ? '当前浏览器不支持串口访问，请使用电脑端 Chrome 或 Edge。'
    : '串口访问需要安全连接，请使用 HTTPS 或 localhost，并使用电脑端 Chrome 或 Edge。', 'error');
}
updateControls();
scheduleRender();

$('serial-select-port').addEventListener('click', () => deviceAction(async () => {
  const port = await navigator.serial.requestPort();
  if (leaving) return;
  await controller.selectPort(port);
  if (!availablePorts.includes(port)) availablePorts.push(port);
  if (controller.state !== 'connected') showMessage('已选择串口设备。');
}));
$('serial-port-list').addEventListener('change', () => deviceAction(async () => {
  const port = availablePorts[Number($('serial-port-list').value)];
  if (port) {
    await controller.selectPort(port);
    if (controller.state !== 'connected') showMessage('已选择串口设备。');
  }
}));
$('serial-open-or-close').addEventListener('click', () => deviceAction(async () => {
  if (controller.state === 'connected') {
    await controller.close();
    if (!connectionFailed) showMessage('串口已关闭。', 'success');
  }
  else {
    serialOptions = readSerialOptions();
    saveSettings();
    await controller.open(serialOptions);
  }
}));
$('serial-options-form').addEventListener('submit', (event) => event.preventDefault());
$('serial-options-form').addEventListener('change', (event) => {
  if (!Object.values(serialFields).includes(event.target.id)) return;
  try {
    serialOptions = readSerialOptions();
    saveSettings();
    if (controller) void deviceAction(() => controller.updateOptions(serialOptions));
  } catch (error) { reportError(error); }
});
for (const [key, id] of Object.entries(toolFields)) {
  const field = $(id);
  field.addEventListener(key === 'sendContent' ? 'input' : 'change', () => {
    if (!field.reportValidity()) return;
    if (key === 'timeout') flushReceive();
    if (key === 'encoding') finishReceive();
    toolOptions[key] = typeof defaultTools[key] === 'boolean' ? field.checked : typeof defaultTools[key] === 'number' ? Number(field.value) : field.value;
    if (key === 'encoding') {
      toolOptions.encoding = normalizeSerialEncoding(toolOptions.encoding);
      field.value = toolOptions.encoding;
      receiveDecoder = createSerialDecoder(toolOptions.encoding);
      ansiParsers = {};
    }
    saveSettings();
    document.body.dataset.showTime = String(toolOptions.showTime);
    if (['logType', 'showTime', 'autoScroll'].includes(key)) scheduleRender(key === 'logType');
  });
}
$('serial-loop-send').addEventListener('change', () => { if ($('serial-loop-send').checked) startLoop(); else stopLoop(); });
$('serial-send-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (controller?.state !== 'connected') return;
  try { await sendContent(); }
  catch (error) { reportError(error); }
});
$('serial-send-content').addEventListener('keydown', (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
    event.preventDefault();
    $('serial-send-form').requestSubmit();
  }
});
$('serial-clear').addEventListener('click', clearLogs);
$('serial-copy').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(plainLogText());
    showMessage('日志已复制。', 'success');
  } catch { showMessage('无法访问剪贴板，请使用“下载日志”保存数据。', 'error'); }
});
$('serial-save').addEventListener('click', () => {
  const url = URL.createObjectURL(new Blob([plainLogText()], { type: 'text/plain;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `serial-${new Date().toISOString().replace(/[:.]/g, '-')}.log`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

function beginLeaving() {
  leaving = true;
  stopLoop();
  clearTimeout(receiveTimer);
  cancelAnimationFrame(renderFrame);
  saveSettings();
  if (controller) {
    navigator.serial.removeEventListener('connect', refreshPorts);
    navigator.serial.removeEventListener('disconnect', refreshPorts);
  }
  updateControls();
}
$('serial-back').addEventListener('click', async (event) => {
  if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button !== 0) return;
  event.preventDefault();
  if (leaving) return;
  beginLeaving();
  try { await controller?.dispose(); }
  catch { /* Navigation releases the document's ports if the OS rejects close. */ }
  finally { window.location.assign('/'); }
});
window.addEventListener('pagehide', () => {
  beginLeaving();
  void controller?.dispose().catch(() => {});
});
// Back/forward-cache restores a disposed controller; reload without reopening it.
window.addEventListener('pageshow', (event) => { if (event.persisted) window.location.reload(); });
