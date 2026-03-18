import type { Action, Assertion, AssertionResult, Message } from './types';

// ── Selector Generation ──

function getSelector(el: HTMLElement): string {
  // Fast-path: globally unique attributes
  if (el.id) return `#${CSS.escape(el.id)}`;
  const testId = el.getAttribute('data-testid');
  if (testId) return `[data-testid="${testId}"]`;
  const ariaLabel = el.getAttribute('aria-label');
  if (ariaLabel) return `[aria-label="${ariaLabel}"]`;
  const name = (el as HTMLInputElement).name;
  if (name) return `${el.tagName.toLowerCase()}[name="${name}"]`;
  if (el.tagName === 'BODY') return 'body';

  // Build a short segment for one DOM node
  function seg(node: HTMLElement): string {
    const tag = node.tagName.toLowerCase();
    if (node.id) return `#${CSS.escape(node.id)}`;
    const tid = node.getAttribute('data-testid');
    if (tid) return `[data-testid="${tid}"]`;
    // Use the first stable class only (no pseudo, no purely numeric)
    const cls = [...node.classList].find(c => /^[a-zA-Z_-]/.test(c) && !c.includes(':'));
    const base = cls ? `${tag}.${cls}` : tag;
    const sibs = Array.from(node.parentNode?.children ?? []).filter(s => s.tagName === node.tagName);
    return sibs.length > 1 ? `${base}:nth-of-type(${sibs.indexOf(node) + 1})` : base;
  }

  // Walk up ancestors (max 3 levels), stop as soon as path is unique
  const path: string[] = [seg(el)];
  let cur: HTMLElement | null = el.parentElement;
  while (cur && cur.tagName !== 'BODY' && path.length < 3) {
    path.unshift(seg(cur));
    const selector = path.join(' > ');
    try {
      const hits = document.querySelectorAll(selector);
      if (hits.length === 1 && hits[0] === el) return selector;
    } catch { /* invalid selector */ }
    // Anchored on an id/data-testid — no need to go further up
    if (path[0].startsWith('#') || path[0].startsWith('[data-testid')) break;
    cur = cur.parentElement;
  }
  return path.join(' > ');
}

// ── Human-Readable Descriptions ──

function getElementLabel(el: HTMLElement): string {
  // Try visible text / common attributes, in priority order
  const text = el.textContent?.trim().slice(0, 40);
  const ariaLabel = el.getAttribute('aria-label');
  const placeholder = (el as HTMLInputElement).placeholder;
  const title = el.getAttribute('title');
  const alt = (el as HTMLImageElement).alt;
  const name = (el as HTMLInputElement).name;

  const label = ariaLabel || text || placeholder || title || alt || name || '';
  return label ? `"${label}"` : el.tagName.toLowerCase();
}

function describeAction(type: string, el: HTMLElement, value?: string): string {
  const label = getElementLabel(el);
  const tag = el.tagName.toLowerCase();

  switch (type) {
    case 'click': {
      if (tag === 'a') return `Clicked link ${label}`;
      if (tag === 'button' || el.getAttribute('role') === 'button') return `Clicked button ${label}`;
      if (tag === 'select') return `Opened dropdown ${label}`;
      if (tag === 'input') {
        const inputType = (el as HTMLInputElement).type;
        if (inputType === 'checkbox') {
          const checked = (el as HTMLInputElement).checked;
          return `${checked ? 'Checked' : 'Unchecked'} checkbox ${label}`;
        }
        if (inputType === 'radio') return `Selected radio ${label}`;
        return `Clicked input ${label}`;
      }
      if (tag === 'label') return `Clicked label ${label}`;
      return `Clicked ${label}`;
    }
    case 'input':
      if (tag === 'select') return `Selected "${value}" in ${label}`;
      return `Typed "${(value ?? '').slice(0, 50)}" in ${label}`;
    case 'keydown':
      return `Pressed ${value}`;
    case 'scroll':
      return `Scrolled page`;
    case 'submit':
      return `Submitted form ${label}`;
    case 'navigation':
      return `Navigated to ${value ?? ''}`;
    case 'dblclick':
      return `Double-clicked ${label}`;
    default:
      return `${type} on ${label}`;
  }
}

// ── Interactive Element Detection ──

const INTERACTIVE_TAGS = new Set([
  'a', 'button', 'input', 'select', 'textarea', 'label', 'option', 'details', 'summary',
]);
const INTERACTIVE_ROLES = new Set([
  'button', 'link', 'tab', 'menuitem', 'menuitemcheckbox', 'menuitemradio',
  'option', 'switch', 'checkbox', 'radio', 'combobox', 'listbox', 'slider',
]);

// Tags to SKIP — layout / structural elements that are never meaningful click targets
const SKIP_TAGS = new Set(['html', 'body', 'head', 'script', 'style', 'noscript', 'br', 'hr']);
// Block-level wrappers that are almost always layout noise unless they have a role/handler
const LAYOUT_TAGS = new Set(['div', 'section', 'main', 'aside', 'header', 'footer', 'nav', 'article', 'form', 'fieldset']);

function isInteractiveElement(el: HTMLElement): boolean {
  const tag = el.tagName.toLowerCase();

  if (SKIP_TAGS.has(tag)) return false;

  // Always accept known interactive elements
  if (INTERACTIVE_TAGS.has(tag)) return true;
  const role = el.getAttribute('role');
  if (role && INTERACTIVE_ROLES.has(role)) return true;
  if (el.hasAttribute('onclick') || el.hasAttribute('tabindex')) return true;
  if (el.isContentEditable) return true;

  // Walk up — if inside a known interactive parent, accept
  let parent = el.parentElement;
  for (let i = 0; i < 4 && parent; i++) {
    const pTag = parent.tagName.toLowerCase();
    if (INTERACTIVE_TAGS.has(pTag)) return true;
    const parentRole = parent.getAttribute('role');
    if (parentRole && INTERACTIVE_ROLES.has(parentRole)) return true;
    if (parent.hasAttribute('onclick') || parent.hasAttribute('tabindex')) return true;
    parent = parent.parentElement;
  }

  // Reject plain layout containers (div, section, etc.) without any interactive signal
  if (LAYOUT_TAGS.has(tag)) return false;

  // Reject elements that are too large to be a button
  const rect = el.getBoundingClientRect();
  if (rect.width > 600 || rect.height > 300) return false;

  // Accept small inline elements (span, li, td, p, etc.) — likely clickable
  return true;
}

