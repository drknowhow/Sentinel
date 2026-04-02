import { useState, useEffect, useCallback } from 'react';

// ── MCP Connection Status ──

type McpStatus = 'unknown' | 'connected' | 'disconnected' | 'error';

interface McpServerInfo {
  name: string;
  command: string;
  status: McpStatus;
}

function useMcpStatus() {
  const [status, setStatus] = useState<McpStatus>('unknown');

  // Ask the background service worker for its actual WS connection state.
  // Previously this opened a probe WebSocket directly, which would temporarily
  // displace the background's persistent connection in sentinel_mcp.py.
  const checkStatus = useCallback(() => {
    chrome.runtime.sendMessage({ type: 'WS_GET_STATUS' })
      .then((res: { connected: boolean }) => {
        setStatus(res?.connected ? 'connected' : 'disconnected');
      })
      .catch(() => setStatus('error'));
  }, []);

  const reconnect = useCallback(() => {
    setStatus('unknown');
    chrome.runtime.sendMessage({ type: 'WS_RECONNECT' })
      .then(() => setTimeout(checkStatus, 1500))
      .catch(() => setStatus('error'));
  }, [checkStatus]);

  useEffect(() => {
    checkStatus();
    const interval = setInterval(checkStatus, 10000);
    return () => clearInterval(interval);
  }, [checkStatus]);

  return { status, refresh: checkStatus, reconnect };
}

// ── Status Badge ──

function StatusBadge({ status }: { status: McpStatus }) {
  const config: Record<McpStatus, { label: string; bg: string; text: string; dot: string }> = {
    connected: { label: 'Connected', bg: 'bg-green-50', text: 'text-green-700', dot: 'bg-green-500' },
    disconnected: { label: 'Disconnected', bg: 'bg-gray-50', text: 'text-gray-500', dot: 'bg-gray-400' },
    error: { label: 'Error', bg: 'bg-red-50', text: 'text-red-600', dot: 'bg-red-500' },
    unknown: { label: 'Checking...', bg: 'bg-yellow-50', text: 'text-yellow-600', dot: 'bg-yellow-400' },
  };
  const c = config[status];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold ${c.bg} ${c.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
      {c.label}
    </span>
  );
}

// ── Collapsible Section ──

function Section({ title, children, defaultOpen = false }: {
  title: string; children: React.ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-gray-100 last:border-b-0">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between py-2.5 px-3 text-xs font-semibold text-gray-600 hover:text-gray-900 hover:bg-gray-50 transition-colors"
      >
        {title}
        <svg
          width="10" height="10" viewBox="0 0 24 24"
          fill="none" stroke="currentColor" strokeWidth="2.5"
          strokeLinecap="round" strokeLinejoin="round"
          className={`transition-transform ${open ? 'rotate-180' : ''}`}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && <div className="px-3 pb-3">{children}</div>}
    </div>
  );
}

// ── MCP Launcher Hook ──

type LauncherStatus = 'unknown' | 'running' | 'stopped' | 'not_installed';

const LAUNCHER_STATUS_KEY = 'mcpLauncherStatus';

function useMcpLauncher() {
  const [status, setStatus] = useState<LauncherStatus>('unknown');
  const [busy, setBusy] = useState(false);

  // Persist status so it survives tab switches (component unmount/remount)
  const persist = useCallback((s: LauncherStatus) => {
    setStatus(s);
    chrome.storage.local.set({ [LAUNCHER_STATUS_KEY]: s });
  }, []);

  const query = useCallback(async () => {
    try {
      const res = await chrome.runtime.sendMessage({ type: 'MCP_LAUNCHER_STATUS' });
      if (res?.notInstalled) persist('not_installed');
      else if (res?.status === 'running') persist('running');
      else persist('stopped');
    } catch {
      persist('not_installed');
    }
  }, [persist]);

  useEffect(() => {
    // Restore cached status immediately to prevent flash of wrong state
    chrome.storage.local.get(LAUNCHER_STATUS_KEY, (r) => {
      if (r[LAUNCHER_STATUS_KEY]) setStatus(r[LAUNCHER_STATUS_KEY] as LauncherStatus);
    });
    query();
  }, [query]);

  const start = async () => {
    setBusy(true);
    try {
      const res = await chrome.runtime.sendMessage({ type: 'LAUNCH_MCP_SERVER' });
      if (res?.notInstalled) persist('not_installed');
      else if (res?.success) persist('running');
    } finally { setBusy(false); }
  };

  const stop = async () => {
    setBusy(true);
    try {
      const res = await chrome.runtime.sendMessage({ type: 'STOP_MCP_SERVER' });
      if (res?.success) persist('stopped');
    } finally { setBusy(false); }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await chrome.runtime.sendMessage({ type: 'REMOVE_MCP_LAUNCHER' });
      persist('not_installed');
    } finally { setBusy(false); }
  };

  const forceRestart = async () => {
    setBusy(true);
    try {
      const res = await chrome.runtime.sendMessage({ type: 'FORCE_RESTART_MCP' });
      if (res?.notInstalled) persist('not_installed');
      else if (res?.success) persist('running');
    } finally { setBusy(false); }
  };

  return { status, busy, start, stop, remove, forceRestart, refresh: query };
}

