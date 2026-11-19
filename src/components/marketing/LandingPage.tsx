"use client";

import Link from "next/link";
import { useState } from "react";

const audiences = [
  ["Independent consultants", "Move from brief to evidence faster", "Build a credible model, explain the result and prepare a client-ready export without maintaining a maze of private spreadsheets."],
  ["Engineering teams", "Work from the same RAM baseline", "Keep component assumptions, diagrams and results in one repeatable workflow that another engineer can review."],
  ["Companies", "Make analysis easier to govern", "Give programmes a consistent modelling approach and a clearer record for design reviews, tenders and assurance."],
] as const;

const benefits = [
  ["See the architecture", "Express series, parallel, voting and fault logic visually, so discussions begin with the system rather than a hidden formula."],
  ["Find what drives risk", "Use success-path and failure-path views to focus attention on the components and combinations that matter."],
  ["Challenge assumptions", "Keep failure and repair inputs visible and reusable instead of burying them in disconnected workbooks."],
  ["Explain the number", "Put system results beside calculation logic so reviewers can follow how the answer was produced."],
  ["Compare design choices", "Restructure a model and recalculate to explore redundancy, maintainability and architecture trade-offs."],
  ["Carry evidence forward", "Export diagrams, tables and method notes into familiar formats for handover and review."],
] as const;

const modules = [
  ["01", "RBD", "Available now", "Model success paths, redundancy and grouped subsystems. Calculate failure rate, MTBF, MTTR and availability."],
  ["02", "FTA", "Available now", "Build failure logic, evaluate the top event and keep the calculation explanation close."],
  ["03", "FMECA", "Planned", "Structure failure modes, effects, criticality and actions around the same component baseline."],
  ["04", "PM / CM", "Planned", "Compare preventive and corrective maintenance strategies, intervals and lifecycle cost assumptions."],
  ["05", "Spare Parts Analysis", "Planned", "Turn demand, repair and lead-time assumptions into practical stock and provisioning decisions."],
  ["06", "RCIL", "Planned", "Maintain the Reliability Critical Items List and link critical items to reliability controls and evidence."],
  ["07", "SCIL", "Planned", "Maintain the Safety Critical Items List and trace safety-critical items to controls and assurance evidence."],
  ["08", "Variable Analysis", "Planned", "Explore parameter ranges and sensitivity to understand which assumptions most influence the RAM result."],
] as const;

