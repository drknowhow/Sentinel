import { Component } from 'react';
import type { ReactNode } from 'react';

interface Props {
    children?: ReactNode;
    fallbackMessage?: string;
}

interface State {
    hasError: boolean;
    error?: Error;
}

export default class ErrorBoundary extends Component<Props, State> {
    public state: State = {
        hasError: false
    };

    public static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    public render() {
        if (this.state.hasError) {
            return (
                <div className="flex flex-col items-center justify-center p-6 m-4 bg-red-50 border border-red-100 rounded-xl text-center">
                    <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center mb-3 text-red-500">
                        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polygon points="12 2 1 22 23 22 12 2" />
                            <line x1="12" y1="9" x2="12" y2="13" />
                            <line x1="12" y1="17" x2="12.01" y2="17" />
                        </svg>
                    </div>
                    <h2 className="text-sm font-bold text-red-800 mb-1">Component Crashed</h2>
                    <p className="text-xs text-red-600/80 mb-4 whitespace-pre-wrap">
                        {this.props.fallbackMessage || this.state.error?.message || 'An unexpected error occurred.'}
                    </p>
                    <button
                        onClick={() => this.setState({ hasError: false, error: undefined })}
                        className="px-4 py-1.5 bg-red-600 text-white text-xs font-semibold rounded-lg shadow-sm hover:bg-red-700 transition"
                    >
                        Try Again
                    </button>
                </div>
            );
        }

        return this.props.children;
    }
}
