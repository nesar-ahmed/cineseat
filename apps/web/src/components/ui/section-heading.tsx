import type { ReactNode } from 'react';

type Props = {
  eyebrow: string;
  title: ReactNode;
  description?: ReactNode;
  /** Right-aligned slot on wide screens: a "View all" link, tabs, arrows. */
  action?: ReactNode;
  id?: string;
};

/** The one heading pattern every home and catalog section uses. */
export function SectionHeading({ eyebrow, title, description, action, id }: Props) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-5">
      <div className="max-w-2xl">
        <p className="section-label">{eyebrow}</p>
        <h2
          id={id}
          className="mt-3 text-3xl font-semibold tracking-tight text-ink-50 sm:text-4xl lg:text-[2.75rem] lg:leading-[1.1]"
        >
          {title}
        </h2>
        {description ? (
          <p className="mt-3 text-base leading-relaxed text-ink-400">{description}</p>
        ) : null}
      </div>
      {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
    </div>
  );
}
