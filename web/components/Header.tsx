import Link from "next/link";
import { getUser } from "@/lib/auth";
import LogoutButton from "./LogoutButton";
import MobileMenu from "./MobileMenu";

export default async function Header() {
  const user = await getUser().catch(() => null);
  const links = (
    <>
      <a href="/home">Home</a>
      <a href="/about">About</a>
      <a href="/services">Services</a>
      <Link href="/store" className="nav-store">Online Store</Link>
      <a href="/partners">Partners</a>
      <a href="/contact">Contact</a>
      {user?.role === "admin" && <Link href="/admin">Admin Panel</Link>}
      {user ? <><Link href="/account">My Account</Link><LogoutButton /></> : <Link href="/login">Log in / Sign up</Link>}
      <a className="cta" href="/contact">Get a Quote</a>
    </>
  );
  return (
    <header className="hdr">
      <div className="wrap hdr-in">
        <a href="/home" className="brand"><img src="/img/logo.png" alt="NEAS logo" /><div><b>NEXTEDGE</b><span>Access Solutions · OPC</span></div></a>
        <nav className="nav nav-desktop" aria-label="Main">{links}</nav>
        <MobileMenu>{links}</MobileMenu>
      </div>
    </header>
  );
}
