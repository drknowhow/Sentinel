import { useState } from 'react';

export default function Footer() {
  const [open, setOpen] = useState(false);

  return (
    <div className="border-t border-gray-200">
      <button
        onClick={() => setOpen(!open)}
        className="w-full px-4 py-2.5 flex items-center justify-between text-xs text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors"
      >
        <span className="font-medium">Sentinel v1.0.0</span>
        <svg
          className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
        </svg>
      </button>

      {open && (
        <div className="px-4 pb-4 pt-1">
          <div className="rounded-lg bg-gray-50 border border-gray-100 p-3.5">
            <div className="flex items-center gap-2.5 mb-2.5">
              <div className="w-8 h-8 rounded-lg bg-cyan-700 flex items-center justify-center flex-shrink-0">
                <svg className="w-4.5 h-4.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>
              <div>
                <p className="text-[11px] font-bold text-gray-800 leading-tight">Sentinel</p>
                <p className="text-[10px] text-gray-400 leading-tight">Web Application Tester &amp; Guide Creator</p>
              </div>
            </div>
            <p className="text-[10px] text-gray-500 leading-relaxed mb-3">
              Record interactions, generate visual guides, run playback tests, and track bugs — all locally in your browser. No data ever leaves your machine.
            </p>
            <div className="flex gap-2">
              <a
                href="https://drknowhow.github.io/Sentinel/"
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 text-center text-[10px] font-semibold text-cyan-700 bg-cyan-50 hover:bg-cyan-100 border border-cyan-200 rounded-md py-1.5 px-2 transition-colors no-underline"
              >
                Website
              </a>
              <a
                href="https://github.com/drknowhow/Sentinel"
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 text-center text-[10px] font-semibold text-gray-600 bg-white hover:bg-gray-100 border border-gray-200 rounded-md py-1.5 px-2 transition-colors no-underline"
              >
                GitHub
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
