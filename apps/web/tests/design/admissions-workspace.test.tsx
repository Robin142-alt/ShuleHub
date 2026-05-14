import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { AdmissionsModuleScreen } from "@/components/modules/admissions/admissions-module-screen";

import { createDashboardSnapshot, renderWithProviders } from "./test-utils";

jest.setTimeout(20_000);

describe("admissions workspace", () => {
  beforeEach(() => {
    window.history.pushState({}, "", "/dashboard/admissions?view=new-registration");
  });

  function renderAdmissionsWorkspace() {
    return renderWithProviders(
      <AdmissionsModuleScreen
        role="admissions"
        snapshot={createDashboardSnapshot("admissions")}
        online
      />,
    );
  }

  function renderAdmissionsWorkspaceWithTransport(enabled: boolean) {
    return renderWithProviders(
      <AdmissionsModuleScreen
        role="admissions"
        snapshot={createDashboardSnapshot("admissions", true, {
          tenant: {
            ...createDashboardSnapshot("admissions").tenant,
            transportEnabled: enabled,
          },
        } as never)}
        online
      />,
    );
  }

  async function completeDirectRegistration(user: ReturnType<typeof userEvent.setup>) {
    await user.type(screen.getByPlaceholderText(/learner full name/i), "Amina Njeri");
    await user.type(document.querySelector('input[type="date"]')!, "2015-03-14");
    await user.selectOptions(screen.getAllByRole("combobox")[0], "Female");
    await user.type(screen.getByPlaceholderText(/birth certificate number/i), "BC-2015-0314");
    await user.selectOptions(screen.getAllByRole("combobox")[1], "Grade 7");
    await user.type(screen.getByPlaceholderText(/parent or guardian full name/i), "Grace Njeri");
    await user.type(screen.getByPlaceholderText(/parent phone number/i), "+254711000222");
    await user.type(screen.getByPlaceholderText(/parent email address/i), "grace@example.test");
    await user.type(screen.getByPlaceholderText(/relationship to learner/i), "Mother");
    await user.type(screen.getByPlaceholderText(/emergency phone number/i), "+254722000333");

    const fileInputs = document.querySelectorAll('input[type="file"]');
    await user.upload(
      fileInputs[0]!,
      new File(["birth"], "amina-birth-certificate.pdf", { type: "application/pdf" }),
    );
    await user.upload(
      fileInputs[1]!,
      new File(["photo"], "amina-passport-photo.jpg", { type: "image/jpeg" }),
    );

    await user.click(screen.getByRole("button", { name: /register learner/i }));
  }

  it("shows a registration completion receipt after the direct registration flow", async () => {
    const user = userEvent.setup();
    renderAdmissionsWorkspace();

    await completeDirectRegistration(user);

    expect(await screen.findByText(/registration completed/i)).toBeVisible();
    expect(screen.getByText("Amina Njeri")).toBeVisible();
    expect(screen.getAllByText(/parent portal invitation sent to grace@example\.test/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/fee handoff not configured/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/grade 7 pending academic handoff pending/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/onboarding checklist/i)).toBeVisible();
    expect(screen.getByText(/learner profile created/i)).toBeVisible();
    expect(screen.getAllByText(/academic handoff pending/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/fee handoff pending/i).length).toBeGreaterThan(0);
  });

  it("records promotion and graduation lifecycle actions from the student profile", async () => {
    const user = userEvent.setup();
    const view = renderAdmissionsWorkspace();

    await completeDirectRegistration(user);
    await screen.findByText(/registration completed/i);

    window.history.pushState({}, "", "/dashboard/admissions?view=student-directory");
    view.rerender(
      <AdmissionsModuleScreen
        role="admissions"
        snapshot={createDashboardSnapshot("admissions")}
        online
      />,
    );

    expect(await screen.findByRole("heading", { name: /student directory/i })).toBeVisible();

    await user.click(screen.getByRole("button", { name: /promote learner/i }));

    expect(await screen.findByText(/promotion recorded for amina njeri to grade 8 pending/i)).toBeVisible();
    await user.click(screen.getByRole("tab", { name: /academics/i }));
    expect(screen.getAllByText(/latest lifecycle/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/promotion/i).length).toBeGreaterThan(0);

    await user.click(screen.getByRole("button", { name: /graduate learner/i }));

    expect(await screen.findByText(/graduation recorded for amina njeri/i)).toBeVisible();
    expect(screen.getAllByText(/graduation/i).length).toBeGreaterThan(0);
  });

  it("hides transport allocation controls unless the tenant enables transport", async () => {
    window.history.pushState({}, "", "/dashboard/admissions?view=class-allocation");

    renderAdmissionsWorkspaceWithTransport(false);

    expect(screen.queryByText(/transport route/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/route assignment/i)).not.toBeInTheDocument();

    const assignButtons = screen.getAllByRole("button", { name: /assign allocation/i });
    await userEvent.click(assignButtons.at(-1)!);

    expect(screen.queryByText(/transport route/i)).not.toBeInTheDocument();
  });

  it("shows route assignment controls when the tenant enables transport", async () => {
    window.history.pushState({}, "", "/dashboard/admissions?view=class-allocation");

    renderAdmissionsWorkspaceWithTransport(true);

    expect(screen.getByText(/transport route/i)).toBeVisible();

    const assignButtons = screen.getAllByRole("button", { name: /assign allocation/i });
    await userEvent.click(assignButtons.at(-1)!);

    expect(screen.getAllByText(/transport route/i).length).toBeGreaterThan(0);
  });
});
