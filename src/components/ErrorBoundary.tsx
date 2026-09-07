import { Component, type ErrorInfo, type ReactNode } from "react";
import type { Language } from "../types";

interface Props {
  children: ReactNode;
  language: Language;
  scope?: "app" | "panel";
  resetKey?: unknown;
}

interface State {
  failed: boolean;
}

const messages = {
  "zh-CN": {
    title: "界面暂时无法显示",
    detail: "Quota Float 已隔离这次界面错误。你的凭据和额度数据没有显示在错误信息中。",
    retry: "重新加载",
  },
  en: {
    title: "This view could not be displayed",
    detail: "Quota Float isolated this interface error. Credentials and quota data are not included in the error message.",
    retry: "Reload",
  },
} satisfies Record<Language, { title: string; detail: string; retry: string }>;

export class ErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(_error: Error, _info: ErrorInfo): void {
    // Deliberately do not log error objects: component props may contain local quota data.
  }

  componentDidUpdate(previous: Props): void {
    if (this.state.failed && previous.resetKey !== this.props.resetKey) {
      this.setState({ failed: false });
    }
  }

  render() {
    if (!this.state.failed) return this.props.children;
    const text = messages[this.props.language];
    return (
      <section
        className="loading-card"
        data-error-scope={this.props.scope ?? "panel"}
        role="alert"
        style={{ display: "grid", placeContent: "center", gap: 8, textAlign: "center" }}
      >
        <strong>{text.title}</strong>
        <p>{text.detail}</p>
        <button type="button" onClick={() => window.location.reload()}>{text.retry}</button>
      </section>
    );
  }
}