export default function LandingPage() {
  const [menuOpen, setMenuOpen] = useState(false);
  function submitContact(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const subject = `RAMSport enquiry ? ${data.get("name") || "Website contact"}`;
    const body = [`Name: ${data.get("name")}`, `Reply to: ${data.get("contact")}`].join("\n");
    window.location.href = `mailto:sales@ramsport.app?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }
  return <div className="nova-page">
    <a className="nova-skip" href="#main">Skip to content</a>
    <header className="nova-nav-shell"><nav className="nova-nav" aria-label="Primary navigation">
      <Link className="nova-brand" href="/"><span className="nova-mark"><i/><i/><i/></span><span><strong>RAMSport</strong><small>RAM engineering workspace</small></span><b>BETA</b></Link>
      <div id="landing-menu" className={`nova-links ${menuOpen ? "open" : ""}`}><a href="#application">Application</a><a href="#benefits">Benefits</a><a href="#modules">Modules</a><a href="#workflow">Workflow</a><a href="#standards">Standards</a><a href="#contact">Contact</a></div>
      <div className="nova-actions"><Link href="/login">Sign in</Link><Link className="nova-button small" href="/login">Open RAMSport ?</Link><button className="nova-menu" onClick={() => setMenuOpen(value => !value)} aria-expanded={menuOpen} aria-controls="landing-menu" aria-label="Toggle navigation"><span/><span/></button></div>
    </nav></header>

    <main id="main">
      <section className="nova-hero">
        <div className="nova-hero-copy" id="application"><p className="nova-kicker">A focused web application for RAMS engineers</p><h1>One port for every <em>RAMS engineering activity.</em></h1><p className="nova-lede">RAMSport means the port for RAMS work: a browser-based application where reliability, availability, maintainability and safety modules share data, models, results and evidence.</p><div className="nova-hero-actions"><Link className="nova-button" href="/login">Open RAMSport ?</Link><a className="nova-button ghost" href="#contact">Talk to us</a></div><div className="nova-proof"><span>? Browser-based application</span><span>? RBD + FTA available now</span><span>? Explainable outputs</span></div></div>
        <div className="nova-console" aria-label="RAMSport application preview"><div className="nova-window"><div><i/><i/><i/></div><span>Metro communications / Passenger information</span><b>Analysis ready</b></div><div className="nova-console-body"><aside><strong>RAMSport</strong><span>Projects</span><span>Data register</span><span className="active">RBD workspace</span><span>Fault tree</span><span>Reports</span><small>MODULE STATUS</small><b>RBD ? In review</b><b>FTA ? Draft</b></aside><div className="nova-model"><header><div><strong>Passenger information availability</strong><small>Projects / Communications / Untitled RBD</small></div><span>Calculate</span></header><div className="nova-workspace-strip"><b>Components 24</b><b>Groups 3</b><b>Configuration 1oo2</b></div><svg viewBox="0 0 650 270" role="img" aria-label="Passenger information reliability block diagram"><path d="M105 135H150M245 135H285M380 78H415M380 192H415M510 78H545V135M510 192H545V135H590M285 135V78H305M285 135V192H305"/><g transform="translate(20 108)"><rect width="85" height="54" rx="7"/><text x="42" y="25">STATION</text><text className="sub" x="42" y="40">MMI</text></g><g transform="translate(150 108)"><rect width="95" height="54" rx="7"/><text x="47" y="25">FOTS</text><text className="sub" x="47" y="40">NETWORK</text></g><g transform="translate(305 51)"><rect width="75" height="54" rx="7"/><text x="37" y="25">SERVER</text><text className="sub" x="37" y="40">A</text></g><g transform="translate(305 165)"><rect width="75" height="54" rx="7"/><text x="37" y="25">SERVER</text><text className="sub" x="37" y="40">B</text></g><g transform="translate(415 51)"><rect width="95" height="54" rx="7"/><text x="47" y="25">DISPLAY</text><text className="sub" x="47" y="40">CONTROL</text></g><g transform="translate(415 165)"><rect width="95" height="54" rx="7"/><text x="47" y="25">PA</text><text className="sub" x="47" y="40">CONTROL</text></g><g transform="translate(590 108)"><rect width="55" height="54" rx="7"/><text x="27" y="33">OUT</text></g></svg><div className="nova-results"><div><small>? (1/h)</small><strong>2.43 ? 10??</strong></div><div><small>MTBF</small><strong>411,523 h</strong></div><div><small>AVAILABILITY</small><strong>99.9971%</strong></div></div><div className="nova-model-notes"><span><b>Architecture checked</b><small>Connected success path with 1oo2 server redundancy</small></span><span><b>Evidence ready</b><small>Model, calculation and explanation export together</small></span></div></div></div></div>
      </section>
      <div className="nova-marquee">MODEL SUCCESS PATHS???TRACE FAILURE LOGIC???QUANTIFY AVAILABILITY???EXPLAIN THE RESULT???EXPORT THE EVIDENCE</div>

      <section className="nova-section" id="benefits"><p className="nova-label">01 / Who it helps</p><div className="nova-heading"><p>One application.<br/>Different scales of work.</p><h2>From an independent study to a company-wide engineering method.</h2></div><div className="nova-audiences">{audiences.map(([label,title,copy],i)=><article key={label}><span>0{i+1}</span><small>{label}</small><h3>{title}</h3><p>{copy}</p></article>)}</div></section>

      <section className="nova-section nova-benefits"><p className="nova-label">02 / Why RAMSport</p><div className="nova-heading"><p>Useful before,<br/>during and after review.</p><h2>A clearer route from ?how is it built?? to ?is it good enough??</h2></div><div className="nova-benefit-grid">{benefits.map(([title,copy],i)=><article key={title}><span>{String(i+1).padStart(2,"0")}</span><h3>{title}</h3><p>{copy}</p></article>)}</div></section>

      <section className="nova-modules" id="modules"><div className="nova-modules-intro"><p className="nova-label">03 / Application roadmap</p><h2>A connected RAMS application, <em>built module by module.</em></h2><p>RBD and FTA are available now. FMECA, PM/CM, Spare Parts Analysis, RCIL, SCIL and Variable Analysis form the planned application roadmap and are not presented as released features.</p><div className="nova-module-summary"><article><strong>2</strong><span>analysis modules available</span></article><article><strong>6</strong><span>connected modules planned</span></article><article><strong>1</strong><span>shared engineering baseline</span></article></div></div><div className="nova-module-list">{modules.map(([code,name,state,copy])=><article className={state === "Planned" ? "planned" : "live"} key={name}><span>{code}</span><h3>{name}</h3><p>{copy}</p><b>{state}</b></article>)}</div></section>

      <section className="nova-section" id="workflow"><p className="nova-label">04 / Working method</p><div className="nova-heading"><p>Four moves.<br/>One engineering thread.</p><h2>Build the evidence without losing the reasoning.</h2></div><div className="nova-flow">{[["BASELINE","Capture what is known","Record identity, failure rate, repair time and operating assumptions."],["ARCHITECTURE","Draw how the system behaves","Use RBDs for success paths and fault trees for combinations that cause failure."],["CALCULATION","Quantify the design","Calculate when the model is ready, with the reasoning available beside the result."],["DECISION","Review and communicate","Use the visible model and exports to support a design or client conversation."]].map(([tag,title,copy],i)=><article key={tag}><b>0{i+1}</b><div><small>{tag}</small><h3>{title}</h3><p>{copy}</p></div></article>)}</div></section>

      <section className="nova-contact" id="contact"><div><p className="nova-kicker" id="standards">Built around recognised RAMS methods</p><h2>Get in touch with the RAMSport team.</h2><p>Leave your name and preferred phone number or email address so we can respond.</p></div><form className="nova-contact-form" onSubmit={submitContact}><label>Name<input name="name" required placeholder="Your name"/></label><label>Phone number or email<input name="contact" required placeholder="How should we contact you? (e.g. sivasaimutyala2003@gmail.com)"/></label><button className="nova-button light" type="submit">Prepare contact ?</button></form></section>
    </main>
    <footer className="nova-footer"><div className="nova-footer-lead"><div className="nova-brand"><span className="nova-mark"><i/><i/><i/></span><span><strong>RAMSport</strong><small>The port for RAMS engineering</small></span></div><h2>Connect the analysis.<br/>Keep the evidence.</h2><Link className="nova-button" href="/login">Open RAMSport ?</Link></div><div className="nova-footer-links"><div><strong>Application</strong><a href="#benefits">Benefits</a><a href="#modules">Modules</a><a href="#workflow">Workflow</a></div><div><strong>Access</strong><Link href="/login">Sign in</Link><a href="#contact">Get in touch</a><a href="mailto:sales@ramsport.app">Contact sales</a></div><div><strong>Methods</strong><span>IEC 61078 RBD</span><span>IEC 61025 FTA</span><span>RAMS engineering</span></div></div><div className="nova-footer-bottom"><span>? 2026 RAMSport</span><p>One connected web application for RAMS analysis and evidence.</p><a href="#main">Back to top ?</a></div><div className="nova-footer-contact"><small>Contact: sivasaimutyala2003@gmail.com</small></div></footer>
  </div>;
}