/** Find the nearest interactive ancestor (for clicks on icons inside buttons). */
function findInteractiveAncestor(el: HTMLElement): HTMLElement {
  let current: HTMLElement | null = el;
  for (let i = 0; i < 4 && current; i++) {
    if (INTERACTIVE_TAGS.has(current.tagName.toLowerCase())) return current;
    const role = current.getAttribute('role');
    if (role && INTERACTIVE_ROLES.has(role)) return current;
    if (current.hasAttribute('onclick')) return current;
    current = current.parentElement;
  }
  return el;
}

// ── Special Keys ──

const SPECIAL_KEYS = new Set([
  'Enter', 'Escape', 'Tab', 'Backspace', 'Delete',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'Home', 'End', 'PageUp', 'PageDown',
  'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12',
]);

function isSpecialKeyEvent(e: KeyboardEvent): boolean {
  if (e.ctrlKey || e.metaKey || e.altKey) return true;
  return SPECIAL_KEYS.has(e.key);
}

// ── Visual Feedback (cursor dot, click ripple, element flash) ──

let _feedbackStyle: HTMLStyleElement | null = null;
let _cursorDot: HTMLElement | null = null;
// Set true by API_INJECT_ACTION to prevent double-recording via the capture listener
let _suppressNextRecord = false;

function _ensureFeedbackStyles() {
  if (_feedbackStyle) return;
  _feedbackStyle = document.createElement('style');
  _feedbackStyle.textContent = `
    .__s-cursor {
      position: fixed;
      width: 14px; height: 14px;
      border-radius: 50%;
      background: rgba(8,145,178,0.8);
      border: 2px solid rgba(255,255,255,0.95);
      box-shadow: 0 0 0 3px rgba(8,145,178,0.3);
      pointer-events: none;
      z-index: 2147483646;
      transform: translate(-50%,-50%);
    }
    .__s-ripple {
      position: fixed;
      width: 12px; height: 12px;
      border-radius: 50%;
      background: rgba(8,145,178,0.65);
      pointer-events: none;
      z-index: 2147483645;
      transform: translate(-50%,-50%);
      animation: __s-ripple-out 0.55s ease-out forwards;
    }
    @keyframes __s-ripple-out {
      0%   { width: 12px; height: 12px; opacity: 0.75; }
      100% { width: 60px; height: 60px; opacity: 0; }
    }
    .__s-flash {
      outline: 3px solid #0891b2 !important;
      outline-offset: 2px !important;
      box-shadow: 0 0 0 5px rgba(8,145,178,0.18) !important;
      transition: outline 0.08s, box-shadow 0.08s !important;
    }
  `;
  (document.head || document.documentElement).appendChild(_feedbackStyle);
}

function _showRipple(x: number, y: number) {
  _ensureFeedbackStyles();
  const el = document.createElement('div');
  el.className = '__s-ripple';
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  (document.body || document.documentElement).appendChild(el);
  setTimeout(() => el.remove(), 600);
}

function _onMouseMove(e: MouseEvent) {
  if (_cursorDot) {
    _cursorDot.style.left = `${e.clientX}px`;
    _cursorDot.style.top = `${e.clientY}px`;
  }
}

function _startCursorDot() {
  if (_cursorDot) return;
  _ensureFeedbackStyles();
  _cursorDot = document.createElement('div');
  _cursorDot.className = '__s-cursor';
  (document.body || document.documentElement).appendChild(_cursorDot);
  document.addEventListener('mousemove', _onMouseMove, { passive: true });
}

function _stopCursorDot() {
  document.removeEventListener('mousemove', _onMouseMove);
  if (_cursorDot) { _cursorDot.remove(); _cursorDot = null; }
}

function _flashElement(el: HTMLElement) {
  _ensureFeedbackStyles();
  el.classList.add('__s-flash');
  setTimeout(() => el.classList.remove('__s-flash'), 700);
}

// ── Network & Console Log (page-context interception) ──

interface NetworkEntry {
  url: string;
  method: string;
  status?: number;
  error?: string;
  duration: number;
  timestamp: number;
}

interface ConsoleEntry {
  level: 'log' | 'warn' | 'error' | 'info' | 'debug';
  message: string;
  timestamp: number;
}

const _networkLog: NetworkEntry[] = [];
const _consoleLog: ConsoleEntry[] = [];
let _pendingNetCount = 0;
const NET_CONSOLE_MAX = 200;

