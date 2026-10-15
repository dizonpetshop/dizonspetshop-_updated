"use client";
import Link from "next/link";
import {usePathname} from "next/navigation";
import Brand from "./Brand";
import ThemeToggle from "./ThemeToggle";

export default function PublicHeader() {
  const reviews=usePathname()==='/reviews';
  return (
    <header className="publicHeader">
      <Brand />
      <nav aria-label="Main navigation">
        <Link href="/#about">About Us</Link>
        <Link href="/#grooming">Grooming</Link>
        <Link href="/#products">Products</Link>
        <Link href="/#contact">Contact</Link>
        <Link href="/reviews" aria-current={reviews?'page':undefined}>Reviews</Link>
      </nav>
      <div className="headerActions">
        <ThemeToggle />
        <Link href="/client/login" className="textButton">Login</Link>
        <Link href="/client/register" className="primaryButton small">Create Account</Link>
      </div>
    </header>
  );
}
