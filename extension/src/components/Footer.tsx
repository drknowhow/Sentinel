import { useState } from 'react';

function openUrl(url: string) {
  chrome.tabs.create({ url });
}

export default function Footer() {
  const [open, setOpen] = useState(false);

  return (
    <div style={{ borderTop: '1px solid #e5e7eb' }}>
      {/* Toggle bar */}
      <button
        onClick={() => setOpen(!open)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 16px',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          fontSize: '11px',
          color: '#9ca3af',
          fontFamily: 'inherit',
        }}
      >
        <span style={{ fontWeight: 600 }}>About Sentinel</span>
        <svg
          width="12" height="12" viewBox="0 0 24 24"
          fill="none" stroke="currentColor" strokeWidth="2.5"
          strokeLinecap="round" strokeLinejoin="round"
          style={{
            transition: 'transform 0.2s',
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
          }}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {/* About panel */}
      {open && (
        <div style={{ padding: '0 16px 16px' }}>
          <div style={{
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
            borderRadius: '12px',
            padding: '20px',
          }}>
            {/* Brand header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
              <div style={{
                width: '40px',
                height: '40px',
                borderRadius: '10px',
                background: 'linear-gradient(135deg, #0e7490, #0891b2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                  <path d="M9 12l2 2 4-4" />
                </svg>
              </div>
              <div>
                <div style={{ fontSize: '14px', fontWeight: 700, color: '#1e293b', lineHeight: 1.2 }}>
                  Sentinel
                </div>
                <div style={{ fontSize: '11px', color: '#94a3b8', lineHeight: 1.3, marginTop: '2px' }}>
                  Version 1.0.0
                </div>
              </div>
            </div>

            {/* Description */}
            <p style={{
              fontSize: '12px',
              color: '#64748b',
              lineHeight: 1.6,
              margin: '0 0 16px',
            }}>
              A privacy-first Chrome extension for QA teams and developers. Record web interactions, generate visual HTML guides, run playback tests with assertions, and track bugs — all without leaving your browser.
            </p>

            {/* Divider */}
            <div style={{ height: '1px', background: '#e2e8f0', margin: '0 0 16px' }} />

            {/* Info rows */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 500 }}>Platform</span>
                <span style={{ fontSize: '11px', color: '#475569', fontWeight: 600 }}>Chrome Extension (MV3)</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 500 }}>Data</span>
                <span style={{ fontSize: '11px', color: '#16a34a', fontWeight: 600 }}>100% Local — No network requests</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 500 }}>License</span>
                <span style={{ fontSize: '11px', color: '#475569', fontWeight: 600 }}>MIT</span>
              </div>
            </div>

            {/* Action buttons */}
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={() => openUrl('https://drknowhow.github.io/Sentinel/')}
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  padding: '8px 12px',
                  fontSize: '12px',
                  fontWeight: 600,
                  color: '#ffffff',
                  background: 'linear-gradient(135deg, #0e7490, #0891b2)',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  transition: 'opacity 0.15s',
                }}
                onMouseEnter={e => (e.currentTarget.style.opacity = '0.9')}
                onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                  <polyline points="15 3 21 3 21 9" />
                  <line x1="10" y1="14" x2="21" y2="3" />
                </svg>
                Website
              </button>
              <button
                onClick={() => openUrl('https://github.com/drknowhow/Sentinel')}
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  padding: '8px 12px',
                  fontSize: '12px',
                  fontWeight: 600,
                  color: '#475569',
                  background: '#ffffff',
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = '#f1f5f9')}
                onMouseLeave={e => (e.currentTarget.style.background = '#ffffff')}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none">
                  <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                </svg>
                GitHub
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
