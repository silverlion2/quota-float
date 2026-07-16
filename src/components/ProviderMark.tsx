import codexLogo from "../../codex.svg";

export function ProviderMark({ provider = "codex", label = "Codex" }: { provider?: string; label?: string }) {
  return (
    <div className="provider-mark" aria-label={label}>
      {provider === "codex" ? <img src={codexLogo} alt="" /> : <strong aria-hidden="true">{label.slice(0, 1)}</strong>}
    </div>
  );
}
