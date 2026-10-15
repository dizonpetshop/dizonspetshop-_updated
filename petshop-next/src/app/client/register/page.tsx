import Link from "next/link";
import PasswordInput from "@/components/PasswordInput";
import ClientAuthLayout from "@/components/ClientAuthLayout";

export default async function ClientRegister({searchParams}:{searchParams:Promise<{error?:string}>}){
 const {error}=await searchParams;
 return <ClientAuthLayout registration><div className="clientAuthCard"><h1>CREATE AN ACCOUNT</h1>
 {error&&<div className="authError" role="alert">{error==="exists"?"An account with this email already exists.":error==="mismatch"?"Passwords do not match.":error==="database-config"||error==="unavailable"?"Something went wrong. Please try again.":"Enter valid details and a password with uppercase, lowercase, a number, and a symbol (at least 8 characters, at most 72 UTF-8 bytes)."}</div>}
 <form className="clientAuthForm" action="/api/auth/register" method="post">
 <div className="clientAuthNameFields"><label>FIRST NAME<input name="firstName" autoComplete="given-name" placeholder="First name" required/></label><label>SURNAME<input name="surname" autoComplete="family-name" placeholder="Surname" required/></label><label>M.I.<input name="middleInitial" aria-label="Middle initial" placeholder="M.I." maxLength={2}/></label></div>
 <label>PHONE NUMBER<input type="tel" name="phone" inputMode="tel" autoComplete="tel" placeholder="Contact number" required/></label><label>EMAIL<input type="email" name="email" placeholder="Enter email" autoComplete="email" required/></label><label>CREATE PASSWORD<PasswordInput name="password" placeholder="Enter password" minLength={8} maxLength={72} autoComplete="new-password" required/></label><label>CONFIRM PASSWORD<PasswordInput name="confirmPassword" placeholder="Confirm password" minLength={8} maxLength={72} autoComplete="new-password" required/></label><button className="clientAuthSubmit" type="submit">CREATE ACCOUNT</button></form>
 <p className="clientAuthMeta">Already have an account? <Link href="/client/login">Log In</Link></p><Link className="clientAuthHome" href="/">Back to home</Link></div></ClientAuthLayout>;
}