function _injectInterceptors() {
  if ((window as Window & { __sentinelInjected?: boolean }).__sentinelInjected) return;
  (window as Window & { __sentinelInjected?: boolean }).__sentinelInjected = true;
  const s = document.createElement('script');
  // Minified interceptor injected into page's JS context via a <script> tag
  s.textContent = `(function(){if(window.__sentinelInjected)return;window.__sentinelInjected=true;var _oF=window.fetch;window.fetch=function(){var a=arguments,url=typeof a[0]==='string'?a[0]:(a[0]&&a[0].url)||'',method=(a[1]&&a[1].method)||'GET',t=Date.now();window.postMessage({__sentinel:'net_start',url:url,method:method},'*');return _oF.apply(this,a).then(function(r){window.postMessage({__sentinel:'net_end',url:url,method:method,status:r.status,duration:Date.now()-t},'*');return r;}).catch(function(e){window.postMessage({__sentinel:'net_error',url:url,method:method,error:String(e),duration:Date.now()-t},'*');throw e;});};var _OX=window.XMLHttpRequest;function SXhr(){var xhr=new _OX(),_m='GET',_u='',_t=0,_oo=xhr.open.bind(xhr);xhr.open=function(m,u){_m=m;_u=u;return _oo.apply(xhr,arguments);};var _os=xhr.send.bind(xhr);xhr.send=function(){_t=Date.now();window.postMessage({__sentinel:'net_start',url:_u,method:_m},'*');xhr.addEventListener('load',function(){window.postMessage({__sentinel:'net_end',url:_u,method:_m,status:xhr.status,duration:Date.now()-_t},'*');});xhr.addEventListener('error',function(){window.postMessage({__sentinel:'net_error',url:_u,method:_m,error:'Network error',duration:Date.now()-_t},'*');});return _os.apply(xhr,arguments);};return xhr;}SXhr.prototype=_OX.prototype;window.XMLHttpRequest=SXhr;['log','warn','error','info','debug'].forEach(function(lvl){var _o=console[lvl].bind(console);console[lvl]=function(){_o.apply(console,arguments);var msg=Array.prototype.slice.call(arguments).map(function(x){return typeof x==='string'?x:JSON.stringify(x);}).join(' ');window.postMessage({__sentinel:'console',level:lvl,message:msg},'*');};});})();`;
  (document.head || document.documentElement).appendChild(s);
  s.remove();
}

window.addEventListener('message', (e: MessageEvent) => {
  if (e.source !== window) return;
  const d = e.data as { __sentinel?: string; url?: string; method?: string; status?: number; error?: string; duration?: number; level?: string; message?: string };
  if (!d?.__sentinel) return;
  if (d.__sentinel === 'net_start') {
    _pendingNetCount++;
  } else if (d.__sentinel === 'net_end' || d.__sentinel === 'net_error') {
    _pendingNetCount = Math.max(0, _pendingNetCount - 1);
    _networkLog.push({ url: d.url!, method: d.method!, status: d.status, error: d.error, duration: d.duration!, timestamp: Date.now() });
    if (_networkLog.length > NET_CONSOLE_MAX) _networkLog.shift();
  } else if (d.__sentinel === 'console') {
    _consoleLog.push({ level: d.level as ConsoleEntry['level'], message: d.message!, timestamp: Date.now() });
    if (_consoleLog.length > NET_CONSOLE_MAX) _consoleLog.shift();
  }
});

_injectInterceptors();

// ── Recording State ──

let scrollTimer: ReturnType<typeof setTimeout> | null = null;
let lastScrollX = 0;
let lastScrollY = 0;
const SCROLL_MIN_DISTANCE = 200;
const SCROLL_DEBOUNCE_MS = 1000;

// Debounced input: track per-element pending values
const pendingInputs = new Map<HTMLElement, ReturnType<typeof setTimeout>>();
const INPUT_DEBOUNCE_MS = 800;

let recordingBadge: HTMLElement | null = null;
let lastUrl = '';
let lastClickSelector = '';
let lastClickTime = 0;
const CLICK_DEDUP_MS = 300;

// ── Emit Helper ──

function emitAction(action: Action) {
  try {
    chrome.runtime.sendMessage({ type: 'RECORD_ACTION', payload: action }).catch(() => {});
  } catch {
    // Extension context invalidated
  }
}

// ── Event Handlers ──

function handleClick(event: Event) {
  if (_suppressNextRecord) { _suppressNextRecord = false; return; }
  const e = event as MouseEvent;
  const raw = e.target as HTMLElement;
  if (!raw) return;
  if (raw === recordingBadge || recordingBadge?.contains(raw)) return;

  if (!isInteractiveElement(raw)) return;

  const target = findInteractiveAncestor(raw);
  const selector = getSelector(target);
  const now = Date.now();

  // Deduplicate rapid clicks on the same element
  if (selector === lastClickSelector && now - lastClickTime < CLICK_DEDUP_MS) return;
  lastClickSelector = selector;
  lastClickTime = now;

  flushAllPendingInputs();
  _showRipple(e.clientX, e.clientY);

  emitAction({
    type: 'click',
    selector,
    description: describeAction('click', target),
    timestamp: now,
  });
}

function handleDblClick(event: Event) {
  const raw = event.target as HTMLElement;
  if (!raw) return;
  const target = findInteractiveAncestor(raw);
  emitAction({
    type: 'dblclick',
    selector: getSelector(target),
    description: describeAction('dblclick', target),
    timestamp: Date.now(),
  });
}

function handleInput(event: Event) {
  if (_suppressNextRecord) return;
  const target = event.target as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
  if (!target) return;

  const el = target as HTMLElement;

  // For select elements, emit immediately (discrete choice, not typing)
  if (target.tagName.toLowerCase() === 'select') {
    emitAction({
      type: 'input',
      selector: getSelector(el),
      value: target.value,
      description: describeAction('input', el, target.value),
      timestamp: Date.now(),
    });
    return;
  }

  // For checkboxes/radios, skip (handled by click)
  if (target instanceof HTMLInputElement && (target.type === 'checkbox' || target.type === 'radio')) {
    return;
  }

  // Debounce: reset timer for this element
  const existing = pendingInputs.get(el);
  if (existing) clearTimeout(existing);

  pendingInputs.set(el, setTimeout(() => {
    flushInput(el);
  }, INPUT_DEBOUNCE_MS));
}

function handleInputBlur(event: Event) {
  const el = event.target as HTMLElement;
  if (pendingInputs.has(el)) {
    clearTimeout(pendingInputs.get(el)!);
    flushInput(el);
  }
}

function flushInput(el: HTMLElement) {
  pendingInputs.delete(el);
  const value = (el as HTMLInputElement).value;
  if (!value && !value?.trim()) return; // skip empty
  emitAction({
    type: 'input',
    selector: getSelector(el),
    value,
    description: describeAction('input', el, value),
    timestamp: Date.now(),
  });
}

