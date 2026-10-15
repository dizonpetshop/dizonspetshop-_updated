"use client";

import { useFormStatus } from "react-dom";

export default function AdminSubmitButton({ children, pendingText = "Saving...", className }: { children: React.ReactNode; pendingText?: string; className?: string }) {
  const { pending } = useFormStatus();
  return <button className={className} disabled={pending} type="submit">{pending ? pendingText : children}</button>;
}
