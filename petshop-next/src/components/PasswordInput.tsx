"use client";

import { useId, useState, type InputHTMLAttributes } from "react";

type PasswordInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type">;

export default function PasswordInput({ name = "password", autoComplete = "current-password", id, ...props }: PasswordInputProps) {
  const [visible, setVisible] = useState(false);
  const generatedId = useId();
  const inputId = id || generatedId;

  return (
    <div className="passwordField legacyPasswordField">
      <input {...props} id={inputId} type={visible ? "text" : "password"} name={name} autoComplete={autoComplete} />
      <button
        className="passwordVisibilityToggle"
        type="button"
        onClick={() => setVisible((current) => !current)}
        aria-controls={inputId}
        aria-label={visible ? "Hide password" : "Show password"}
        aria-pressed={visible}
        title={visible ? "Hide password" : "Show password"}
      >
        {visible ? <EyeOffIcon /> : <EyeIcon />}
      </button>
    </div>
  );
}

function EyeIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" /><circle cx="12" cy="12" r="2.75" /></svg>;
}

function EyeOffIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="m3 3 18 18M10.6 6.1A9.6 9.6 0 0 1 12 6c6 0 9.5 6 9.5 6a15 15 0 0 1-2.1 2.8M6.2 7.2C3.8 9 2.5 12 2.5 12s3.5 6 9.5 6a9.5 9.5 0 0 0 4.1-.9M9.9 9.9a3 3 0 0 0 4.2 4.2" /></svg>;
}