function flushAllPendingInputs() {
  for (const [el] of pendingInputs) {
    clearTimeout(pendingInputs.get(el)!);
    flushInput(el);
  }
}

function handleKeydown(event: Event) {
  const e = event as KeyboardEvent;
  if (!isSpecialKeyEvent(e)) return;

  const target = e.target as HTMLElement;
  if (!target) return;

  // Build key label (e.g. "Ctrl+S", "Enter")
  const parts: string[] = [];
  if (e.ctrlKey) parts.push('Ctrl');
  if (e.metaKey) parts.push('Cmd');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');
  if (!['Control', 'Meta', 'Alt', 'Shift'].includes(e.key)) {
    parts.push(e.key);
  }
  const keyLabel = parts.join('+');
  if (!keyLabel) return;

  emitAction({
    type: 'keydown',
    selector: getSelector(target),
    value: keyLabel,
    description: describeAction('keydown', target, keyLabel),
    timestamp: Date.now(),
  });
}

function handleScroll() {
  if (scrollTimer) clearTimeout(scrollTimer);
  scrollTimer = setTimeout(() => {
    const dx = Math.abs(window.scrollX - lastScrollX);
    const dy = Math.abs(window.scrollY - lastScrollY);
    if (dx < SCROLL_MIN_DISTANCE && dy < SCROLL_MIN_DISTANCE) return;

    lastScrollX = window.scrollX;
    lastScrollY = window.scrollY;

    emitAction({
      type: 'scroll',
      selector: 'window',
      value: `${window.scrollX},${window.scrollY}`,
      description: 'Scrolled page',
      timestamp: Date.now(),
    });
  }, SCROLL_DEBOUNCE_MS);
}

function handleSubmit(event: Event) {
  const target = event.target as HTMLElement;
  if (!target) return;
  flushAllPendingInputs();
  emitAction({
    type: 'submit',
    selector: getSelector(target),
    description: describeAction('submit', target),
    timestamp: Date.now(),
  });
}

// ── Navigation Tracking ──

function handleNavigation() {
  const newUrl = location.href;
  if (newUrl === lastUrl) return;
  lastUrl = newUrl;
  emitAction({
    type: 'navigation',
    selector: 'window',
    value: newUrl,
    url: newUrl,
    description: `Navigated to ${location.pathname}`,
    timestamp: Date.now(),
  });
}

// ── Recording Badge ──

function showRecordingBadge() {
  if (recordingBadge) return;
  recordingBadge = document.createElement('div');
  recordingBadge.textContent = 'REC';
  Object.assign(recordingBadge.style, {
    position: 'fixed',
    top: '8px',
    right: '8px',
    zIndex: '2147483647',
    background: '#dc2626',
    color: '#fff',
    fontSize: '11px',
    fontWeight: 'bold',
    fontFamily: 'system-ui, sans-serif',
    padding: '3px 8px',
    borderRadius: '4px',
    pointerEvents: 'none',
    opacity: '0.85',
    animation: 'sentinel-blink 1.2s ease-in-out infinite',
  });
  // Inject blink animation
  const style = document.createElement('style');
  style.textContent = `@keyframes sentinel-blink { 0%,100% { opacity: 0.85; } 50% { opacity: 0.4; } }`;
  recordingBadge.appendChild(style);
  document.body.appendChild(recordingBadge);
}

function hideRecordingBadge() {
  if (recordingBadge) {
    recordingBadge.remove();
    recordingBadge = null;
  }
}

// ── Start / Stop Recording ──

function startRecording() {
  lastUrl = location.href;
  lastScrollX = window.scrollX;
  lastScrollY = window.scrollY;

  document.addEventListener('click', handleClick, true);
  document.addEventListener('dblclick', handleDblClick, true);
  document.addEventListener('input', handleInput, true);
  document.addEventListener('blur', handleInputBlur, true);
  document.addEventListener('keydown', handleKeydown, true);
  document.addEventListener('submit', handleSubmit, true);
  window.addEventListener('scroll', handleScroll, true);
  window.addEventListener('popstate', handleNavigation);
  window.addEventListener('hashchange', handleNavigation);

  showRecordingBadge();
  _startCursorDot();
  console.log('Sentinel: Recording started');
}

function stopRecording() {
  flushAllPendingInputs();

  document.removeEventListener('click', handleClick, true);
  document.removeEventListener('dblclick', handleDblClick, true);
  document.removeEventListener('input', handleInput, true);
  document.removeEventListener('blur', handleInputBlur, true);
  document.removeEventListener('keydown', handleKeydown, true);
  document.removeEventListener('submit', handleSubmit, true);
  window.removeEventListener('scroll', handleScroll, true);
  window.removeEventListener('popstate', handleNavigation);
  window.removeEventListener('hashchange', handleNavigation);

  hideRecordingBadge();
  _stopCursorDot();
  console.log('Sentinel: Recording stopped');
}

// ── Playback Engine ──

let playbackAbort: AbortController | null = null;
let playbackPaused = false;
let playbackResolveStep: (() => void) | null = null;

function waitForUnpause(signal: AbortSignal): Promise<void> {
  if (!playbackPaused) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const check = () => {
      if (signal.aborted) return reject(new DOMException('Aborted', 'AbortError'));
      if (!playbackPaused) return resolve();
      setTimeout(check, 100);
    };
    check();
  });
}

function waitForNextStep(signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    playbackResolveStep = () => {
      playbackResolveStep = null;
      resolve();
    };
    const onAbort = () => {
      playbackResolveStep = null;
      reject(new DOMException('Aborted', 'AbortError'));
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    }, { once: true });
  });
}

// ── Assertion Evaluation ──

