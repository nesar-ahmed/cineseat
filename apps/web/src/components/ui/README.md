# components/ui

Small reusable primitives for the whole web app. The landing page introduced the
first of them: `icons.tsx` (inline SVGs, no icon package, no extra request).
Form controls, modals and inputs arrive with the pages that need them — buttons
and chips are Tailwind classes in `app/globals.css`, not components, so they can
be composed anywhere.
