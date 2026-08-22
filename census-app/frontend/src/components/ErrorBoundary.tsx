/** Catches render crashes so a single bad record never loses a day of fieldwork.
 *
 * Deliberately does not use the i18n context: if the provider itself is what
 * failed, the boundary still has to render something readable.
 */

import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('census: unhandled render error', error, info.componentStack);
  }

  private handleReload = (): void => {
    window.location.reload();
  };

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="app-shell">
        <main className="app-main no-nav">
          <div className="card stack" style={{ marginTop: 32 }}>
            <h2 style={{ fontSize: '1.1rem' }}>The app hit an unexpected problem</h2>
            <p className="muted">Your saved data is safe on this device. Reload to continue.</p>
            <pre
              className="mono tiny"
              style={{
                whiteSpace: 'pre-wrap',
                background: 'var(--surface-sunken)',
                padding: 10,
                borderRadius: 8,
                maxHeight: 160,
                overflow: 'auto',
              }}
            >
              {error.message}
            </pre>
            <button type="button" className="btn btn-primary btn-block" onClick={this.handleReload}>
              Reload app
            </button>
          </div>
        </main>
      </div>
    );
  }
}
