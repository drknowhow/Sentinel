/**
 * Sentinel Page Error Bridge
 * 
 * This script runs in the page's MAIN world (via manifest.json "world": "MAIN").
 * It intercepts console.error, fetch/XHR errors, uncaught exceptions, and
 * unhandled promise rejections, then relays them to the content script's
 * isolated world via window.postMessage.
 * 
 * This bypasses CSP restrictions that block inline <script> injection.
 */
(function () {
    if (window.__sentinelBridgeInstalled) return;
    window.__sentinelBridgeInstalled = true;

    // ── Console interception ──
    ['error', 'warn', 'log', 'info', 'debug'].forEach(function (level) {
        var original = console[level].bind(console);
        console[level] = function () {
            original.apply(console, arguments);
            var msg = Array.prototype.slice.call(arguments).map(function (x) {
                return typeof x === 'string' ? x : (x instanceof Error ? x.message : JSON.stringify(x));
            }).join(' ');
            window.postMessage({ __sentinel: 'console', level: level, message: msg }, '*');
        };
    });

    // ── Fetch interception ──
    var _origFetch = window.fetch;
    window.fetch = function () {
        var args = arguments;
        var url = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url) || '';
        var method = (args[1] && args[1].method) || 'GET';
        var t = Date.now();
        window.postMessage({ __sentinel: 'net_start', url: url, method: method }, '*');
        return _origFetch.apply(this, args).then(function (r) {
            window.postMessage({ __sentinel: 'net_end', url: url, method: method, status: r.status, duration: Date.now() - t }, '*');
            return r;
        }).catch(function (e) {
            window.postMessage({ __sentinel: 'net_error', url: url, method: method, error: String(e), duration: Date.now() - t }, '*');
            throw e;
        });
    };

    // ── XHR interception ──
    var _OrigXHR = window.XMLHttpRequest;
    function SentinelXHR() {
        var xhr = new _OrigXHR();
        var _method = 'GET', _url = '', _startTime = 0;
        var _origOpen = xhr.open.bind(xhr);
        xhr.open = function (m, u) { _method = m; _url = u; return _origOpen.apply(xhr, arguments); };
        var _origSend = xhr.send.bind(xhr);
        xhr.send = function () {
            _startTime = Date.now();
            window.postMessage({ __sentinel: 'net_start', url: _url, method: _method }, '*');
            xhr.addEventListener('load', function () {
                window.postMessage({ __sentinel: 'net_end', url: _url, method: _method, status: xhr.status, duration: Date.now() - _startTime }, '*');
            });
            xhr.addEventListener('error', function () {
                window.postMessage({ __sentinel: 'net_error', url: _url, method: _method, error: 'Network error', duration: Date.now() - _startTime }, '*');
            });
            return _origSend.apply(xhr, arguments);
        };
        return xhr;
    }
    SentinelXHR.prototype = _OrigXHR.prototype;
    window.XMLHttpRequest = SentinelXHR;

    // ── Uncaught error interception (runs in page's main world!) ──
    window.addEventListener('error', function (event) {
        window.postMessage({
            __sentinel: 'page_error',
            source: 'unhandled-exception',
            message: event.message || String(event),
            stack: event.error ? event.error.stack : undefined,
            url: (event.filename || '') + ':' + (event.lineno || 0) + ':' + (event.colno || 0)
        }, '*');
    });

    // ── Unhandled promise rejection interception ──
    window.addEventListener('unhandledrejection', function (event) {
        var reason = event.reason;
        var message = reason instanceof Error ? reason.message : String(reason);
        var stack = reason instanceof Error ? reason.stack : undefined;
        window.postMessage({
            __sentinel: 'page_error',
            source: 'unhandled-rejection',
            message: message,
            stack: stack
        }, '*');
    });
})();
