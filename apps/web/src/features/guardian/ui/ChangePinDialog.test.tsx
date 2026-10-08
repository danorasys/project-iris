import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { createPortal } from "react-dom";
import { useModalDialog } from "@/shared/ui/useModalDialog";
import { ChangePinDialog } from "./ChangePinDialog";

// Stands in for the 2FA code window the portal asks on top after a while
// without activity.
function CodeOnTop() {
  const { ref } = useModalDialog<HTMLDivElement>();
  return createPortal(<div ref={ref} role="dialog" aria-label="Código" />, document.body);
}

afterEach(cleanup);

describe("ChangePinDialog", () => {
  function renderPin(codeOnTop: boolean) {
    const onCancel = vi.fn();
    render(
      <>
        <ChangePinDialog firstName="Sofía" onCheckCurrent={vi.fn()} onComplete={vi.fn()} onCancel={onCancel} />
        {codeOnTop && <CodeOnTop />}
      </>,
    );
    return onCancel;
  }

  it("Esc cancels it", () => {
    const onCancel = renderPin(false);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onCancel).toHaveBeenCalledOnce();
  });

  // Esc there is for the code window only, the PIN one stays open.
  it("leaves the keys alone while another window is on top", () => {
    const onCancel = renderPin(true);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onCancel).not.toHaveBeenCalled();
  });
});
