import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: any) {
    console.error("ErrorBoundary caught:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback || (
          <div
            style={{
              padding: 24,
              background: "rgba(168, 54, 52, 0.06)",
              border: "1px solid rgba(168, 54, 52, 0.15)",
              borderRadius: "var(--radius-lg)",
              margin: 32,
            }}
          >
            <h3 style={{ color: "var(--color-danger)", marginBottom: 8 }}>
              ⚠️ Rendering Error
            </h3>
            <pre
              style={{
                fontSize: 12,
                color: "var(--text-secondary)",
                whiteSpace: "pre-wrap",
              }}
            >
              {this.state.error?.message}
            </pre>
            <pre
              style={{
                fontSize: 11,
                color: "var(--text-tertiary)",
                whiteSpace: "pre-wrap",
                marginTop: 8,
              }}
            >
              {this.state.error?.stack}
            </pre>
          </div>
        )
      );
    }
    return this.props.children;
  }
}
