"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import PasswordInput from "@/components/PasswordInput";

type Step = "email" | "verify" | "complete";

export default function ForgotPasswordForm() {
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (!cooldown) return;
    const timer = window.setInterval(() => setCooldown((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [cooldown]);

  async function requestCode(event?: FormEvent) {
    event?.preventDefault();
    setLoading(true);
    setError("");
    const response = await fetch("/api/auth/forgot-password/request", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) }).catch(() => null);
    const result = response ? await response.json().catch(() => ({})) as { error?: string; message?: string } : {};
    setLoading(false);
    if (!response?.ok) return setError(result.error || "Unable to request a code. Check your connection and try again.");
    setMessage(result.message || "Check your inbox for the verification code.");
    setStep("verify");
    setCooldown(60);
  }

  async function resetPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    const data = new FormData(event.currentTarget);
    const response = await fetch("/api/auth/forgot-password/reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, code: data.get("code"), password: data.get("password"), confirmPassword: data.get("confirmPassword") }),
    }).catch(() => null);
    const result = response ? await response.json().catch(() => ({})) as { error?: string } : {};
    setLoading(false);
    if (!response?.ok) return setError(result.error || "Unable to reset your password. Please try again.");
    setStep("complete");
    setMessage("Your password has been updated successfully.");
  }

  return (
    <div className="legacyLoginCard recoveryCard">
      <div className="recoveryProgress" aria-label="Password recovery progress">
        <span className={step !== "email" ? "complete" : "active"}>1</span><i /><span className={step === "verify" ? "active" : step === "complete" ? "complete" : ""}>2</span><i /><span className={step === "complete" ? "active" : ""}>3</span>
      </div>
      <div className="legacyAuthHeading">
        <small>CLIENT PORTAL</small>
        <h2>{step === "email" ? "Forgot password?" : step === "verify" ? "Check your email" : "Password updated"}</h2>
        <p>{step === "email" ? "Enter the email connected to your client account." : step === "verify" ? "Enter the code and choose a secure new password." : "You can now sign in using your new password."}</p>
      </div>
      {error && <div className="authError" role="alert">{error}</div>}
      {message && step !== "email" && <div className="authSuccess" role="status">{message}</div>}

      {step === "email" && <form className="legacyAuthForm" onSubmit={requestCode}>
        <label>EMAIL ADDRESS<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required autoFocus /></label>
        <button type="submit" disabled={loading}>{loading ? "Sending code…" : "Send verification code"}</button>
      </form>}

      {step === "verify" && <form className="legacyAuthForm" onSubmit={resetPassword}>
        <label>6-DIGIT VERIFICATION CODE<input className="otpInput" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} placeholder="000000" required autoFocus /></label>
        <label>NEW PASSWORD<PasswordInput name="password" autoComplete="new-password" minLength={8} required /></label>
        <label>CONFIRM NEW PASSWORD<PasswordInput name="confirmPassword" autoComplete="new-password" minLength={8} required /></label>
        <p className="passwordHint">At least 8 characters with uppercase, lowercase, a number, and a special character.</p>
        <button type="submit" disabled={loading}>{loading ? "Updating password…" : "Reset password"}</button>
        <button className="secondaryRecoveryButton" type="button" disabled={loading || cooldown > 0} onClick={() => requestCode()}>{cooldown ? `Resend code in ${cooldown}s` : "Resend verification code"}</button>
      </form>}

      {step === "complete" && <Link className="recoveryPrimaryLink" href="/client/login?reset=1">Return to login</Link>}
      {step !== "complete" && <Link className="legacyBackLink" href="/client/login">← Back to login</Link>}
    </div>
  );
}
