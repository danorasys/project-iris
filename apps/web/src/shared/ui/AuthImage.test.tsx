import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ApiError } from "@/shared/api/httpClient";
import { AuthImage } from "./AuthImage";

const apiFetchBlob = vi.fn();

vi.mock("@/shared/api/httpClient", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/shared/api/httpClient")>();
  return { ...original, apiFetchBlob: (...args: unknown[]) => apiFetchBlob(...args) };
});

// jsdom has no blob: URLs, so these two stand in for the browser's.
const createObjectURL = vi.fn((_blob: Blob) => `blob:test/${createObjectURL.mock.calls.length}`);
const revokeObjectURL = vi.fn();

function renderWithClient(ui: ReactNode, client = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
  return client;
}

beforeAll(() => {
  Object.assign(URL, { createObjectURL, revokeObjectURL });
});

afterEach(() => {
  cleanup();
  apiFetchBlob.mockReset();
  createObjectURL.mockClear();
  revokeObjectURL.mockClear();
});

describe("AuthImage", () => {
  it("shows the fallback and downloads nothing when there's no path", () => {
    renderWithClient(<AuthImage path={null} fallback={<span>sin logo</span>} />);

    expect(screen.getByText("sin logo")).toBeTruthy();
    expect(apiFetchBlob).not.toHaveBeenCalled();
  });

  it("downloads the image with the session and shows it from a blob: URL", async () => {
    apiFetchBlob.mockResolvedValue(new Blob(["png"], { type: "image/png" }));

    renderWithClient(<AuthImage path="/classrooms/a/logo/x.png" alt="Logo del aula" />);

    const img = await screen.findByAltText("Logo del aula");
    expect(img.getAttribute("src")).toMatch(/^blob:/);
    expect(apiFetchBlob).toHaveBeenCalledWith("/classrooms/a/logo/x.png");
  });

  it("downloads an image once even when several components show it", async () => {
    apiFetchBlob.mockResolvedValue(new Blob(["png"], { type: "image/png" }));

    renderWithClient(
      <>
        <AuthImage path="/classrooms/a/logo/x.png" alt="uno" />
        <AuthImage path="/classrooms/a/logo/x.png" alt="dos" />
      </>
    );

    await screen.findByAltText("uno");
    await screen.findByAltText("dos");
    expect(apiFetchBlob).toHaveBeenCalledTimes(1);
  });

  it("keeps the fallback when the API denies the image", async () => {
    apiFetchBlob.mockRejectedValue(new ApiError(404, "recurso_no_encontrado", "no"));

    renderWithClient(<AuthImage path="/classrooms/a/logo/x.png" fallback={<span>sin logo</span>} />);

    await waitFor(() => expect(apiFetchBlob).toHaveBeenCalled());
    expect(screen.getByText("sin logo")).toBeTruthy();
  });

  it("frees the blob: URL when the cache is cleared, for example on logout", async () => {
    apiFetchBlob.mockResolvedValue(new Blob(["png"], { type: "image/png" }));
    const client = renderWithClient(<AuthImage path="/classrooms/a/logo/x.png" alt="Logo" />);
    const src = (await screen.findByAltText("Logo")).getAttribute("src");

    client.clear();

    expect(revokeObjectURL).toHaveBeenCalledWith(src);
  });
});
