import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useModalDialog } from "./useModalDialog";

// Takes the focus in its own effect, like the boxes of the 2FA code.
function Field() {
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);
  return <input ref={input} aria-label="Código" />;
}

function Dialog({ name }: { name: string }) {
  const { ref } = useModalDialog<HTMLDivElement>();
  return createPortal(
    <div ref={ref} role="dialog" aria-label={name}>
      {name === "Código" ? <Field /> : <button type="button">{name}</button>}
    </div>,
    document.body,
  );
}

function App({ dialogs }: { dialogs: string[] }) {
  return (
    <>
      <button type="button">Abrir</button>
      {dialogs.map((name) => (
        <Dialog key={name} name={name} />
      ))}
    </>
  );
}

afterEach(cleanup);

describe("useModalDialog", () => {
  it("freezes the page while it's open and gives it back with the focus", () => {
    const { container, getByText, rerender } = render(<App dialogs={[]} />);
    const opener = getByText("Abrir");
    opener.focus();

    rerender(<App dialogs={["PIN"]} />);
    expect(container.inert).toBe(true);

    rerender(<App dialogs={[]} />);
    expect(container.inert).toBe(false);
    expect(document.activeElement).toBe(opener);
  });

  // The 2FA code asked on top of the PIN window: the PIN one also freezes,
  // and comes back when the code window closes.
  it("freezes a window that was already open under it", () => {
    const { container, getByRole, rerender } = render(<App dialogs={["PIN"]} />);
    const pin = getByRole("dialog", { name: "PIN" });

    rerender(<App dialogs={["PIN", "Código"]} />);
    expect(pin.inert).toBe(true);
    expect(getByRole("dialog", { name: "Código" }).inert).toBeFalsy();

    rerender(<App dialogs={["PIN"]} />);
    expect(pin.inert).toBe(false);
    expect(container.inert).toBe(true);
  });

  // The PIN window turns into the code one at once, and the code boxes take
  // the focus first. Closing still goes back to the button that opened them.
  it("gives the focus back to the opener when one window replaces another", () => {
    const { getByText, rerender } = render(<App dialogs={[]} />);
    const opener = getByText("Abrir");
    opener.focus();

    rerender(<App dialogs={["PIN"]} />);
    rerender(<App dialogs={["Código"]} />);
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Código");

    rerender(<App dialogs={[]} />);
    expect(document.activeElement).toBe(opener);
  });
});
