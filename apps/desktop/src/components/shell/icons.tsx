/**
 * Minimal stroke icon set for the navigation rail and toolbars.
 *
 * Hand-written rather than pulled from an icon package: the shell needs a
 * handful of glyphs, and AGENTS.md section 36 asks that we not add
 * dependencies for trivial helpers. All icons inherit `currentColor` and a
 * 16px box.
 */

interface IconProps {
  className?: string;
}

function svgProps(className?: string) {
  return {
    className,
    width: 16,
    height: 16,
    viewBox: "0 0 16 16",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.5,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
}

/** Cockpit: grouped rows. */
export function CockpitIcon({ className }: IconProps) {
  return (
    <svg {...svgProps(className)}>
      <path d="M2 3.5h12M4.5 8h9.5M4.5 12.5h9.5" />
      <path d="M2 8v4.5" />
    </svg>
  );
}

/** Quick Launch: search. */
export function SearchIcon({ className }: IconProps) {
  return (
    <svg {...svgProps(className)}>
      <circle cx="7" cy="7" r="4.25" />
      <path d="m10.25 10.25 3.25 3.25" />
    </svg>
  );
}

/** Agent monitor: pulse. */
export function PulseIcon({ className }: IconProps) {
  return (
    <svg {...svgProps(className)}>
      <path d="M1.5 8h3l2-4.5 3 9 2-4.5h3" />
    </svg>
  );
}

/** Settings: sliders. */
export function SettingsIcon({ className }: IconProps) {
  return (
    <svg {...svgProps(className)}>
      <path d="M2 4.5h5M10 4.5h4M2 11.5h4M9 11.5h5" />
      <circle cx="8.5" cy="4.5" r="1.75" />
      <circle cx="7.5" cy="11.5" r="1.75" />
    </svg>
  );
}

/** Sidebar collapse toggle. */
export function SidebarIcon({ className }: IconProps) {
  return (
    <svg {...svgProps(className)}>
      <rect x="2" y="3" width="12" height="10" rx="1.5" />
      <path d="M6 3v10" />
    </svg>
  );
}

/** Tray: stacked layers. */
export function TrayIcon({ className }: IconProps) {
  return (
    <svg {...svgProps(className)}>
      <path d="M2 10.5 8 13.5l6-3" />
      <path d="M2 7.5 8 10.5l6-3" />
      <path d="M8 2.5 2 5.5l6 3 6-3z" />
    </svg>
  );
}

/** Disclosure chevron; rotate with a class when expanded. */
export function ChevronIcon({ className }: IconProps) {
  return (
    <svg {...svgProps(className)}>
      <path d="m6 4 4 4-4 4" />
    </svg>
  );
}

/** Theme: match the desktop environment. */
export function SystemThemeIcon({ className }: IconProps) {
  return (
    <svg {...svgProps(className)}>
      <rect x="1.5" y="3" width="13" height="8.5" rx="1.5" />
      <path d="M6 14h4" />
    </svg>
  );
}

/** Theme: light. */
export function SunIcon({ className }: IconProps) {
  return (
    <svg {...svgProps(className)}>
      <circle cx="8" cy="8" r="3" />
      <path d="M8 1.5v1.5M8 13v1.5M1.5 8H3M13 8h1.5M3.4 3.4l1.1 1.1M11.5 11.5l1.1 1.1M12.6 3.4l-1.1 1.1M4.5 11.5l-1.1 1.1" />
    </svg>
  );
}

/** Theme: dark. */
export function MoonIcon({ className }: IconProps) {
  return (
    <svg {...svgProps(className)}>
      <path d="M13.5 9.6A5.8 5.8 0 0 1 6.4 2.5a5.8 5.8 0 1 0 7.1 7.1z" />
    </svg>
  );
}

/** Window control: minimize. */
export function MinimizeIcon({ className }: IconProps) {
  return (
    <svg {...svgProps(className)}>
      <path d="M3.5 8h9" />
    </svg>
  );
}

/** Window control: maximize. */
export function MaximizeIcon({ className }: IconProps) {
  return (
    <svg {...svgProps(className)}>
      <rect x="3.5" y="3.5" width="9" height="9" rx="1" />
    </svg>
  );
}

/** Window control: restore down from maximized. */
export function RestoreIcon({ className }: IconProps) {
  return (
    <svg {...svgProps(className)}>
      <rect x="3" y="5.5" width="7.5" height="7" rx="1" />
      <path d="M5.5 5.5V4.5a1 1 0 0 1 1-1H12a1 1 0 0 1 1 1V10a1 1 0 0 1-1 1h-1" />
    </svg>
  );
}

/** Window control: close. */
export function CloseIcon({ className }: IconProps) {
  return (
    <svg {...svgProps(className)}>
      <path d="m4 4 8 8M12 4l-8 8" />
    </svg>
  );
}
