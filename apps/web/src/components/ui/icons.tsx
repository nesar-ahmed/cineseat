import type { SVGProps } from 'react';

/**
 * Icons are inlined rather than pulled from an icon package: no extra request,
 * no extra dependency, and they inherit `currentColor`.
 * They are decorative — the text next to them carries the meaning.
 */
type IconProps = SVGProps<SVGSVGElement>;

function Svg({ children, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {children}
    </svg>
  );
}

export function TicketIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3 9.5V7a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v2.5a2.5 2.5 0 0 0 0 5V17a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-2.5a2.5 2.5 0 0 0 0-5Z" />
      <path d="M14 6v12" strokeDasharray="2 2" />
    </Svg>
  );
}

export function SeatIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M6 10V6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v4" />
      <path d="M4 12a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v4H4v-4Z" />
      <path d="M7 16v3M17 16v3" />
    </Svg>
  );
}

export function BoltIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M13 2 4.5 13.5H11l-1 8.5L19.5 10H13l0-8Z" />
    </Svg>
  );
}

export function ShieldIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 3l7 3v6c0 4.2-2.9 7.6-7 9-4.1-1.4-7-4.8-7-9V6l7-3Z" />
      <path d="M9 12l2 2 4-4" />
    </Svg>
  );
}

export function QrIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <path d="M14 14h3v3h-3zM20 17v4h-3" />
    </Svg>
  );
}

export function ClockIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 8v4.5l3 1.8" />
    </Svg>
  );
}

export function StarIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false" {...props}>
      <path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9-5.2-2.8-5.2 2.8 1-5.9L3.5 9.7l5.9-.8L12 3.5Z" />
    </svg>
  );
}

export function MapPinIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 21s6.5-5.6 6.5-10.5A6.5 6.5 0 1 0 5.5 10.5C5.5 15.4 12 21 12 21Z" />
      <circle cx="12" cy="10.3" r="2.3" />
    </Svg>
  );
}

export function ArrowRightIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 12h15" />
      <path d="M13 6l6 6-6 6" />
    </Svg>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <Svg {...props} strokeWidth={2}>
      <path d="M5 12.5l4.5 4.5L19 7" />
    </Svg>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <Svg {...props} strokeWidth={2}>
      <path d="M6 6l12 12M18 6L6 18" />
    </Svg>
  );
}

export function MenuIcon(props: IconProps) {
  return (
    <Svg {...props} strokeWidth={1.8}>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </Svg>
  );
}

export function ScreenIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3 6l18-3v15l-18 3V6Z" />
      <path d="M7 8.5v8M11 8v8.5M15 7.5v8" opacity="0.5" />
    </Svg>
  );
}

/** Brand mark: a seat inside a ticket-shaped tile. Fixed size, no props to clash with. */
export function SearchIcon(props: IconProps) {
  return (
    <Svg {...props} strokeWidth={1.8}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16l4.5 4.5" />
    </Svg>
  );
}

export function HeartIcon({ filled, ...props }: IconProps & { filled?: boolean }) {
  return (
    <Svg {...props} fill={filled ? 'currentColor' : 'none'}>
      <path d="M12 20s-7.5-4.4-7.5-10.1A4.4 4.4 0 0 1 12 7.6a4.4 4.4 0 0 1 7.5 2.3C19.5 15.6 12 20 12 20Z" />
    </Svg>
  );
}

export function PlayIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false" {...props}>
      <path d="M8 5.6v12.8a.9.9 0 0 0 1.4.8l10-6.4a.9.9 0 0 0 0-1.6l-10-6.4a.9.9 0 0 0-1.4.8Z" />
    </svg>
  );
}

export function CalendarIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="3.5" y="5" width="17" height="15" rx="2.5" />
      <path d="M3.5 9.5h17M8 3v4M16 3v4" />
    </Svg>
  );
}

export function SlidersIcon(props: IconProps) {
  return (
    <Svg {...props} strokeWidth={1.8}>
      <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
      <circle cx="15" cy="7" r="2" />
      <circle cx="9" cy="17" r="2" />
    </Svg>
  );
}

export function GridIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="4" y="4" width="6.5" height="6.5" rx="1.5" />
      <rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5" />
      <rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5" />
      <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5" />
    </Svg>
  );
}

export function ListIcon(props: IconProps) {
  return (
    <Svg {...props} strokeWidth={1.8}>
      <rect x="4" y="5" width="4" height="4" rx="1" />
      <rect x="4" y="15" width="4" height="4" rx="1" />
      <path d="M11 7h9M11 17h9" />
    </Svg>
  );
}

export function ChevronLeftIcon(props: IconProps) {
  return (
    <Svg {...props} strokeWidth={2}>
      <path d="M15 5l-7 7 7 7" />
    </Svg>
  );
}

