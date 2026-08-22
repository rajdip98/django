/** Inline SVG icons — no icon-font download, works offline, scales crisply. */

type IconProps = { className?: string; title?: string };

function Svg({
  children,
  title,
  className,
  filled = false,
}: IconProps & { children: React.ReactNode; filled?: boolean }): JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill={filled ? 'currentColor' : 'none'}
      stroke={filled ? 'none' : 'currentColor'}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
      focusable="false"
    >
      {title ? <title>{title}</title> : null}
      {children}
    </svg>
  );
}

export const HomeIcon = (props: IconProps): JSX.Element => (
  <Svg {...props}>
    <path d="M3 10.5 12 3l9 7.5" />
    <path d="M5 9.5V21h14V9.5" />
    <path d="M9.5 21v-6h5v6" />
  </Svg>
);

export const HouseholdsIcon = (props: IconProps): JSX.Element => (
  <Svg {...props}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M3 9h18M8 4v16" />
  </Svg>
);

export const MapIcon = (props: IconProps): JSX.Element => (
  <Svg {...props}>
    <path d="m9 4-6 2.5v13L9 17l6 3 6-2.5v-13L15 7Z" />
    <path d="M9 4v13M15 7v13" />
  </Svg>
);

export const ProfileIcon = (props: IconProps): JSX.Element => (
  <Svg {...props}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21a8 8 0 0 1 16 0" />
  </Svg>
);

export const DashboardIcon = (props: IconProps): JSX.Element => (
  <Svg {...props}>
    <rect x="3" y="3" width="7" height="9" rx="1.5" />
    <rect x="14" y="3" width="7" height="5" rx="1.5" />
    <rect x="14" y="11" width="7" height="10" rx="1.5" />
    <rect x="3" y="15" width="7" height="6" rx="1.5" />
  </Svg>
);

export const PlusIcon = (props: IconProps): JSX.Element => (
  <Svg {...props}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
);

export const SyncIcon = (props: IconProps): JSX.Element => (
  <Svg {...props}>
    <path d="M21 12a9 9 0 0 1-15.5 6.2M3 12a9 9 0 0 1 15.5-6.2" />
    <path d="M3 19v-5h5M21 5v5h-5" />
  </Svg>
);

export const MicIcon = (props: IconProps): JSX.Element => (
  <Svg {...props}>
    <rect x="9" y="2.5" width="6" height="11" rx="3" />
    <path d="M5 11a7 7 0 0 0 14 0M12 18v3.5" />
  </Svg>
);

export const CameraIcon = (props: IconProps): JSX.Element => (
  <Svg {...props}>
    <path d="M3 8.5A1.5 1.5 0 0 1 4.5 7h2.2l1.4-2h7.8l1.4 2h2.2A1.5 1.5 0 0 1 21 8.5v10A1.5 1.5 0 0 1 19.5 20h-15A1.5 1.5 0 0 1 3 18.5Z" />
    <circle cx="12" cy="13" r="3.6" />
  </Svg>
);

export const LocationIcon = (props: IconProps): JSX.Element => (
  <Svg {...props}>
    <path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11Z" />
    <circle cx="12" cy="10" r="2.6" />
  </Svg>
);

export const CheckIcon = (props: IconProps): JSX.Element => (
  <Svg {...props}>
    <path d="m4.5 12.5 5 5 10-11" />
  </Svg>
);

export const CloseIcon = (props: IconProps): JSX.Element => (
  <Svg {...props}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Svg>
);

export const ChevronRight = (props: IconProps): JSX.Element => (
  <Svg {...props}>
    <path d="m9 5 7 7-7 7" />
  </Svg>
);

export const ChevronLeft = (props: IconProps): JSX.Element => (
  <Svg {...props}>
    <path d="m15 5-7 7 7 7" />
  </Svg>
);

export const WarningIcon = (props: IconProps): JSX.Element => (
  <Svg {...props}>
    <path d="M12 3.5 22 20H2Z" />
    <path d="M12 10v4.5M12 17.4v.2" />
  </Svg>
);

export const DownloadIcon = (props: IconProps): JSX.Element => (
  <Svg {...props}>
    <path d="M12 3v12M7.5 10.5 12 15l4.5-4.5" />
    <path d="M4 20h16" />
  </Svg>
);

export const UploadIcon = (props: IconProps): JSX.Element => (
  <Svg {...props}>
    <path d="M12 16V4M7.5 8.5 12 4l4.5 4.5" />
    <path d="M4 20h16" />
  </Svg>
);

export const LogoutIcon = (props: IconProps): JSX.Element => (
  <Svg {...props}>
    <path d="M14 4h4.5A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5H14" />
    <path d="M10 8 6 12l4 4M6 12h9" />
  </Svg>
);

export const SearchIcon = (props: IconProps): JSX.Element => (
  <Svg {...props}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m16 16 4.5 4.5" />
  </Svg>
);

export const EditIcon = (props: IconProps): JSX.Element => (
  <Svg {...props}>
    <path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17Z" />
    <path d="m14.5 6.5 3 3" />
  </Svg>
);

export const TrashIcon = (props: IconProps): JSX.Element => (
  <Svg {...props}>
    <path d="M4 7h16M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13" />
  </Svg>
);

export const UsersIcon = (props: IconProps): JSX.Element => (
  <Svg {...props}>
    <circle cx="9" cy="8" r="3.4" />
    <path d="M3 20a6 6 0 0 1 12 0" />
    <path d="M16 5.2a3.4 3.4 0 0 1 0 6.6M17.5 20a6 6 0 0 0-2.2-4.6" />
  </Svg>
);

export const ShieldIcon = (props: IconProps): JSX.Element => (
  <Svg {...props}>
    <path d="M12 3l7.5 3v6c0 5-3.4 8-7.5 9.5C7.9 20 4.5 17 4.5 12V6Z" />
    <path d="m9 12 2.2 2.2L15.5 10" />
  </Svg>
);

export const SparkleIcon = (props: IconProps): JSX.Element => (
  <Svg {...props}>
    <path d="M12 3.5 13.7 9l5.5 1.7-5.5 1.7L12 18l-1.7-5.6L4.8 10.7 10.3 9Z" />
    <path d="M18.5 3.5v3M20 5h-3" />
  </Svg>
);

export const InfoIcon = (props: IconProps): JSX.Element => (
  <Svg {...props}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5.5M12 7.8v.2" />
  </Svg>
);
