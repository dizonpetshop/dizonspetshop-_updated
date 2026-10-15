type IconName = "phone" | "email" | "location" | "facebook" | "instagram" | "tiktok" | "youtube";

function FooterIcon({ name }: { name: IconName }) {
  const common = { width: 20, height: 20, viewBox: "0 0 24 24", fill: "none", xmlns: "http://www.w3.org/2000/svg", "aria-hidden": true };

  if (name === "phone") return <svg {...common}><path d="M7.2 3.5 4.7 5.2c-.7.5-.9 1.4-.5 2.2 2.5 5.3 6.1 8.9 11.4 11.4.8.4 1.7.2 2.2-.5l1.7-2.5c.4-.6.3-1.4-.3-1.9l-3-2.2c-.5-.4-1.3-.3-1.8.2l-1.1 1.3a14.1 14.1 0 0 1-2.5-2 14.1 14.1 0 0 1-2-2.5l1.3-1.1c.5-.5.6-1.3.2-1.8l-2.2-3c-.5-.6-1.3-.7-1.9-.3Z" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></svg>;
  if (name === "email") return <svg {...common}><rect x="3" y="5" width="18" height="14" rx="3" stroke="currentColor" strokeWidth="1.7"/><path d="m5 7 7 5 7-5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></svg>;
  if (name === "location") return <svg {...common}><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" stroke="currentColor" strokeWidth="1.7"/><circle cx="12" cy="10" r="2.5" stroke="currentColor" strokeWidth="1.7"/></svg>;
  if (name === "facebook") return <svg {...common} fill="currentColor"><path d="M13.7 21v-8h2.7l.4-3.1h-3.1v-2c0-.9.3-1.5 1.6-1.5H17V3.6c-.3 0-1.3-.1-2.5-.1-2.5 0-4.2 1.5-4.2 4.3v2.1H7.5V13h2.8v8h3.4Z"/></svg>;
  if (name === "instagram") return <svg {...common}><rect x="3" y="3" width="18" height="18" rx="5" stroke="currentColor" strokeWidth="1.8"/><circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.8"/><circle cx="17.4" cy="6.7" r="1" fill="currentColor"/></svg>;
  if (name === "tiktok") return <svg {...common} fill="currentColor"><path d="M14.3 3h3a5.1 5.1 0 0 0 3.1 3.2v3a8 8 0 0 1-3.1-1v6.2a6.2 6.2 0 1 1-5.4-6.1v3.1a3.2 3.2 0 1 0 2.4 3V3Z"/></svg>;
  return <svg {...common} fill="currentColor"><path d="M21.5 7.2a2.5 2.5 0 0 0-1.8-1.8C18.1 5 12 5 12 5s-6.1 0-7.7.4a2.5 2.5 0 0 0-1.8 1.8A26 26 0 0 0 2.1 12c0 1.6.1 3.2.4 4.8a2.5 2.5 0 0 0 1.8 1.8c1.6.4 7.7.4 7.7.4s6.1 0 7.7-.4a2.5 2.5 0 0 0 1.8-1.8 26 26 0 0 0 .4-4.8c0-1.6-.1-3.2-.4-4.8ZM10 15.2V8.8l5.5 3.2-5.5 3.2Z"/></svg>;
}

export default function ContactFooter() {
  return (
    <footer className="siteFooter" id="contact">
      <div className="footerGlow" aria-hidden="true" />
      <div className="footerInner">
        <div className="footerIntro">
          <div className="footerIdentity">
            <img src="/assets/dizons-logo.jpg" alt="Dizon's Pet Grooming logo" />
            <div><span className="footerEyebrow">Visit · Call · Connect</span><h2>DIZON&apos;S Pet Grooming</h2></div>
          </div>
        </div>

        <div className="footerContactGrid">
          <a className="footerContactCard" href="tel:+639452608113"><i><FooterIcon name="phone" /></i><span><small>Call us</small><strong>0945 260 8113</strong><em>Tap to call</em></span></a>
          <a className="footerContactCard" href="mailto:dizonspetgrooming@gmail.com"><i><FooterIcon name="email" /></i><span><small>Email us</small><strong>dizonspetgrooming@gmail.com</strong><em>We&apos;d love to hear from you</em></span></a>
          <a className="footerContactCard" href="https://www.google.com/maps/search/?api=1&query=037+E.+Pascual+St.+Barangay+Tangos+South,+Navotas,+Philippines,+1489" target="_blank" rel="noreferrer"><i><FooterIcon name="location" /></i><span><small>Visit us</small><strong>037 E. Pascual St., Tangos South</strong><em>Navotas, Philippines 1489 · Open map</em></span></a>
        </div>

        <div className="footerSocials">
          <div><b>Stay connected</b><span>Follow our latest grooms and happy pet moments.</span></div>
          <nav aria-label="DIZON'S Pet Grooming social media">
            <a href="https://www.facebook.com/profile.php?id=61559718971989" target="_blank" rel="noreferrer" aria-label="Facebook"><FooterIcon name="facebook" /><span>Facebook</span></a>
            <a href="https://www.instagram.com/dizonspetgrooming" target="_blank" rel="noreferrer" aria-label="Instagram"><FooterIcon name="instagram" /><span>Instagram</span></a>
            <a href="https://www.tiktok.com/@jcdizon02" target="_blank" rel="noreferrer" aria-label="TikTok"><FooterIcon name="tiktok" /><span>TikTok</span></a>
            <a href="https://www.youtube.com/@petgroomerjc" target="_blank" rel="noreferrer" aria-label="YouTube"><FooterIcon name="youtube" /><span>YouTube</span></a>
          </nav>
        </div>

        <div className="footerBottom"><span>© 2026 DIZON&apos;S Pet Grooming. All rights reserved.</span></div>
      </div>
    </footer>
  );
}