export function ChevronRightIcon(props: IconProps) {
  return (
    <Svg {...props} strokeWidth={2}>
      <path d="M9 5l7 7-7 7" />
    </Svg>
  );
}

export function ChevronDownIcon(props: IconProps) {
  return (
    <Svg {...props} strokeWidth={2}>
      <path d="M5 9l7 7 7-7" />
    </Svg>
  );
}

export function SparklesIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M10 3.5l1.6 4.4L16 9.5l-4.4 1.6L10 15.5l-1.6-4.4L4 9.5l4.4-1.6L10 3.5Z" />
      <path d="M18 14l.8 2.2L21 17l-2.2.8L18 20l-.8-2.2L15 17l2.2-.8L18 14Z" />
    </Svg>
  );
}

export function CopyIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="8.5" y="8.5" width="11" height="11" rx="2.5" />
      <path d="M15.5 8.5V6a1.5 1.5 0 0 0-1.5-1.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5" />
    </Svg>
  );
}

export function GlassesIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M2.5 9.5h19l-1.2 6.2a2 2 0 0 1-2 1.6h-3a2 2 0 0 1-1.9-1.4L12.8 14h-1.6l-.6 1.9a2 2 0 0 1-1.9 1.4h-3a2 2 0 0 1-2-1.6L2.5 9.5Z" />
    </Svg>
  );
}

export function GlobeIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17M12 3.5c2.4 2.5 3.5 5.3 3.5 8.5s-1.1 6-3.5 8.5c-2.4-2.5-3.5-5.3-3.5-8.5s1.1-6 3.5-8.5Z" />
    </Svg>
  );
}

export function UserIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="8.5" r="3.8" />
      <path d="M4.5 20c1.2-3.6 4-5.5 7.5-5.5s6.3 1.9 7.5 5.5" />
    </Svg>
  );
}

export function BellIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M6 16.5V11a6 6 0 1 1 12 0v5.5l1.5 1.5h-15L6 16.5Z" />
      <path d="M10 20.5a2.2 2.2 0 0 0 4 0" />
    </Svg>
  );
}

export function ReceiptIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M6 3.5h12v17l-2.4-1.5-2.4 1.5-2.4-1.5-2.4 1.5L6 20.5v-17Z" />
      <path d="M9 8h6M9 11.5h6M9 15h3.5" />
    </Svg>
  );
}

export function MailIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="3.5" y="5.5" width="17" height="13" rx="2" />
      <path d="M4 7l8 6 8-6" />
    </Svg>
  );
}

export function LockIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="5" y="10.5" width="14" height="10" rx="2" />
      <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
      <path d="M12 14.5v2" />
    </Svg>
  );
}

export function PencilIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4.5 19.5l1-4L15.8 5.2a2 2 0 0 1 2.8 0l.2.2a2 2 0 0 1 0 2.8L8.5 18.5l-4 1Z" />
      <path d="M14 7l3 3" />
    </Svg>
  );
}

export function TrashIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4.5 7h15M9.5 7V5a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v2" />
      <path d="M6.5 7l.9 12a1.5 1.5 0 0 0 1.5 1.4h6.2a1.5 1.5 0 0 0 1.5-1.4l.9-12" />
      <path d="M10 11v5.5M14 11v5.5" />
    </Svg>
  );
}

export function PrinterIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M7 8.5V4h10v4.5" />
      <rect x="3.5" y="8.5" width="17" height="8" rx="2" />
      <path d="M7 14h10v6H7z" />
      <path d="M17 11.5h.01" />
    </Svg>
  );
}

export function SignOutIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M14 4.5H6.5a1 1 0 0 0-1 1v13a1 1 0 0 0 1 1H14" />
      <path d="M10.5 12h9M16.5 8.5 20 12l-3.5 3.5" />
    </Svg>
  );
}

export function PercentIcon(props: IconProps) {
  return (
    <Svg {...props} strokeWidth={1.8}>
      <path d="M18.5 5.5l-13 13" />
      <circle cx="7.5" cy="7.5" r="2.2" />
      <circle cx="16.5" cy="16.5" r="2.2" />
    </Svg>
  );
}

export function FilmIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="3.5" y="4" width="17" height="16" rx="2.5" />
      <path d="M7.5 4v16M16.5 4v16M3.5 9h4M3.5 15h4M16.5 9h4M16.5 15h4" />
    </Svg>
  );
}

export function InfoIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5.5M12 7.8v.2" strokeWidth={2} />
    </Svg>
  );
}

