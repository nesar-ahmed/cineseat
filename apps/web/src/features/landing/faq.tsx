import { ChevronDownIcon } from '../../components/ui/icons';
import { SectionHeading } from '../../components/ui/section-heading';
import { FAQS } from './content';

/** Native <details>: keyboard and screen-reader friendly with no script. */
export function Faq() {
  return (
    <section
      id="faq"
      aria-labelledby="faq-title"
      className="container-x scroll-mt-24 pt-24 sm:pt-32"
    >
      <div className="grid items-start gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
        <div className="lg:sticky lg:top-28">
          <SectionHeading
            id="faq-title"
            eyebrow="Good to know"
            title="Questions, answered"
            description="The rules are the same at every cinema and for every show — and they are enforced by the system, not left to luck."
          />
        </div>
        <ul className="divide-y divide-white/[0.06] border-y border-white/[0.06]">
          {FAQS.map((item) => (
            <li key={item.question}>
              <details className="group py-1">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-6 rounded-xl py-4 text-left text-base font-semibold text-ink-50 marker:hidden [&::-webkit-details-marker]:hidden">
                  {item.question}
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/10 text-ink-300 transition group-open:rotate-180 group-open:border-brand-500/60 group-open:text-brand-300 motion-reduce:transition-none">
                    <ChevronDownIcon className="h-4 w-4" />
                  </span>
                </summary>
                <p className="pb-5 pr-12 text-sm leading-relaxed text-ink-400">{item.answer}</p>
              </details>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
