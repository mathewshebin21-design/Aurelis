"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { motion } from "motion/react";
import { fmtPct, fmtPrice } from "@/lib/utils";
import { AS_OF, getCompany } from "@/lib/data/build";
import { runDcf } from "@/lib/finance/dcf";
import { routes } from "@/lib/designs";
import { Button } from "@/components/ui/button";

const PRINCIPLES = [
  { n: "I", t: "Evidence before opinion", d: "Every statement in a research note is labelled — sourced fact, analyst assumption or AI interpretation — and linked to the passage it rests on." },
  { n: "II", t: "Valuation you can interrogate", d: "Discounted cash flow, scenarios and comparables are calculated by a tested engine. Move an assumption; watch every figure respond." },
  { n: "III", t: "Ready for the committee", d: "Briefings and memoranda composed for decision-makers: what matters, what could go wrong, and what would change the view." },
];

export function LandingB() {
  const c = getCompany("MRDN")!;
  const v = runDcf(c.dcf);
  const r = routes("b", c.ticker);
  return (
    <div className="min-h-dvh bg-bg">
      <div className="bg-[var(--navy)] px-4 py-1.5 text-center text-[11px] tracking-wide text-[var(--gold)]">Illustrative design preview · fictional companies and figures</div>
      <header className="mx-auto flex h-20 max-w-6xl items-center gap-6 px-4 sm:px-6">
        <span className="font-display text-[28px] font-medium tracking-tight text-fg">Aurelis</span>
        <span className="hidden text-[10px] uppercase tracking-[0.3em] text-accent sm:inline">Private</span>
        <nav className="ml-auto flex items-center gap-5 text-[12.5px] uppercase tracking-[0.14em] text-fg-2">
          <Link href={r.dashboard} className="hidden hover:text-fg sm:inline">Briefing</Link>
          <Link href={r.company} className="hidden hover:text-fg sm:inline">Research</Link>
          <Link href="/" className="hover:text-fg">Compare</Link>
        </nav>
      </header>

      <section className="mx-auto grid max-w-6xl gap-14 px-4 pb-20 pt-10 sm:px-6 lg:grid-cols-[1.2fr_1fr] lg:pt-16">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7 }}>
          <div className="mb-6 text-[11px] uppercase tracking-[0.3em] text-accent">Design B · Private wealth</div>
          <h1 className="font-display text-5xl font-light leading-[1.02] tracking-tight text-fg sm:text-7xl">
            Clarity for <em className="font-normal text-accent">considered</em> capital.
          </h1>
          <p className="mt-8 max-w-lg text-[17px] leading-relaxed text-fg-2">
            Institutional research distilled into calm, evidence-led briefings — for principals, family offices and investment committees who need to understand a decision, not just
            see a number.
          </p>
          <div className="mt-10 flex flex-wrap items-center gap-4">
            <Button asChild size="lg" className="rounded-none bg-[var(--navy)] px-7 text-[#f7f3ea] hover:bg-[var(--navy-2)]">
              <Link href={r.dashboard}>Read the briefing</Link>
            </Button>
            <Link href={r.company} className="inline-flex items-center gap-1.5 border-b border-accent pb-0.5 text-[14px] text-fg">
              Open a research report <ArrowRight className="size-4" />
            </Link>
          </div>
        </motion.div>

        <motion.aside
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.15 }}
          className="relative bg-[var(--navy)] p-8 text-[#efe9dc] shadow-[0_40px_80px_-40px_rgba(15,26,51,0.6)] sm:p-10"
        >
          <div className="absolute inset-3 border border-[color-mix(in_oklab,var(--gold)_45%,transparent)]" aria-hidden />
          <div className="relative">
            <div className="text-[10.5px] uppercase tracking-[0.3em] text-[var(--gold)]">Investment committee memorandum</div>
            <div className="mt-5 font-display text-3xl text-[#f7f3ea]">{c.name}</div>
            <div className="mt-1 text-[12px] text-[#b8b1a1]">{c.industry} · Illustrative · {AS_OF}</div>
            <div className="mt-8 grid grid-cols-2 gap-6 border-y border-[color-mix(in_oklab,var(--gold)_30%,transparent)] py-6">
              <div>
                <div className="text-[10.5px] uppercase tracking-[0.2em] text-[#b8b1a1]">Model value</div>
                <div className="num mt-1 font-display text-4xl text-[#f7f3ea]">{fmtPrice(v.perShare)}</div>
                <div className="text-[12px] text-[#b8b1a1]">{fmtPct(v.perShare / c.price - 1, 0, true)} vs. {fmtPrice(c.price)}</div>
              </div>
              <div>
                <div className="text-[10.5px] uppercase tracking-[0.2em] text-[#b8b1a1]">Financial health</div>
                <div className="num mt-1 font-display text-4xl text-[#f7f3ea]">{c.health.total}</div>
                <div className="text-[12px] text-[#b8b1a1]">{c.health.grade} · five-pillar rule</div>
              </div>
            </div>
            <ul className="mt-6 space-y-4 font-display text-[16px] leading-snug">
              <li><span className="mr-2 text-[var(--gold)]">For.</span>{c.bull[0].text}</li>
              <li><span className="mr-2 text-[var(--gold)]">Against.</span>{c.bear[1].text}</li>
            </ul>
            <div className="mt-6 text-[11px] text-[#8f8878]">Sourced facts carry citations [E1–E4]. Fictional issuer.</div>
          </div>
        </motion.aside>
      </section>

      <section className="border-y border-line bg-panel">
        <div className="mx-auto grid max-w-6xl gap-px bg-line px-0 md:grid-cols-3">
          {PRINCIPLES.map((p, i) => (
            <motion.div key={p.n} initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ delay: i * 0.1 }} className="bg-panel px-6 py-12 sm:px-8">
              <div className="font-display text-2xl italic text-accent">{p.n}.</div>
              <h2 className="mt-4 font-display text-2xl text-fg">{p.t}</h2>
              <p className="mt-3 text-[14.5px] leading-relaxed text-fg-2">{p.d}</p>
            </motion.div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-4 py-20 text-center sm:px-6">
        <blockquote className="font-display text-3xl font-light leading-snug text-fg sm:text-4xl">
          “The purpose of research is not to be certain. It is to know precisely where the uncertainty lies.”
        </blockquote>
        <div className="mt-5 text-[11px] uppercase tracking-[0.28em] text-muted">Aurelis design principle</div>
      </section>

      <footer className="bg-[var(--navy)] px-4 py-10 text-[12.5px] text-[#b8b1a1] sm:px-6">
        <div className="mx-auto max-w-6xl">All companies, prices, filings and analyses shown are fictional and exist only to evaluate this design. Nothing here is investment advice.</div>
      </footer>
    </div>
  );
}
