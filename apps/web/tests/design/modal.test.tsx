import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";

import { Modal } from "@/components/ui/modal";

describe("modal", () => {
  it("traps keyboard focus inside the dialog while it is open", async () => {
    const user = userEvent.setup();
    render(
      <>
        <button type="button">Outside action</button>
        <Modal
          open
          title="Manage learner"
          onClose={jest.fn()}
          footer={
            <>
              <button type="button">Cancel</button>
              <button type="button">Save</button>
            </>
          }
        >
          <input aria-label="Learner name" />
        </Modal>
      </>,
    );

    const dialog = screen.getByRole("dialog", { name: /manage learner/i });
    await waitFor(() => expect(dialog).toHaveFocus());

    await user.tab();
    expect(screen.getByRole("button", { name: /close dialog/i })).toHaveFocus();

    await user.tab();
    expect(screen.getByLabelText(/learner name/i)).toHaveFocus();

    await user.tab();
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();

    await user.tab();
    expect(screen.getByRole("button", { name: "Save" })).toHaveFocus();

    await user.tab();
    expect(screen.getByRole("button", { name: /close dialog/i })).toHaveFocus();
  });

  it("does not steal focus from controlled fields when the parent rerenders", async () => {
    const user = userEvent.setup();

    function ModalHarness() {
      const [open, setOpen] = useState(true);
      const [learnerName, setLearnerName] = useState("");
      const [admissionNumber, setAdmissionNumber] = useState("");
      const [className, setClassName] = useState("");
      const [parentContact, setParentContact] = useState("");

      return (
        <>
          <button type="button">Add student</button>
          <Modal
            open={open}
            title="Add student"
            onClose={() => setOpen(false)}
            footer={<button type="button">Save student</button>}
          >
            <div className="grid gap-4 md:grid-cols-2">
              <input
                aria-label="Learner name"
                value={learnerName}
                onChange={(event) => setLearnerName(event.target.value)}
              />
              <input
                aria-label="Admission number"
                value={admissionNumber}
                onChange={(event) => setAdmissionNumber(event.target.value)}
              />
              <input
                aria-label="Class"
                value={className}
                onChange={(event) => setClassName(event.target.value)}
              />
              <input
                aria-label="Parent contact"
                value={parentContact}
                onChange={(event) => setParentContact(event.target.value)}
              />
            </div>
          </Modal>
        </>
      );
    }

    render(<ModalHarness />);

    const dialog = screen.getByRole("dialog", { name: /add student/i });
    await waitFor(() => expect(dialog).toHaveFocus());

    const learnerInput = screen.getByLabelText(/learner name/i);
    const admissionInput = screen.getByLabelText(/admission number/i);
    const classInput = screen.getByLabelText(/^class$/i);
    const parentInput = screen.getByLabelText(/parent contact/i);

    await user.click(learnerInput);
    await user.type(learnerInput, "Mercy Atieno");
    expect(learnerInput).toHaveValue("Mercy Atieno");
    expect(learnerInput).toHaveFocus();

    await user.type(admissionInput, "ADM-9001");
    expect(admissionInput).toHaveValue("ADM-9001");
    expect(admissionInput).toHaveFocus();

    await user.type(classInput, "Grade 6 Hope");
    expect(classInput).toHaveValue("Grade 6 Hope");
    expect(classInput).toHaveFocus();

    await user.type(parentInput, "0722000001");
    expect(parentInput).toHaveValue("0722000001");
    expect(parentInput).toHaveFocus();
  });
});
