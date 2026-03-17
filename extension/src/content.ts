import type { Action, Assertion, AssertionResult, Message } from './types';

// ── Selector Generation ──

function getSelector(el: HTMLElement): string {
  const testId = el.getAttribute('data-testid');
  if (testId) return `[data-testid="${testId}"]`;

  const ariaLabel = el.getAttribute('aria-label');
  if (ariaLabel) return `[aria-label="${ariaLabel}"]`;

  if ('name' in el && (el as HTMLInputElement).name) {
    return `${el.tagName.toLowerCase()}[name="${(el as HTMLInputElement).name}"]`;
  }

  if (el.id) return `#${el.id}`;
  if (el.tagName === 'BODY') return 'body';

  const path: string[] = [];
  let current: HTMLElement | null = el;

  while (current && current.tagName !== 'HTML') {
    let selector = current.tagName.toLowerCase();
    if (current.className && typeof current.className === 'string') {
      const classes = current.className
        .split(/\s+/)
        .filter(c => c && !c.includes(':'));
      if (classes.length > 0) selector += '.' + classes.join('.');
    }
    const siblings = Array.from(current.parentNode?.children || []).filter(
      s => s.tagName === current?.tagName
    );
    if (siblings.length > 1) {
      const index = siblings.indexOf(current) + 1;
      selector += `:nth-of-type(${index})`;
    }
    path.unshift(selector);
    current = current.parentElement;
  }

  const fullSelector = path.join(' > ');
  try {
    if (document.querySelector(fullSelector) === el) return fullSelector;
  } catch { /* invalid selector, fall through */ }
  return fullSelector;
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
  const raw = event.target as HTMLElement;
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
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      try {
        if (p.type === 'click') {
          el.click();
        } else if (p.type === 'dblclick') {
          el.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
        } else if (p.type === 'input') {
          (el as HTMLInputElement).value = p.value || '';
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        } else if (p.type === 'keydown') {
          el.dispatchEvent(new KeyboardEvent('keydown', { key: p.value || '', bubbles: true }));
        } else if (p.type === 'submit') {
          if (el instanceof HTMLFormElement) el.requestSubmit();
        } else if (p.type === 'scroll') {
          const [x, y] = (p.value || '0,0').split(',').map(Number);
          window.scrollTo({ left: x, top: y, behavior: 'smooth' });
        }
        sendResponse({ success: true, description: describeAction(p.type, el, p.value) });
      } catch (err) {
        sendResponse({ success: false, error: String(err) });
      }
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
  }
});
