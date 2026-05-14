import { createElement } from "react";
import { screen } from "@testing-library/react";

import { SchoolPages } from "@/components/school/school-pages";

import { renderWithProviders } from "./test-utils";

describe("exams workspace", () => {
  it("opens the implemented exams command center from the school workspace", () => {
    renderWithProviders(
      createElement(SchoolPages, {
        role: "teacher",
        section: "exams",
        tenantSlug: "barakaacademy",
      }),
    );

    expect(
      screen.getByRole("heading", { name: /exams & results command center/i }),
    ).toBeVisible();
  });
});