// ── MCP Server Card ──

function McpServerCard({ server, onDelete }: {
  server: McpServerInfo; onDelete?: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2 p-2 bg-gray-50 rounded-lg">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold text-gray-800 truncate">{server.name}</span>
          <StatusBadge status={server.status} />
        </div>
        <div className="text-[10px] text-gray-400 truncate mt-0.5 font-mono">{server.command}</div>
      </div>
      {onDelete && (
        <button
          onClick={onDelete}
          className="flex-shrink-0 p-1 text-gray-300 hover:text-red-500 transition-colors"
          title="Remove server"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          </svg>
        </button>
      )}
    </div>
  );
}

// ── Install Dependencies Panel ──

function InstallPanel() {
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  return (
    <div className="space-y-2">
      <p className="text-[10px] text-gray-500 leading-relaxed">
        Sentinel works best when setup is explicit: install Python dependencies, register the native host once if you want Start/Stop controls, then install the project MCP config.
      </p>
      <div className="rounded border border-gray-200 bg-gray-50 p-2 text-[10px] text-gray-600 space-y-1">
        <div className="font-semibold text-gray-700">Recommended order</div>
        <div>1. <code className="bg-white px-1 rounded">pip install -r mcp-server/requirements.txt</code></div>
        <div>2. <code className="bg-white px-1 rounded">python mcp-server/install_host.py &lt;extension-id&gt;</code></div>
        <div>3. Use Project &rarr; <strong>Install MCP</strong> to write the project config</div>
        <div>4. Use MCP Bridge &rarr; <strong>Start</strong></div>
      </div>
      <button
        onClick={() => {
          const command = 'pip install -r mcp-server/requirements.txt';
          navigator.clipboard.writeText(command).catch(() => {});
          setResult({ ok: true, message: command });
        }}
        className="w-full py-1.5 px-3 text-[11px] font-semibold text-white bg-cyan-600 hover:bg-cyan-700 rounded-md transition-colors"
      >
        Copy First Command
      </button>
      {result && (
        <div className={`p-2 rounded text-[10px] font-mono ${result.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
          {result.message}
        </div>
      )}
      <div className="grid grid-cols-2 gap-2 text-[10px]">
        <div className="rounded bg-white border border-gray-200 p-2">
          <div className="font-semibold text-gray-700">Manual server</div>
          <div className="mt-1 font-mono text-gray-600">python mcp-server/sentinel_mcp.py</div>
        </div>
        <div className="rounded bg-white border border-gray-200 p-2">
          <div className="font-semibold text-gray-700">Symptoms</div>
          <div className="mt-1 text-gray-500">Disconnected badge, hanging start, or missing tools usually means one of the four setup steps is incomplete.</div>
        </div>
      </div>
    </div>
  );
}

// ── Project Setting ──














function PortSetting() {
  const [port, setPort] = useState('18925');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    chrome.storage.local.get('mcpPort', (r) => {
      if (r.mcpPort) setPort(String(r.mcpPort));
    });
  }, []);

  const save = () => {
    const p = parseInt(port, 10);
    if (p > 0 && p < 65536) {
      chrome.storage.local.set({ mcpPort: p });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <label className="text-[10px] text-gray-500 flex-shrink-0">WebSocket Port</label>
      <input
        value={port}
        onChange={e => setPort(e.target.value)}
        className="w-20 px-2 py-1 text-[11px] font-mono border border-gray-200 rounded text-center focus:outline-none focus:border-cyan-400"
      />
      <button
        onClick={save}
        className="px-2 py-1 text-[10px] font-semibold text-cyan-600 hover:text-cyan-700 border border-gray-200 rounded transition-colors"
      >
        {saved ? 'Saved!' : 'Save'}
      </button>
    </div>
  );
}

// ── Clear Data ──

function ClearDataSection() {
  const [confirm, setConfirm] = useState<string | null>(null);

  const clearData = (key: string, _label: string) => {
    if (confirm !== key) {
      setConfirm(key);
      setTimeout(() => setConfirm(null), 3000);
      return;
    }
    const storageKey = key === 'issues' ? 'sentinel_issues' :
                       key === 'errors' ? 'capturedErrors' :
                       key === 'sessions' ? 'sentinel_sessions' : key;
    chrome.storage.local.set({ [storageKey]: key === 'sessions' ? [] : [] });
    setConfirm(null);
  };

  return (
    <div className="space-y-1.5">
      {[
        { key: 'sessions', label: 'Saved Sessions' },
        { key: 'issues', label: 'Issues' },
        { key: 'errors', label: 'Captured Errors' },
      ].map(({ key, label }) => (
        <button
          key={key}
          onClick={() => clearData(key, label)}
          className={`w-full flex items-center justify-between py-1.5 px-2.5 text-[11px] rounded transition-colors ${
            confirm === key
              ? 'bg-red-50 text-red-600 font-semibold'
              : 'text-gray-600 hover:bg-gray-50'
          }`}
        >
          <span>{confirm === key ? `Confirm clear ${label}?` : `Clear ${label}`}</span>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          </svg>
        </button>
      ))}
    </div>
  );
}

// ── Supported AI Tools ──

interface AiTool {
  id: string;
  name: string;
  configFile: string;
  snippet: string;
}

const AI_TOOLS: AiTool[] = [
  {
    id: 'claude-code',
    name: 'Claude Code',
    configFile: '.mcp.json',
    snippet: JSON.stringify({ mcpServers: { sentinel: { command: 'python', args: ['mcp-server/sentinel_mcp.py'] } } }, null, 2),
  },
  {
    id: 'claude-desktop',
    name: 'Claude Desktop',
    configFile: 'claude_desktop_config.json',
    snippet: JSON.stringify({ mcpServers: { sentinel: { command: 'python', args: ['mcp-server/sentinel_mcp.py'] } } }, null, 2),
  },
  {
    id: 'cursor',
    name: 'Cursor',
    configFile: '.cursor/mcp.json',
    snippet: JSON.stringify({ mcpServers: { sentinel: { command: 'python', args: ['mcp-server/sentinel_mcp.py'] } } }, null, 2),
  },
  {
    id: 'vscode-copilot',
    name: 'VS Code Copilot',
    configFile: '.vscode/settings.json',
    snippet: JSON.stringify({ mcp: { servers: { sentinel: { command: 'python', args: ['mcp-server/sentinel_mcp.py'] } } } }, null, 2),
  },
  {
    id: 'codex',
    name: 'Codex',
    configFile: '.codex/config.toml',
    snippet: `[[mcp_servers]]\nname = "sentinel"\ncommand = "python"\nargs = ["mcp-server/sentinel_mcp.py"]`,
  },
];

function AiToolsSection() {
  const [installed, setInstalled] = useState<string[]>([]);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    chrome.storage.local.get('mcpInstalledTools', (r) => {
      if (r.mcpInstalledTools) setInstalled(r.mcpInstalledTools as string[]);
    });
  }, []);

  const saveInstalled = (ids: string[]) => {
    setInstalled(ids);
    chrome.storage.local.set({ mcpInstalledTools: ids });
  };

  const install = (tool: AiTool) => {
    navigator.clipboard.writeText(tool.snippet).catch(() => {});
    setCopied(tool.id);
    setTimeout(() => setCopied(null), 2000);
    if (!installed.includes(tool.id)) saveInstalled([...installed, tool.id]);
  };

  const remove = (id: string) => saveInstalled(installed.filter(i => i !== id));

  return (
    <div className="space-y-1.5">
      <p className="text-[10px] text-gray-400 leading-relaxed mb-2">
        Click <strong>Install</strong> to copy the config snippet, then paste it into the tool&rsquo;s config file.
      </p>
      {AI_TOOLS.map(tool => {
        const isInstalled = installed.includes(tool.id);
        const isCopied = copied === tool.id;
        return (
          <div key={tool.id} className="flex items-center justify-between gap-2 p-2 bg-gray-50 rounded-lg">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                {isInstalled && (
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-green-500 flex-shrink-0">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
                <span className="text-[11px] font-semibold text-gray-800">{tool.name}</span>
              </div>
              <div className="text-[10px] text-gray-400 font-mono mt-0.5">{tool.configFile}</div>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              <button
                onClick={() => install(tool)}
                className={`px-2 py-1 text-[10px] font-semibold rounded transition-colors border ${
                  isCopied
                    ? 'bg-green-50 text-green-700 border-green-200'
                    : 'text-cyan-600 hover:text-cyan-700 border-gray-200 hover:border-cyan-300'
                }`}
              >
                {isCopied ? 'Copied!' : 'Install'}
              </button>
              {isInstalled && (
                <button
                  onClick={() => remove(tool.id)}
                  className="p-1 text-gray-300 hover:text-red-500 transition-colors"
                  title="Mark as removed"
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  </svg>
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Main Settings Panel ──

export default function SettingsPanel() {
  const { status: wsStatus, refresh: refreshWs, reconnect: reconnectWs } = useMcpStatus();
  const { status: launchStatus, busy, start, stop, remove, forceRestart, refresh: refreshLauncher } = useMcpLauncher();
  const [extId] = useState(() => chrome.runtime.id);
  const [idCopied, setIdCopied] = useState(false);

  // Custom MCP servers stored in extension storage
  const [customServers, setCustomServers] = useState<McpServerInfo[]>([]);

  useEffect(() => {
    chrome.storage.local.get('mcpCustomServers', (r) => {
      if (r.mcpCustomServers) setCustomServers(r.mcpCustomServers as McpServerInfo[]);
    });
  }, []);

  const saveServers = (servers: McpServerInfo[]) => {
    setCustomServers(servers);
    chrome.storage.local.set({ mcpCustomServers: servers });
  };

  const deleteServer = (index: number) => {
    const next = customServers.filter((_, i) => i !== index);
    saveServers(next);
  };

  const copyExtId = () => {
    navigator.clipboard.writeText(extId).catch(() => {});
    setIdCopied(true);
    setTimeout(() => setIdCopied(false), 2000);
  };


  return (
    <div className="text-xs">
      {/* MCP Bridge Section */}
      <Section title="MCP Bridge" defaultOpen={true}>
        <div className="space-y-3">
          {/* Server status + Start/Stop */}
          <div className="p-2 bg-gray-50 rounded-lg space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-semibold text-gray-800">Sentinel MCP</span>
                <StatusBadge status={wsStatus} />
              </div>
              <div className="flex items-center gap-1">
                {/* When WS is connected the server is running — no need to Start */}
                {wsStatus === 'connected' ? (
                  launchStatus === 'running' ? (
                    <button
                      onClick={stop}
                      disabled={busy}
                      className="px-2 py-1 text-[10px] font-semibold text-white bg-red-500 hover:bg-red-600 disabled:bg-gray-300 rounded transition-colors"
                    >
                      {busy ? '…' : 'Stop'}
                    </button>
                  ) : (
                    <span className="text-[10px] text-green-600 font-medium">Running</span>
                  )
                ) : (
                  /* WS disconnected — show launcher controls */
                  launchStatus === 'not_installed' ? (
                    <span className="text-[10px] text-amber-600 font-medium">Not installed</span>
                  ) : launchStatus === 'running' ? (
                    <button
                      onClick={stop}
                      disabled={busy}
                      className="px-2 py-1 text-[10px] font-semibold text-white bg-red-500 hover:bg-red-600 disabled:bg-gray-300 rounded transition-colors"
                    >
                      {busy ? '…' : 'Stop'}
                    </button>
                  ) : (
                    <>
                      <button
                        onClick={start}
                        disabled={busy || launchStatus === 'unknown'}
                        className="px-2 py-1 text-[10px] font-semibold text-white bg-cyan-600 hover:bg-cyan-700 disabled:bg-gray-300 rounded transition-colors"
                      >
                        {busy ? '…' : 'Start'}
                      </button>
                      {launchStatus === 'stopped' && (
                        <button
                          onClick={remove}
                          disabled={busy}
                          className="p-1 text-gray-300 hover:text-red-500 disabled:opacity-40 transition-colors"
                          title="Remove launcher registration"
                        >
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="3 6 5 6 21 6" />
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                          </svg>
                        </button>
                      )}
                      <button
                        onClick={reconnectWs}
                        className="px-2 py-1 text-[10px] font-semibold text-cyan-600 hover:text-cyan-700 border border-gray-200 rounded transition-colors"
                        title="Force reconnect to MCP server"
                      >
                        Reconnect
                      </button>
                    </>
                  )
                )}
                {launchStatus !== 'not_installed' && launchStatus !== 'unknown' && (
                  <button
                    onClick={() => { forceRestart(); setTimeout(() => { refreshWs(); refreshLauncher(); }, 2000); }}
                    disabled={busy}
                    className="px-2 py-1 text-[10px] font-semibold text-amber-600 hover:text-amber-700 border border-amber-200 bg-amber-50 hover:bg-amber-100 disabled:opacity-40 rounded transition-colors"
                    title="Kill any stale server on port 18925 and start fresh"
                  >
                    {busy ? '…' : '↺ Restart'}
                  </button>
                )}
                <button
                  onClick={() => { refreshWs(); refreshLauncher(); }}
                  className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
                  title="Refresh status"
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="23 4 23 10 17 10" />
                    <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                  </svg>
                </button>
              </div>
            </div>
            <div className="text-[10px] font-mono text-gray-400">ws://127.0.0.1:18925</div>
            <div className="grid grid-cols-3 gap-2 text-[10px]">
              <div className={`rounded px-2 py-1 ${launchStatus === 'running' ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                Host: {launchStatus}
              </div>
              <div className={`rounded px-2 py-1 ${wsStatus === 'connected' ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                Bridge: {wsStatus}
              </div>
              <div className="rounded px-2 py-1 bg-gray-100 text-gray-500">
                Next: {launchStatus === 'not_installed' ? 'install host' : wsStatus === 'connected' ? 'ready' : 'start bridge'}
              </div>
            </div>
          </div>

          {/* Launcher not installed — setup instructions */}
          {launchStatus === 'not_installed' && (
            <div className="p-2 bg-amber-50 rounded-lg space-y-2 border border-amber-200">
              <p className="text-[10px] text-amber-800 font-semibold">One-time setup to enable Start/Stop:</p>
              <div className="font-mono text-[10px] bg-white rounded px-2 py-1.5 text-gray-700 border border-amber-100 leading-relaxed">
                python mcp-server/install_host.py {extId}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-amber-700">Extension ID:</span>
                <code className="text-[10px] bg-white px-1.5 py-0.5 rounded border border-amber-100 text-gray-700 font-mono">{extId}</code>
                <button
                  onClick={copyExtId}
                  className={`px-1.5 py-0.5 text-[10px] font-semibold rounded transition-colors ${idCopied ? 'text-green-700 bg-green-50' : 'text-cyan-600 hover:text-cyan-700'}`}
                >
                  {idCopied ? 'Copied!' : 'Copy'}
                </button>
              </div>
              <p className="text-[10px] text-amber-600">Run the command above, then reload the extension.</p>
            </div>
          )}

          {/* Custom servers */}
          {customServers.length > 0 && (
            <div>
              <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-1.5 block">Custom Servers</span>
              <div className="space-y-1.5">
                {customServers.map((s, i) => (
                  <McpServerCard key={i} server={s} onDelete={() => deleteServer(i)} />
                ))}
              </div>
            </div>
          )}
        </div>
      </Section>



      {/* Install Section */}
      <Section title="Install Dependencies">
        <InstallPanel />
      </Section>

      {/* Connection Section */}
      <Section title="Connection">
        <div className="space-y-3">
          <PortSetting />
          <div className="p-2 bg-blue-50 rounded text-[10px] text-blue-700 leading-relaxed">
            The extension connects to <code className="font-mono bg-blue-100 px-0.5 rounded">ws://127.0.0.1:18925</code> automatically.
            The MCP server must be running for AI tools to control Sentinel.
          </div>
        </div>
      </Section>

      {/* Data Management */}
      <Section title="Data Management">
        <ClearDataSection />
      </Section>

      {/* Supported AI Tools */}
      <Section title="Supported AI Tools">
        <AiToolsSection />
      </Section>
    </div>
  );
}
