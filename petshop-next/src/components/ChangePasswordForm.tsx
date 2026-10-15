"use client";
import { useState } from "react";
import { changePassword } from "@/app/account/actions";
import PasswordInput from "./PasswordInput";
import AdminIcon from "./AdminIcon";

export default function ChangePasswordForm({initialOpen=false}:{initialOpen?:boolean}) {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  async function submit(form: FormData) {
    setPending(true); setMessage("");
    try { const result = await changePassword(form); setMessage(result.error || result.message || ""); }
    catch { setMessage("Could not change your password. Please retry."); }
    finally { setPending(false); }
  }
  return <details className="clientActionPanel passwordSettingsPanel" open={initialOpen}><summary><span className="passwordSettingsIcon"><AdminIcon name="lock" size={22}/></span><span><b>Change password</b><small>Keep your account secure with a private password.</small></span><AdminIcon name="chevron" size={19}/></summary><form action={submit} className="clientActionForm passwordSettingsForm" aria-busy={pending}><label>Current password<PasswordInput name="currentPassword" autoComplete="current-password" required maxLength={72}/></label><label>New password<PasswordInput name="password" autoComplete="new-password" required minLength={8} maxLength={72}/></label><label>Confirm new password<PasswordInput name="confirmPassword" autoComplete="new-password" required minLength={8} maxLength={72}/></label><div className="passwordSettingsFooter"><span><AdminIcon name="lock" size={15}/>Choose a password you don&apos;t use elsewhere.</span><button disabled={pending}><AdminIcon name="lock" size={16}/>{pending ? "Saving…" : "Update password"}</button></div>{message && <p className="passwordSettingsMessage" role="status">{message}</p>}</form></details>;
}
