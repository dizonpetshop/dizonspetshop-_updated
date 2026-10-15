import Link from "next/link";
import PublicHeader from "@/components/PublicHeader";

const localSteps = [
  ["Install Node.js", "Install the current Node.js LTS version. Restart PowerShell after installation.", "node --version\nnpm --version"],
  ["Open the project", "Open PowerShell inside the petshop-next folder.", "cd C:\\path\\to\\Petshop\\petshop-next"],
  ["Install packages", "Download the packages defined by this project.", "npm install"],
  ["Prepare environment settings", "Copy .env.example to .env.local and replace every example value.", "Copy-Item .env.example .env.local"],
  ["Check the MySQL schema", "Check the existing MySQL tables. Apply the documented additive upgrade only after reviewing it.", "npm run db:check"],
  ["Start on your local network", "The hostname option allows devices on the same network to open the application.", "npm run dev -- --hostname 0.0.0.0"],
] as const;

export default function HowToRun() {
  return <><PublicHeader /><main className="guidePage"><div className="guideWrap">
    <section className="guideHero"><span className="eyebrow">System operations note</span><h1>How to Run This</h1><p>A step-by-step guide for starting DIZON&apos;S Pet Grooming locally or on another device.</p><div className="guideNote"><b>Important:</b> Configure the existing MySQL database before testing database-backed pages.</div></section>
    <section className="guideSection"><h2>Run the development server</h2><div className="stepList">{localSteps.map(([title, description, command], index) => <article className="guideStep" key={title}><span>{index + 1}</span><div><h3>{title}</h3><p>{description}</p><pre className="code">{command}</pre></div></article>)}</div></section>
    <section className="guideSection"><h2>Run a production build locally</h2><div className="guideStep"><span>1</span><div><h3>Build and start</h3><p>Build validates the application before the optimized server starts.</p><pre className="code">npm run build{`\n`}npm run start -- --hostname 0.0.0.0</pre></div></div></section>
    <section className="guideSection"><h2>Deploy to Vercel</h2><div className="stepList"><article className="guideStep"><span>1</span><div><h3>Push to GitHub</h3><p>Commit this folder without .env.local.</p></div></article><article className="guideStep"><span>2</span><div><h3>Import in Vercel</h3><p>Add the environment variables from .env.example under Project Settings.</p></div></article><article className="guideStep"><span>3</span><div><h3>Deploy and test</h3><p>Test authentication, email, database access, appointments, notifications, loyalty, and reservations.</p></div></article></div><div className="guideLinks"><Link className="primaryButton" href="/">Return Home</Link><Link className="outlineButton" href="/client/register">Create Account</Link></div></section>
  </div></main></>;
}