/** Admin: the dashboard (tiles of different sizes). */
export function DashboardIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="3.5" y="3.5" width="7" height="9" rx="1.5" />
      <rect x="13.5" y="3.5" width="7" height="5" rx="1.5" />
      <rect x="13.5" y="11.5" width="7" height="9" rx="1.5" />
      <rect x="3.5" y="15.5" width="7" height="5" rx="1.5" />
    </Svg>
  );
}

/** Admin: theaters and screens. */
export function BuildingIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 20.5V9l8-5 8 5v11.5" />
      <path d="M2.5 20.5h19M9 20.5v-5h6v5M8 11.5h.01M12 11.5h.01M16 11.5h.01" />
    </Svg>
  );
}

/** Admin: accounts (more than one person). */
export function UsersIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="9" cy="8.5" r="3.3" />
      <path d="M3 19.5c.9-3.2 3.2-5 6-5s5.1 1.8 6 5" />
      <path d="M15.5 5.4a3.3 3.3 0 0 1 0 6.2M17.5 14.8c1.8.6 3 2.2 3.5 4.7" />
    </Svg>
  );
}

/** Admin: announcements. */
export function MegaphoneIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 10v4a1 1 0 0 0 1 1h2l9 4.5v-15L7 9H5a1 1 0 0 0-1 1Z" />
      <path d="M19 9.5a3.5 3.5 0 0 1 0 5M7.5 15l1.5 5" />
    </Svg>
  );
}

/** Admin: reports. */
export function ChartIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 4v16h16" />
      <path d="M8 16v-4M12 16V8M16 16v-6" strokeWidth={2} />
    </Svg>
  );
}

/** Admin: the audit log. */
export function ClipboardIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="5" y="4.5" width="14" height="16" rx="2" />
      <path d="M9 4.5V3.5h6v1M8.5 10h7M8.5 13.5h7M8.5 17h4" />
    </Svg>
  );
}

/** A sidebar beside a page — the admin sidebar's collapse / expand control. */
export function SidebarIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
      <path d="M9.5 4.5v15" />
    </Svg>
  );
}

export function ExternalLinkIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M13.5 4.5h6v6M19.5 4.5 11 13" />
      <path d="M18 14v4.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10" />
    </Svg>
  );
}

export function TrendUpIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 16.5 9.5 11l3.5 3.5L20 7.5" />
      <path d="M14.5 7.5H20V13" />
    </Svg>
  );
}

export function TrendDownIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 7.5 9.5 13l3.5-3.5 7 7" />
      <path d="M14.5 16.5H20V11" />
    </Svg>
  );
}

export function RefreshIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3L19.5 9" />
      <path d="M19.5 4v5h-5" />
    </Svg>
  );
}

export function PlusIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 5v14M5 12h14" />
    </Svg>
  );
}

/** Three dots: a row's "more actions" menu. */
export function MoreIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="5.5" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="12" cy="18.5" r="1.2" fill="currentColor" stroke="none" />
    </Svg>
  );
}

export function UploadIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 15.5V4.5M7.5 9 12 4.5 16.5 9" />
      <path d="M4.5 15v3a1.5 1.5 0 0 0 1.5 1.5h12a1.5 1.5 0 0 0 1.5-1.5v-3" />
    </Svg>
  );
}

export function ImageIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="4" y="4.5" width="16" height="15" rx="2" />
      <circle cx="9" cy="9.5" r="1.5" />
      <path d="m20 15.5-4.5-4.5L6 19.5" />
    </Svg>
  );
}

/** Up and down arrows: a sortable column that is not sorted. */
export function SortIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M8 19V5M4.5 8.5 8 5l3.5 3.5" />
      <path d="M16 5v14M12.5 15.5 16 19l3.5-3.5" />
    </Svg>
  );
}

export function ArrowUpIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 19V5M6 11l6-6 6 6" />
    </Svg>
  );
}

export function ArrowDownIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 5v14M6 13l6 6 6-6" />
    </Svg>
  );
}

export function AlertIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M10.3 4.6 3.2 17a2 2 0 0 0 1.7 3h14.2a2 2 0 0 0 1.7-3L13.7 4.6a2 2 0 0 0-3.4 0Z" />
      <path d="M12 9.5v4M12 16.8v.2" />
    </Svg>
  );
}

export function EyeIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="2.75" />
    </Svg>
  );
}

/** A clock with an arrow going back: a record of changes. */
export function HistoryIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3L4.5 9" />
      <path d="M4.5 4v5h5" />
      <path d="M12 8v4.5l3 1.5" />
    </Svg>
  );
}

export function LogoMark() {
  return (
    <span
      className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-800 text-white shadow-glow"
      aria-hidden="true"
    >
      <SeatIcon className="h-5 w-5" />
    </span>
  );
}
