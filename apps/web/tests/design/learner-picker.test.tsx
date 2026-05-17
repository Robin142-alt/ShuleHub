import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { LearnerPicker } from "@/components/common/learner-picker";

test("LearnerPicker selects a learner by admission number without exposing UUID copy", async () => {
  const onChange = jest.fn();

  render(
    <LearnerPicker
      label="Learner"
      tenantSlug="green-valley"
      value={null}
      onChange={onChange}
      fetchLearners={async () => [
        {
          id: "00000000-0000-0000-0000-000000000123",
          admissionNumber: "ADM-001",
          name: "Mary Wanjiku",
          classLabel: "Grade 6 East",
        },
      ]}
    />,
  );

  await userEvent.type(screen.getByLabelText("Learner"), "Mary");
  expect(await screen.findByText("Mary Wanjiku")).toBeInTheDocument();
  expect(screen.getByText("ADM-001")).toBeInTheDocument();
  expect(screen.queryByText(/Student UUID|record ID/i)).not.toBeInTheDocument();

  await userEvent.click(screen.getByRole("button", { name: /Mary Wanjiku/i }));
  expect(onChange).toHaveBeenCalledWith(
    expect.objectContaining({
      id: "00000000-0000-0000-0000-000000000123",
      admissionNumber: "ADM-001",
      name: "Mary Wanjiku",
    }),
  );
});
