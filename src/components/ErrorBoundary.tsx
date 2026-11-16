import React from 'react';
import { AlertTriangle } from 'lucide-react';

interface State {
  error: Error | null;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  State
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
          <div className="max-w-lg w-full bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <div className="flex items-center gap-2.5 text-red-700">
              <AlertTriangle className="w-5 h-5" />
              <h2 className="text-base font-semibold">Application Error</h2>
            </div>
            <p className="text-xs text-slate-600 break-words font-mono bg-slate-50 border border-slate-200 rounded-lg p-3">
              {this.state.error.message}
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-teal-700 hover:bg-teal-800 text-white text-xs font-medium rounded-lg"
            >
              Reload Application
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
