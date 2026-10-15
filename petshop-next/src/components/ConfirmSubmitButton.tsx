"use client";

import { useFormStatus } from "react-dom";

export default function ConfirmSubmitButton({ children, confirmMessage, pendingText = "Saving...", className }: { children: React.ReactNode; confirmMessage?: string; pendingText?: string; className?: string }) {
  const { pending } = useFormStatus();
  return <button className={className} disabled={pending} onClick={(event) => { if (!pending && confirmMessage && !window.confirm(confirmMessage)) event.preventDefault(); }} type="submit">{pending ? pendingText : children}</button>;
}
