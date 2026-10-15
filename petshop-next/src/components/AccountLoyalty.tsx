"use client";

import { useEffect, useRef, useState } from "react";

function ordinal(visit: number) {
  return `${visit}${visit === 1 ? "st" : visit === 2 ? "nd" : visit === 3 ? "rd" : "th"}`;
}

function milestoneRule(visit: number) {
  if (visit === 1) return "Your first completed grooming visit starts your free loyalty card and earns one stamp.";
  if (visit === 5 || visit === 10) return `Your ${ordinal(visit)} completed grooming appointment earns a stamp and receives 50% off its services.`;
  if (visit === 6) return "Earn one loyalty stamp. Your 6th grooming visit returns to the original service price. Complete 10 visits to receive another 50% discount.";
  if (visit === 11) return "From your 11th completed grooming visit, you become a lifetime VIP and receive 10% off all services. Your loyalty progress never resets.";
  return `Earn one loyalty stamp at the original service price. Complete ${visit < 5 ? "5" : "10"} grooming visits to receive a 50% discount on that milestone appointment.`;
}

export default function AccountLoyalty({ visits, vip }: { visits: number; vip: boolean }) {
  const [selected, setSelected] = useState<number | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const dismissed = useRef(false);

  useEffect(() => {
    if (selected !== null && !dialog.current?.open) dialog.current?.showModal();
  }, [selected]);

  function open(visit: number) {
    dismissed.current = false;
    setSelected(visit);
  }

  function close() {
    dismissed.current = true;
    dialog.current?.close();
    setSelected(null);
  }

  return <section className="loyaltyCard">
    <div><small>LOYALTY PROGRESS</small><h3>{vip ? "LIFETIME VIP" : `${visits}/11 stamps`}</h3>{vip && <p>10% off all services · {visits} completed visits</p>}</div>
    <div className="stampTrack" aria-label={`${visits} completed grooming visits`}>
      {Array.from({ length: 11 }, (_, index) => {
        const visit = index + 1;
        const earned = visit === 11 ? vip : visit <= visits;
        return <button type="button" key={visit}
          className={`${earned ? "earned" : ""} ${visit === 5 || visit === 10 ? "loyaltyMilestone" : ""} ${visit === 11 ? "accountReward" : ""}`}
          aria-label={`${ordinal(visit)} grooming visit: ${earned ? "earned" : "not yet earned"}`}
          aria-haspopup="dialog" aria-pressed={selected === visit}
          onMouseEnter={() => open(visit)} onClick={() => open(visit)}
          onFocus={() => { if (!dismissed.current) setSelected(visit); }}>
          <span aria-hidden="true">{visit === 11 ? "♛" : "★"}</span>
          {(visit === 5 || visit === 10 || visit === 11) && <small>{visit === 11 ? "VIP" : "50%"}</small>}
        </button>;
      })}
    </div>
    <progress className="accountLoyaltyProgress" value={Math.min(11, visits)} max={11} aria-label="Progress toward lifetime VIP" />
    <p className="accountLoyaltyRule">One stamp per completed grooming. 5th and 10th visits: 50% off. 6th visit: original price. 11th visit onward: lifetime VIP with 10% off services. Progress never resets.</p>
    <dialog ref={dialog} className="loyaltyMilestoneDialog" aria-labelledby="loyalty-milestone-title"
      onCancel={(event) => { event.preventDefault(); close(); }}
      onClick={(event) => { if (event.target === event.currentTarget) close(); }}>
      <div className="loyaltyMilestonePopup">
        <button type="button" className="loyaltyPopupClose" aria-label="Close loyalty rule" onClick={close}>×</button>
        <header><span aria-hidden="true">{selected === 11 ? "♛" : "☆"}</span><div><small>LOYALTY MILESTONE</small><h3 id="loyalty-milestone-title">{selected === 11 ? "Lifetime VIP" : `${ordinal(selected || 1)} Grooming Visit`}</h3></div></header>
        <p>{milestoneRule(selected || 1)}</p>
        <button type="button" className="loyaltyPopupConfirm" onClick={close}>Got it</button>
      </div>
    </dialog>
  </section>;
}
