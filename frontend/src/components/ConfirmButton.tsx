// A destructive button that asks "are you sure?" inline instead of with window.confirm().
// Click it and it's replaced, in place, by a short question plus Yes / Cancel.
// Cancel gets focus first (the safe choice); Escape also cancels.
import { useEffect, useRef, useState } from "react";
import "../styles/ConfirmButton.css";

type Props = {
  label: string; // the button before asking, e.g. "Delete"
  question: string; // e.g. "Remove Apple from your groceries?"
  confirmLabel: string; // e.g. "Yes, remove"
  onConfirm: () => void;
  disabled?: boolean;
  className?: string; // style for the first button, so it matches the page
};

export default function ConfirmButton({
  label,
  question,
  confirmLabel,
  onConfirm,
  disabled,
  className,
}: Props) {
  const [asking, setAsking] = useState(false);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef(false);

  useEffect(() => {
    if (asking) cancelRef.current?.focus();
    else if (returnFocus.current) {
      returnFocus.current = false;
      triggerRef.current?.focus();
    }
  }, [asking]);

  function cancel() {
    returnFocus.current = true;
    setAsking(false);
  }

  if (!asking) {
    return (
      <button
        ref={triggerRef}
        type="button"
        className={className}
        disabled={disabled}
        onClick={() => setAsking(true)}
      >
        {label}
      </button>
    );
  }

  return (
    <div
      className="confirm"
      role="group"
      aria-label={question}
      onKeyDown={(e) => {
        if (e.key === "Escape") cancel();
      }}
    >
      <p className="confirm-text">{question}</p>
      <button
        type="button"
        className="confirm-yes"
        disabled={disabled}
        onClick={() => {
          setAsking(false);
          onConfirm();
        }}
      >
        {confirmLabel}
      </button>
      <button ref={cancelRef} type="button" className="is-secondary" onClick={cancel}>
        Cancel
      </button>
    </div>
  );
}
