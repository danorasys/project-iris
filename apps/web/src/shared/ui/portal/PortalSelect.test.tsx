import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { PortalSelect } from "./PortalSelect";

afterEach(cleanup);

const OPTIONS = [
  { value: "arts", label: "Educación artística" },
  { value: "ethics", label: "Ética y valores humanos" },
  { value: "mathematics", label: "Matemáticas" },
];

// A small form around it that keeps the value, like the real dialogs do.
function Picker({ onChange = () => {}, error }: { onChange?: (value: string) => void; error?: string }) {
  const [value, setValue] = useState("");
  return (
    <>
      <PortalSelect
        id="area"
        label="Área"
        value={value}
        options={OPTIONS}
        placeholder="Elige el área"
        onChange={(next) => {
          setValue(next);
          onChange(next);
        }}
        error={error}
        required
      />
      <button type="button">Afuera</button>
    </>
  );
}

describe("PortalSelect", () => {
  it("shows the placeholder and picks an option with the mouse", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup({ delay: null });
    render(<Picker onChange={onChange} />);

    const combobox = screen.getByRole("combobox", { name: /^Área/ });
    expect(combobox.textContent).toContain("Elige el área");
    expect(combobox.getAttribute("aria-expanded")).toBe("false");

    await user.click(combobox);
    expect(combobox.getAttribute("aria-expanded")).toBe("true");
    await user.click(screen.getByRole("option", { name: "Matemáticas" }));

    expect(onChange).toHaveBeenCalledWith("mathematics");
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(combobox.textContent).toContain("Matemáticas");
    // The focus stays on the button.
    expect(document.activeElement).toBe(combobox);
  });

  it("moves with the arrows and picks with Enter", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup({ delay: null });
    render(<Picker onChange={onChange} />);

    const combobox = screen.getByRole("combobox", { name: /^Área/ });
    combobox.focus();
    await user.keyboard("{ArrowDown}");
    const first = screen.getByRole("option", { name: "Educación artística" });
    expect(combobox.getAttribute("aria-activedescendant")).toBe(first.id);

    await user.keyboard("{ArrowDown}{Enter}");
    expect(onChange).toHaveBeenCalledWith("ethics");

    // Open again: it starts on the one that's picked, which shows as selected.
    await user.keyboard("{ArrowDown}");
    const picked = screen.getByRole("option", { name: "Ética y valores humanos" });
    expect(picked.getAttribute("aria-selected")).toBe("true");
    expect(combobox.getAttribute("aria-activedescendant")).toBe(picked.id);
  });

  it("jumps to an option by its first letter", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup({ delay: null });
    render(<Picker onChange={onChange} />);

    screen.getByRole("combobox", { name: /^Área/ }).focus();
    await user.keyboard("m{Enter}");
    expect(onChange).toHaveBeenCalledWith("mathematics");
  });

  it("Escape closes only the list, not what it's in", async () => {
    const onDocumentKey = vi.fn();
    document.addEventListener("keydown", onDocumentKey);
    const user = userEvent.setup({ delay: null });
    render(<Picker />);

    await user.click(screen.getByRole("combobox", { name: /^Área/ }));
    await user.keyboard("{Escape}");

    expect(screen.queryByRole("listbox")).toBeNull();
    expect(onDocumentKey).not.toHaveBeenCalled();
    document.removeEventListener("keydown", onDocumentKey);
  });

  it("opens upwards when the button is near the bottom of the window", async () => {
    const user = userEvent.setup({ delay: null });
    render(<Picker />);

    const combobox = screen.getByRole("combobox", { name: /^Área/ });
    const bottom = window.innerHeight - 60;
    vi.spyOn(combobox, "getBoundingClientRect").mockReturnValue(
      DOMRect.fromRect({ x: 20, y: bottom - 52, width: 300, height: 52 }),
    );
    await user.click(combobox);

    const list = screen.getByRole("listbox");
    expect(list.style.top).toBe("");
    expect(list.style.bottom).toBe(`${window.innerHeight - (bottom - 52) + 8}px`);
    expect(list.style.width).toBe("300px");
  });

  it("closes when clicking outside, and ties the error to the button", async () => {
    const user = userEvent.setup({ delay: null });
    render(<Picker error="Elige el área de la clase." />);

    const combobox = screen.getByRole("combobox", { name: /^Área/ });
    expect(combobox.getAttribute("aria-invalid")).toBe("true");
    expect(combobox.getAttribute("aria-describedby")).toBe("area-error");

    await user.click(combobox);
    await user.click(screen.getByRole("button", { name: "Afuera" }));
    expect(screen.queryByRole("listbox")).toBeNull();
  });
});
