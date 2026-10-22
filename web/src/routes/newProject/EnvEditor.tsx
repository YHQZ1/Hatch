import { useState } from "react";
import { Button, Modal } from "@/components/ui";
import { PlusIcon, CloseIcon } from "../overview/Glyphs";
import { INPUT_CLASS } from "./Field";
import { mergeEnv, parseEnvText, pasteIntoEnv, type EnvVar } from "./newProject";

/**
 * The environment variables the first deployment starts with: rows of name and
 * value, plus a way to bring a whole .env file in at once.
 */
export default function EnvEditor({
  vars,
  onChange,
  maskValues = false,
}: {
  vars: EnvVar[];
  onChange: (vars: EnvVar[]) => void;
  /** Hide the values (they are often secrets) until "Show values" is pressed. */
  maskValues?: boolean;
}) {
  const [importing, setImporting] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const hidden = maskValues && !revealed;
  const [text, setText] = useState("");

  const update = (index: number, patch: Partial<EnvVar>) =>
    onChange(vars.map((item, at) => (at === index ? { ...item, ...patch } : item)));

  const close = () => {
    setImporting(false);
    setText("");
  };

  return (
    <div>
      {vars.length === 0 ? (
        <p className="rounded-hatch border border-dashed border-line-strong px-4 py-6 text-center text-sm text-muted">
          No variables yet. Add some now, or later in the project&apos;s settings.
        </p>
      ) : (
        <ul className="space-y-2">
          {vars.map((item, index) => (
            <li key={index} className="flex items-center gap-2">
              <input
                value={item.key}
                onChange={(event) =>
                  update(index, { key: event.target.value.toUpperCase().replace(/\s+/g, "_") })
                }
                onPaste={(event) => {
                  const next = pasteIntoEnv(vars, index, event.clipboardData.getData("text"));
                  if (next) {
                    event.preventDefault();
                    onChange(next);
                  }
                }}
                placeholder="NAME"
                aria-label={`Name of variable ${index + 1}`}
                autoComplete="off"
                spellCheck={false}
                className={`${INPUT_CLASS} min-w-0 flex-[2] font-mono`}
              />
              <input
                value={item.value}
                onChange={(event) => update(index, { value: event.target.value })}
                type={hidden ? "password" : "text"}
                placeholder="Value"
                aria-label={`Value of variable ${index + 1}`}
                autoComplete={hidden ? "new-password" : "off"}
                spellCheck={false}
                className={`${INPUT_CLASS} min-w-0 flex-[3] font-mono`}
              />
              <button
                type="button"
                onClick={() => onChange(vars.filter((_, at) => at !== index))}
                aria-label={`Remove variable ${index + 1}`}
                className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-hatch text-muted transition-colors hover:bg-ink/5 hover:text-ink"
              >
                <CloseIcon className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {vars.length > 0 && (
        <p className="mt-2 text-xs text-faint">Paste KEY=value lines into a name box to add several at once.</p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button variant="secondary" onClick={() => setImporting(true)}>
          Import .env
        </Button>
        <Button variant="secondary" onClick={() => onChange([...vars, { key: "", value: "" }])}>
          <PlusIcon className="h-3.5 w-3.5" />
          Add variable
        </Button>
        {maskValues && vars.length > 0 && (
          <Button variant="ghost" onClick={() => setRevealed((value) => !value)}>
            {revealed ? "Hide values" : "Show values"}
          </Button>
        )}
      </div>

      <Modal
        open={importing}
        title="Import environment variables"
        description="Paste the contents of a .env file, or choose one. Variables with the same name are replaced."
        onClose={close}
      >
        <div className="space-y-4">
          <input
            type="file"
            aria-label="Choose a .env file"
            accept=".env,text/plain"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void file.text().then(setText);
            }}
            className="block w-full cursor-pointer text-sm text-muted file:mr-3 file:cursor-pointer file:rounded-hatch file:border file:border-line-strong file:bg-base file:px-3 file:py-1.5 file:text-sm file:text-ink"
          />
          <textarea
            autoFocus
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder={"PORT=8080\nDATABASE_URL=postgres://…\nNODE_ENV=production"}
            spellCheck={false}
            className="h-52 w-full resize-none rounded-hatch border border-line-strong bg-base p-3 font-mono text-sm leading-6 text-ink placeholder:text-faint focus:border-accent focus:outline-none"
          />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={close}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={parseEnvText(text).length === 0}
              onClick={() => {
                onChange(mergeEnv(vars, parseEnvText(text)));
                close();
              }}
            >
              Import
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