function evaluateAssertion(assertion: Assertion): AssertionResult {
  try {
    const el = document.querySelector(assertion.selector);

    switch (assertion.type) {
      case 'exists':
        return { assertion, passed: el !== null };
      case 'visible': {
        if (!el) return { assertion, passed: false, error: 'Element not found' };
        const rect = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        const isVisible = rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
        return { assertion, passed: isVisible };
      }
      case 'hidden': {
        if (!el) return { assertion, passed: true };
        const rect = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        const isHidden = rect.width === 0 || rect.height === 0 || style.display === 'none' || style.visibility === 'hidden';
        return { assertion, passed: isHidden };
      }
      case 'text-contains': {
        if (!el) return { assertion, passed: false, error: 'Element not found' };
        const text = el.textContent ?? '';
        return { assertion, passed: text.includes(assertion.expected ?? ''), actual: text.slice(0, 200) };
      }
      case 'text-equals': {
        if (!el) return { assertion, passed: false, error: 'Element not found' };
        const text = (el.textContent ?? '').trim();
        return { assertion, passed: text === (assertion.expected ?? ''), actual: text.slice(0, 200) };
      }
      case 'has-class': {
        if (!el) return { assertion, passed: false, error: 'Element not found' };
        return { assertion, passed: el.classList.contains(assertion.expected ?? ''), actual: el.className };
      }
      default:
        return { assertion, passed: false, error: `Unknown assertion type: ${assertion.type}` };
    }
  } catch (err) {
    return { assertion, passed: false, error: String(err) };
  }
}

async function playbackSession(
  session: Action[],
  assertions: Assertion[],
  speed: number,
  stepByStep: boolean,
) {
  console.log('Sentinel: Starting playback...');
  playbackPaused = false;
  playbackAbort = new AbortController();
  const signal = playbackAbort.signal;
  const results: AssertionResult[] = [];

  try {
    for (let i = 0; i < session.length; i++) {
      if (signal.aborted) break;

      const action = session[i];

      chrome.runtime.sendMessage({
        type: 'PLAYBACK_PROGRESS',
        payload: { currentStep: i + 1, totalSteps: session.length },
      }).catch(() => {});

      await waitForUnpause(signal);

      if (action.type === 'scroll') {
        const [x, y] = (action.value || '0,0').split(',').map(Number);
        window.scrollTo({ left: x, top: y, behavior: 'smooth' });
        await delay(500 / speed, signal);
      } else if (action.type === 'navigation') {
        // Navigation events are informational during playback
        await delay(300 / speed, signal);
      } else {
        const element = document.querySelector(action.selector) as HTMLElement;

        if (element) {
          const originalOutline = element.style.outline;
          element.style.outline = '3px solid #ff0000';
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });

          await delay(800 / speed, signal);

          if (action.type === 'click') {
            element.click();
          } else if (action.type === 'dblclick') {
            element.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
          } else if (action.type === 'input') {
            (element as HTMLInputElement).value = action.value || '';
            element.dispatchEvent(new Event('input', { bubbles: true }));
            element.dispatchEvent(new Event('change', { bubbles: true }));
          } else if (action.type === 'keydown') {
            const key = action.value || '';
            element.dispatchEvent(
              new KeyboardEvent('keydown', { key, bubbles: true })
            );
          } else if (action.type === 'submit') {
            if (element instanceof HTMLFormElement) {
              element.requestSubmit();
            }
          }

          element.style.outline = originalOutline;
        } else {
          console.error(`Sentinel: Element not found for selector: ${action.selector}`);
        }
      }

      // Evaluate assertions scheduled after this step
      for (const assertion of assertions) {
        if (assertion.afterStep === i) {
          results.push(evaluateAssertion(assertion));
        }
      }

      await delay(500 / speed, signal);

      if (stepByStep && i < session.length - 1) {
        playbackPaused = true;
        chrome.runtime.sendMessage({
          type: 'PLAYBACK_PROGRESS',
          payload: { currentStep: i + 1, totalSteps: session.length },
        });
        await waitForNextStep(signal);
      }
    }
  } catch (err) {
    if ((err as DOMException)?.name === 'AbortError') {
      console.log('Sentinel: Playback aborted');
    } else {
      throw err;
    }
  }

  console.log('Sentinel: Playback complete');
  chrome.runtime.sendMessage({
    type: 'PLAYBACK_COMPLETE',
    payload: { results },
  }).catch(() => {});
}

// ── Error Tracking ──

let errorTrackingActive = false;
let originalConsoleError: (typeof console.error) | null = null;
let perfObserver: PerformanceObserver | null = null;

function emitError(source: import('./types').ErrorSource, message: string, extra?: { stack?: string; url?: string; statusCode?: number }) {
  try {
    chrome.runtime.sendMessage({
      type: 'ERROR_CAPTURED',
      payload: {
        source,
        message,
        stack: extra?.stack,
        url: extra?.url,
        statusCode: extra?.statusCode,
        timestamp: Date.now(),
      },
    }).catch(() => {});
  } catch {
    // Extension context invalidated
  }
}

function onWindowError(event: ErrorEvent) {
  emitError('unhandled-exception', event.message, {
    stack: event.error?.stack,
    url: `${event.filename}:${event.lineno}:${event.colno}`,
  });
}

function onUnhandledRejection(event: PromiseRejectionEvent) {
  const reason = event.reason;
  const message = reason instanceof Error ? reason.message : String(reason);
  const stack = reason instanceof Error ? reason.stack : undefined;
  emitError('unhandled-rejection', message, { stack });
}

function onCSPViolation(event: SecurityPolicyViolationEvent) {
  emitError('csp-violation', `Blocked '${event.violatedDirective}': ${event.blockedURI}`, {
    url: event.documentURI,
  });
}

