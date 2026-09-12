import { useState } from "react";
import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PhoneField } from "./PhoneField";

function Controlled({ initial = "" }: { initial?: string }) {
  const [value, setValue] = useState(initial);
  return <PhoneField id="tutor-telefono" label="Teléfono" value={value} onChange={setValue} required />;
}

function getNumberInput() {
  return document.querySelector(".PhoneInputInput") as HTMLInputElement;
}

function getCountrySelect() {
  return screen.getByLabelText("Número de teléfono del país") as HTMLSelectElement;
}

afterEach(() => {
  cleanup();
});

describe("PhoneField", () => {
  it("does not trigger an infinite render loop while typing", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const user = userEvent.setup();
    render(<Controlled />);

    await user.type(getNumberInput(), "3157698420");

    const loopErrors = errorSpy.mock.calls.filter((call) =>
      String(call[0]).includes("Maximum update depth exceeded"),
    );
    expect(loopErrors).toHaveLength(0);

    errorSpy.mockRestore();
  });

  it("does not loop when the number field loses focus after typing", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const user = userEvent.setup();
    render(
      <>
        <Controlled />
        <input aria-label="other field" />
      </>,
    );

    await user.type(getNumberInput(), "3157698420");
    await user.click(screen.getByLabelText("other field"));

    const loopErrors = errorSpy.mock.calls.filter((call) =>
      String(call[0]).includes("Maximum update depth exceeded"),
    );
    expect(loopErrors).toHaveLength(0);

    errorSpy.mockRestore();
  });

  it("cannot be typed into to change the fixed calling code prefix", async () => {
    const user = userEvent.setup();
    render(<Controlled />);

    const numberInput = getNumberInput();
    await user.type(numberInput, "3157698420");
    expect(numberInput.value.startsWith("+57")).toBe(true);

    numberInput.setSelectionRange(0, 0);
    await user.type(numberInput, "{Backspace}");
    // The calling code prefix survives an attempted edit at position 0.
    expect(numberInput.value.startsWith("+57")).toBe(true);
  });

  it("switches the calling code without looping, even though the previously typed digits no longer apply", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const user = userEvent.setup();
    render(<Controlled />);

    const numberInput = getNumberInput();
    await user.type(numberInput, "3157698420");
    expect(numberInput.value.startsWith("+57")).toBe(true);

    await user.selectOptions(getCountrySelect(), "MX");
    expect(numberInput.value.startsWith("+52")).toBe(true);

    const loopErrors = errorSpy.mock.calls.filter((call) =>
      String(call[0]).includes("Maximum update depth exceeded"),
    );
    expect(loopErrors).toHaveLength(0);

    errorSpy.mockRestore();
  });
});
