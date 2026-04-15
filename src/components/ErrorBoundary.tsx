import React, { Component, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallbackMessage?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * React Error Boundary — catches render errors from any child component.
 * Prevents white-screen crashes from AI parsing failures or unexpected state.
 */
export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[ErrorBoundary] Caught render error:', error, errorInfo);
  }

  handleReload = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-full bg-bg text-text-main p-8">
          <div className="w-16 h-16 rounded-full bg-[rgba(255,0,60,0.1)] border border-[#ff003c]/30 flex items-center justify-center mb-6">
            <AlertTriangle size={28} className="text-[#ff003c]" />
          </div>
          <h2 className="text-lg font-bold text-[#ff003c] mb-2 tracking-wider uppercase">
            System Error
          </h2>
          <p className="text-sm text-text-dim text-center max-w-md mb-2">
            {this.props.fallbackMessage || 'A component has encountered an unexpected error.'}
          </p>
          <p className="text-[10px] font-mono text-text-dim text-center max-w-md mb-6 opacity-60">
            {this.state.error?.message}
          </p>
          <button
            onClick={this.handleReload}
            className="flex items-center gap-2 px-4 py-2 bg-accent/20 text-accent rounded text-xs font-bold uppercase tracking-wider hover:bg-accent hover:text-bg transition-colors"
          >
            <RefreshCw size={14} />
            Recover
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