function startErrorTracking() {
  if (errorTrackingActive) return;
  errorTrackingActive = true;

  // Wrap console.error
  originalConsoleError = console.error;
  console.error = (...args: unknown[]) => {
    originalConsoleError!.apply(console, args);
    const message = args.map(a => (a instanceof Error ? a.message : String(a))).join(' ');
    const stack = args.find(a => a instanceof Error)?.stack;
    emitError('console-error', message, { stack: stack as string | undefined });
  };

  window.addEventListener('error', onWindowError);
  window.addEventListener('unhandledrejection', onUnhandledRejection);
  document.addEventListener('securitypolicyviolation', onCSPViolation);

  // Network errors via PerformanceObserver
  try {
    perfObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const res = entry as PerformanceResourceTiming;
        // Failed requests: transferSize 0 with a name that looks like a URL
        if (res.transferSize === 0 && res.responseStatus && res.responseStatus >= 400) {
          emitError('network-error', `${res.responseStatus} ${res.name}`, {
            url: res.name,
            statusCode: res.responseStatus,
          });
        }
      }
    });
    perfObserver.observe({ type: 'resource', buffered: false });
  } catch {
    // PerformanceObserver not supported or responseStatus not available
  }

  console.log('Sentinel: Error tracking started');
}

function stopErrorTracking() {
  if (!errorTrackingActive) return;
  errorTrackingActive = false;

  if (originalConsoleError) {
    console.error = originalConsoleError;
    originalConsoleError = null;
  }

  window.removeEventListener('error', onWindowError);
  window.removeEventListener('unhandledrejection', onUnhandledRejection);
  document.removeEventListener('securitypolicyviolation', onCSPViolation);

  if (perfObserver) {
    perfObserver.disconnect();
    perfObserver = null;
  }

  console.log('Sentinel: Error tracking stopped');
}

// ── Element Inspector ──

let inspectionPurpose: 'assertion' | 'feature-request' = 'assertion';
let inspectOverlay: HTMLElement | null = null;

function highlightElement(e: MouseEvent) {
  const target = e.target as HTMLElement;
  if (!target || target === inspectOverlay) return;
  if (inspectOverlay) {
    inspectOverlay.style.top = `${target.getBoundingClientRect().top + window.scrollY}px`;
    inspectOverlay.style.left = `${target.getBoundingClientRect().left + window.scrollX}px`;
    inspectOverlay.style.width = `${target.offsetWidth}px`;
    inspectOverlay.style.height = `${target.offsetHeight}px`;
  }
}

function selectElement(e: MouseEvent) {
  e.preventDefault();
  e.stopPropagation();
  const target = e.target as HTMLElement;
  if (!target || target === inspectOverlay) return;

  const selector = getSelector(target);
  chrome.runtime.sendMessage({ type: 'ELEMENT_SELECTED', payload: { selector, purpose: inspectionPurpose } }).catch(() => {});
  stopInspection();
}

function startInspection() {
  inspectOverlay = document.createElement('div');
  Object.assign(inspectOverlay.style, {
    position: 'absolute',
    border: '2px solid #f97316',
    backgroundColor: 'rgba(249, 115, 22, 0.1)',
    pointerEvents: 'none',
    zIndex: '2147483647',
    transition: 'all 0.1s ease',
  });
  document.body.appendChild(inspectOverlay);
  document.addEventListener('mousemove', highlightElement, true);
  document.addEventListener('click', selectElement, true);
}

function stopInspection() {
  if (inspectOverlay) {
    inspectOverlay.remove();
    inspectOverlay = null;
  }
  document.removeEventListener('mousemove', highlightElement, true);
  document.removeEventListener('click', selectElement, true);
}

// ── Auto-start if recording / error tracking is already active ──

chrome.storage.local.get(['isRecording', 'isErrorTracking'], (result) => {
  if (result.isRecording) {
    console.log('Sentinel: Recording already active, attaching listeners');
    startRecording();
  }
  if (result.isErrorTracking) {
    console.log('Sentinel: Error tracking already active, attaching listeners');
    startErrorTracking();
  }
});

// ── Message Listener ──

