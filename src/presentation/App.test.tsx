import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "./App.tsx";

describe("App", () => {
  it("shows that the Smart Invoice application foundation is ready", () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: "Smart Invoice" })).toBeVisible();
    expect(screen.getByText("Application foundation is ready.")).toBeVisible();
  });
});
