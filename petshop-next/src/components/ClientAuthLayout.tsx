import type { ReactNode } from "react";
import Link from "next/link";

export default function ClientAuthLayout({children,registration=false}:{children:ReactNode;registration?:boolean}){
 return <main className={`clientAuthScene ${registration?"registrationScene":""}`}><div className="clientAuthComposition"><section className="clientAuthArtwork" aria-label="Dizon's Pet Grooming"><Link href="/" aria-label="Dizon's Pet Grooming home"><img className="clientAuthLogo" src="/assets/dizons-logo-transparent.png" alt="Dizon's Pet Grooming"/></Link><img className="clientAuthDogs" src="/assets/auth-dogs.png" alt=""/></section><section className="clientAuthFormPanel">{children}</section></div></main>;
}