chrome.runtime.onMessage.addListener((message: Message, _sender, sendResponse) => {
  switch (message.type) {
    case 'PING':
      sendResponse({ alive: true, url: location.href, title: document.title });
      return true;

    case 'START_RECORDING':
      startRecording();
      break;
    case 'STOP_RECORDING':
      stopRecording();
      break;
    case 'START_PLAYBACK': {
      const p = message.payload as {
        session: Action[];
        assertions: Assertion[];
        speed: number;
        stepByStep: boolean;
      };
      playbackSession(p.session, p.assertions || [], p.speed || 1, p.stepByStep || false);
      break;
    }
    case 'PAUSE_PLAYBACK':
      playbackPaused = true;
      break;
    case 'RESUME_PLAYBACK':
      playbackPaused = false;
      break;
    case 'STOP_PLAYBACK':
      playbackAbort?.abort();
      break;
    case 'NEXT_STEP':
      playbackPaused = false;
      if (playbackResolveStep) playbackResolveStep();
      break;
    case 'START_INSPECTION':
      inspectionPurpose = 'assertion';
      startInspection();
      break;
    case 'STOP_INSPECTION':
      stopInspection();
      break;
    case 'START_FEATURE_INSPECTION':
      inspectionPurpose = 'feature-request';
      startInspection();
      break;
    case 'START_ERROR_TRACKING':
      startErrorTracking();
      break;
    case 'STOP_ERROR_TRACKING':
      stopErrorTracking();
      break;

    // ── API Handlers (MCP bridge) ──

    case 'API_INJECT_ACTION': {
      const p = message.payload as { type: string; selector: string; value?: string };
      const el = document.querySelector(p.selector) as HTMLElement;
      if (!el) {
        sendResponse({ success: false, error: `Element not found: ${p.selector}` });
        return true;
      }
      // Visual feedback
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      _showRipple(cx, cy);
      _flashElement(el);
      if (_cursorDot) {
        _cursorDot.style.left = `${cx}px`;
        _cursorDot.style.top = `${cy}px`;
      } else {
        _ensureFeedbackStyles();
        _cursorDot = document.createElement('div');
        _cursorDot.className = '__s-cursor';
        _cursorDot.style.left = `${cx}px`;
        _cursorDot.style.top = `${cy}px`;
        (document.body || document.documentElement).appendChild(_cursorDot);
      }
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      // Suppress recording listener so background handles session + screenshot directly
      _suppressNextRecord = true;
      setTimeout(() => {
        try {
          if (p.type === 'click') {
            el.click();
          } else if (p.type === 'dblclick') {
            _suppressNextRecord = false; // dblclick doesn't trigger handleClick
            el.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
          } else if (p.type === 'input') {
            _suppressNextRecord = false; // input suppressed above in handleInput guard
            (el as HTMLInputElement).value = p.value || '';
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
          } else if (p.type === 'keydown') {
            _suppressNextRecord = false;
            el.dispatchEvent(new KeyboardEvent('keydown', { key: p.value || '', bubbles: true }));
          } else if (p.type === 'submit') {
            _suppressNextRecord = false;
            if (el instanceof HTMLFormElement) el.requestSubmit();
          } else if (p.type === 'scroll') {
            _suppressNextRecord = false;
            const [x, y] = (p.value || '0,0').split(',').map(Number);
            window.scrollTo({ left: x, top: y, behavior: 'smooth' });
          }
          sendResponse({
            success: true,
            description: describeAction(p.type, el, p.value),
            type: p.type,
            selector: p.selector,
            value: p.value,
          });
        } catch (err) {
          _suppressNextRecord = false;
          sendResponse({ success: false, error: String(err) });
        }
      }, 50);
      return true;
    }

    case 'API_WAIT_FOR_ELEMENT': {
      const p = message.payload as { selector: string; timeout?: number };
      const timeout = p.timeout || 10000;
      const existing = document.querySelector(p.selector);
      if (existing) {
        sendResponse({ found: true, text: (existing.textContent || '').trim().slice(0, 200) });
        return true;
      }
      let resolved = false;
      const observer = new MutationObserver(() => {
        const el = document.querySelector(p.selector);
        if (el && !resolved) {
          resolved = true;
          observer.disconnect();
          sendResponse({ found: true, text: (el.textContent || '').trim().slice(0, 200) });
        }
      });
      observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true });
      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          observer.disconnect();
          sendResponse({ found: false });
        }
      }, timeout);
      return true;
    }

    case 'API_EVALUATE_SELECTOR': {
      const p = message.payload as { selector: string };
      const el = document.querySelector(p.selector) as HTMLElement | null;
      if (!el) {
        sendResponse({ exists: false });
        return true;
      }
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      sendResponse({
        exists: true,
        text: (el.textContent || '').trim().slice(0, 200),
        tagName: el.tagName.toLowerCase(),
        visible: rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden',
        rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
      });
      return true;
    }

    case 'API_GET_PAGE_SNAPSHOT': {
      const p = (message.payload || {}) as {
        role?: string; regionTop?: number; regionBottom?: number; limit?: number;
      };
      const filterRole = p.role?.toLowerCase();
      const regionTop = p.regionTop ?? -Infinity;
      const regionBottom = p.regionBottom ?? Infinity;
      const limit = p.limit ?? 40;

      const seen = new Set<Element>();
      const elements: Array<{
        selector: string; tag: string; role?: string; text: string;
        type?: string; value?: string; placeholder?: string;
        rect: { top: number; left: number; width: number; height: number };
      }> = [];
      const candidates = document.querySelectorAll<HTMLElement>(
        'a,button,input,select,textarea,[role="button"],[role="link"],[role="tab"],[role="menuitem"],[role="checkbox"],[role="radio"],[role="combobox"],[role="listbox"],[tabindex],[onclick]'
      );
      for (const el of candidates) {
        if (seen.has(el)) continue;
        seen.add(el);
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        const visible = r.width > 0 && r.height > 0 && cs.display !== 'none' && cs.visibility !== 'hidden' && cs.opacity !== '0';
        if (!visible) continue;
        // Region filter
        if (r.top > regionBottom || r.bottom < regionTop) continue;
        // Role filter
        const elRole = el.getAttribute('role') || el.tagName.toLowerCase();
        if (filterRole && !elRole.toLowerCase().includes(filterRole)) continue;
        const tag = el.tagName.toLowerCase();
        const inp = el as HTMLInputElement;
        elements.push({
          selector: getSelector(el), tag,
          role: el.getAttribute('role') || undefined,
          text: (el.textContent || '').trim().slice(0, 60),
          type: inp.type || undefined,
          value: (tag === 'input' || tag === 'select' || tag === 'textarea') ? inp.value : undefined,
          placeholder: inp.placeholder || undefined,
          rect: { top: Math.round(r.top), left: Math.round(r.left), width: Math.round(r.width), height: Math.round(r.height) },
        });
        if (elements.length >= limit) break;
      }
      sendResponse({
        title: document.title,
        url: location.href,
        elements,
        count: elements.length,
      });
      return true;
    }

    case 'API_FIND_ELEMENT': {
      const p = message.payload as { text?: string; role?: string; tag?: string; limit?: number; includeHidden?: boolean };
      const searchText = (p.text || '').toLowerCase();
      const searchRole = p.role?.toLowerCase();
      const searchTag = p.tag?.toLowerCase();
      const limit = p.limit ?? 5;
      const includeHidden = p.includeHidden ?? false;
      const results: Array<{ selector: string; tag: string; text: string; visible: boolean }> = [];
      for (const el of document.querySelectorAll<HTMLElement>('*')) {
        const elTag = el.tagName.toLowerCase();
        if (searchTag && elTag !== searchTag) continue;
        if (searchRole && el.getAttribute('role')?.toLowerCase() !== searchRole) continue;
        if (searchText) {
          const elText = (el.textContent || '').trim().toLowerCase();
          const ariaLabel = (el.getAttribute('aria-label') || '').toLowerCase();
          const ph = ((el as HTMLInputElement).placeholder || '').toLowerCase();
          if (!elText.includes(searchText) && !ariaLabel.includes(searchText) && !ph.includes(searchText)) continue;
        }
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        const visible = r.width > 0 && r.height > 0 && cs.display !== 'none' && cs.visibility !== 'hidden';
        if (!visible && !includeHidden) continue;
        results.push({
          selector: getSelector(el), tag: elTag,
          text: (el.textContent || '').trim().slice(0, 60),
          visible,
        });
        if (results.length >= limit) break;
      }
      sendResponse({ results });
      return true;
    }

    case 'API_GET_TEXT_CONTENT': {
      const p = message.payload as { selector: string };
      const el = document.querySelector(p.selector);
      sendResponse(el ? { exists: true, text: (el.textContent || '').trim() } : { exists: false, text: '' });
      return true;
    }

    case 'API_GET_ELEMENT_STATE': {
      const p = message.payload as { selector: string };
      const el = document.querySelector(p.selector) as HTMLInputElement | null;
      if (!el) { sendResponse({ exists: false }); return true; }
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      sendResponse({
        exists: true, tag: el.tagName.toLowerCase(),
        value: el.value, checked: el.checked, disabled: el.disabled,
        readOnly: el.readOnly, visible: r.width > 0 && r.height > 0 && cs.display !== 'none' && cs.visibility !== 'hidden',
        text: (el.textContent || '').trim().slice(0, 200),
        className: el.className, placeholder: el.placeholder,
      });
      return true;
    }

    case 'API_HOVER': {
      const p = message.payload as { selector: string };
      const el = document.querySelector(p.selector) as HTMLElement | null;
      if (!el) { sendResponse({ success: false, error: `Element not found: ${p.selector}` }); return true; }
      el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
      _flashElement(el);
      const r = el.getBoundingClientRect();
      _showRipple(r.left + r.width / 2, r.top + r.height / 2);
      sendResponse({ success: true });
      return true;
    }

    case 'API_SELECT_OPTION': {
      const p = message.payload as { selector: string; value: string };
      const el = document.querySelector(p.selector) as HTMLSelectElement | null;
      if (!el) { sendResponse({ success: false, error: `Element not found: ${p.selector}` }); return true; }
      el.value = p.value;
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.dispatchEvent(new Event('input', { bubbles: true }));
      _flashElement(el);
      sendResponse({ success: true, value: el.value });
      return true;
    }

    case 'API_KEY_SEQUENCE': {
      const p = message.payload as { keys: string; selector?: string };
      const target = (p.selector ? document.querySelector(p.selector) as HTMLElement : null)
        ?? (document.activeElement as HTMLElement)
        ?? document.body;
      const parts = p.keys.split('+');
      const key = parts[parts.length - 1];
      const opts: KeyboardEventInit = {
        key, bubbles: true, cancelable: true,
        ctrlKey: parts.includes('Ctrl') || parts.includes('Control'),
        metaKey: parts.includes('Cmd') || parts.includes('Meta'),
        altKey: parts.includes('Alt'),
        shiftKey: parts.includes('Shift'),
      };
      target.dispatchEvent(new KeyboardEvent('keydown', opts));
      target.dispatchEvent(new KeyboardEvent('keypress', opts));
      target.dispatchEvent(new KeyboardEvent('keyup', opts));
      sendResponse({ success: true });
      return true;
    }

    case 'API_DRAG': {
      const p = message.payload as { source: string; target: string };
      const src = document.querySelector(p.source) as HTMLElement | null;
      const dst = document.querySelector(p.target) as HTMLElement | null;
      if (!src) { sendResponse({ success: false, error: `Source not found: ${p.source}` }); return true; }
      if (!dst) { sendResponse({ success: false, error: `Target not found: ${p.target}` }); return true; }
      const sr = src.getBoundingClientRect();
      const dr = dst.getBoundingClientRect();
      const dt = new DataTransfer();
      const mkDrag = (type: string, el: HTMLElement, x: number, y: number) =>
        el.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt, clientX: x, clientY: y }));
      const sx = sr.left + sr.width / 2, sy = sr.top + sr.height / 2;
      const dx = dr.left + dr.width / 2, dy = dr.top + dr.height / 2;
      mkDrag('dragstart', src, sx, sy);
      mkDrag('dragover', dst, dx, dy);
      mkDrag('drop', dst, dx, dy);
      mkDrag('dragend', src, sx, sy);
      _showRipple(sx, sy);
      _showRipple(dx, dy);
      sendResponse({ success: true });
      return true;
    }

    case 'API_WAIT_FOR_TEXT': {
      const p = message.payload as { text: string; selector?: string; timeout?: number };
      const timeout = p.timeout || 10000;
      const checkFn = () => {
        const root = p.selector ? document.querySelector(p.selector) : document.body;
        return root && (root.textContent || '').includes(p.text);
      };
      if (checkFn()) { sendResponse({ found: true }); return true; }
      let resolved = false;
      const obs = new MutationObserver(() => {
        if (!resolved && checkFn()) {
          resolved = true; obs.disconnect(); sendResponse({ found: true });
        }
      });
      obs.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
      setTimeout(() => { if (!resolved) { resolved = true; obs.disconnect(); sendResponse({ found: false }); } }, timeout);
      return true;
    }

    case 'API_GET_NETWORK_LOG': {
      sendResponse({ entries: _networkLog.slice() });
      return true;
    }

    case 'API_WAIT_FOR_NETWORK_IDLE': {
      const p = message.payload as { duration?: number; timeout?: number };
      const quietMs = p.duration || 500;
      const maxWait = p.timeout || 15000;
      const start = Date.now();
      const check = () => {
        if (Date.now() - start > maxWait) {
          sendResponse({ idle: false, timedOut: true, pendingCount: _pendingNetCount }); return;
        }
        if (_pendingNetCount === 0) {
          setTimeout(() => {
            if (_pendingNetCount === 0) sendResponse({ idle: true });
            else check();
          }, quietMs);
        } else {
          setTimeout(check, 100);
        }
      };
      check();
      return true;
    }

    case 'API_GET_CONSOLE_LOG': {
      sendResponse({ entries: _consoleLog.slice() });
      return true;
    }
  }
});
