import * as React from "react";

type IconProps = React.SVGProps<SVGSVGElement> & {
  size?: number;
  sw?: number;
};

function Stroke({
  d,
  size = 18,
  sw = 1.5,
  fill = "none",
  ...rest
}: IconProps & { d: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill={fill}
      stroke="currentColor"
      strokeWidth={sw}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      <path d={d} />
    </svg>
  );
}

export const Logo = ({ size = 22, ...rest }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" {...rest}>
    <path d="M12 2 L22 12 L12 22 L2 12 Z" fill="currentColor" />
    <path d="M12 7 L17 12 L12 17 L7 12 Z" fill="var(--bg)" />
  </svg>
);

export const Plus = (p: IconProps) => <Stroke {...p} d="M10 4v12 M4 10h12" />;
export const PlusSm = (p: IconProps) => <Stroke size={14} {...p} d="M10 4v12 M4 10h12" />;
export const Search = (p: IconProps) => (
  <Stroke {...p} d="M9 3a6 6 0 1 0 0 12A6 6 0 0 0 9 3 Z M13.5 13.5 L17 17" />
);
export const Folder = (p: IconProps) => (
  <Stroke
    {...p}
    d="M3 5.5C3 4.7 3.7 4 4.5 4h3.2c.4 0 .8.15 1.05.42L9.8 5.3h5.7C16.3 5.3 17 6 17 6.8v7.7c0 .8-.7 1.5-1.5 1.5h-11C3.7 16 3 15.3 3 14.5Z"
  />
);
export const ChevDown = (p: IconProps) => <Stroke {...p} d="M5 7.5 L10 12.5 L15 7.5" />;
export const ChevRight = (p: IconProps) => <Stroke {...p} d="M7.5 5 L12.5 10 L7.5 15" />;
export const Dots = (p: IconProps) => (
  <Stroke sw={2.5} {...p} d="M5 10h.01 M10 10h.01 M15 10h.01" />
);
export const Send = (p: IconProps) => <Stroke {...p} d="M3 10 L17 3 L13 17 L9.5 11.5 Z M9.5 11.5 L17 3" />;
export const Attach = (p: IconProps) => (
  <Stroke
    {...p}
    d="M14 6.5 L7.5 13a2.5 2.5 0 0 0 3.5 3.5l7-7a4 4 0 0 0-5.7-5.7l-7.5 7.5a5.5 5.5 0 0 0 7.8 7.8L17 14"
  />
);
export const Sparkle = (p: IconProps) => (
  <Stroke
    {...p}
    d="M10 2 L11.5 7 L17 8.5 L11.5 10 L10 15 L8.5 10 L3 8.5 L8.5 7 Z M16 14 L16.7 16 L18.5 16.5 L16.7 17 L16 19 L15.3 17 L13.5 16.5 L15.3 16 Z"
  />
);
export const X = (p: IconProps) => <Stroke {...p} d="M5 5 L15 15 M15 5 L5 15" />;
export const XSm = (p: IconProps) => <Stroke size={12} sw={1.8} {...p} d="M5 5 L15 15 M15 5 L5 15" />;
export const Edit = (p: IconProps) => <Stroke {...p} d="M4 16 L4 13 L13 4 L16 7 L7 16 Z M11 6 L14 9" />;
export const Pin = (p: IconProps) => <Stroke {...p} d="M10 2 L13 5 L13 9 L16 12 L4 12 L7 9 L7 5 Z M10 12 L10 18" />;
export const Side = (p: IconProps) => <Stroke {...p} d="M3 4h14v12H3z M8 4v12" />;
export const Sun = (p: IconProps) => (
  <Stroke
    {...p}
    d="M10 5a5 5 0 1 0 0 10 5 5 0 0 0 0-10Z M10 1v2 M10 17v2 M1 10h2 M17 10h2 M3.5 3.5 L5 5 M15 15 L16.5 16.5 M3.5 16.5 L5 15 M15 5 L16.5 3.5"
  />
);
export const Moon = (p: IconProps) => <Stroke {...p} d="M16 12.5A6.5 6.5 0 0 1 7.5 4 a7 7 0 1 0 8.5 8.5Z" />;
export const Briefcase = (p: IconProps) => (
  <Stroke {...p} d="M3 7h14v9H3z M7 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2 M3 11h14" />
);
export const Megaphone = (p: IconProps) => (
  <Stroke {...p} d="M3 8v4 a1 1 0 0 0 1 1 h2 L13 17 V3 L6 7 H4 a1 1 0 0 0-1 1Z M13 7 a3 3 0 0 1 0 6" />
);
export const Users = (p: IconProps) => (
  <Stroke
    {...p}
    d="M7 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z M2 17c.4-2.8 2.6-5 5-5s4.6 2.2 5 5 M14 10a2.5 2.5 0 1 0 0-5 M14 12c2.2.2 4 1.9 4.5 4"
  />
);
export const Calendar = (p: IconProps) => <Stroke {...p} d="M3 5h14v12H3z M3 8h14 M7 3v3 M13 3v3" />;
export const Chat = (p: IconProps) => <Stroke {...p} d="M3 4h14v9H8l-4 4V13H3Z" />;
export const Check = (p: IconProps) => <Stroke {...p} d="M4 10.5 L8 14.5 L16 5.5" />;
export const Copy = (p: IconProps) => <Stroke {...p} d="M7 7h9v9H7z M4 4h9v3 M4 4v9h3" />;
export const ArrowRight = (p: IconProps) => <Stroke {...p} d="M4 10h12 M11 5 L16 10 L11 15" />;
export const Bell = (p: IconProps) => (
  <Stroke {...p} d="M10 3a5 5 0 0 0-5 5v3l-1.5 2h13L15 11V8a5 5 0 0 0-5-5Z M8 16a2 2 0 0 0 4 0" />
);
export const LogOut = (p: IconProps) => (
  <Stroke {...p} d="M8 3H3v14h5 M13 6 L17 10 L13 14 M7 10h10" />
);
export const Star = ({ fill = "none", ...p }: IconProps) => (
  <Stroke fill={fill} {...p} d="M10 2.5 L12.2 7.4 L17.5 8 L13.5 11.6 L14.7 17 L10 14.3 L5.3 17 L6.5 11.6 L2.5 8 L7.8 7.4 Z" />
);
export const Linkedin = (p: IconProps) => (
  <Stroke {...p} d="M3 4.5h2.5v12H3z M4.25 2.5a1.25 1.25 0 1 1 0 2.5 1.25 1.25 0 0 1 0-2.5Z M8 7.5h2.4v1.6c.4-.8 1.4-1.8 3-1.8 2.4 0 3.1 1.5 3.1 3.6v5.6H14V11.3c0-1 -.4-1.7-1.4-1.7-1 0-1.6.7-1.6 1.7v5.2H8.6Z" />
);
export const Doc = (p: IconProps) => (
  <Stroke {...p} d="M5 3h7l3 3v11H5z M12 3v3h3 M7 10h6 M7 13h6" />
);
export const Pencil = (p: IconProps) => (
  <Stroke {...p} d="M3 17l3-1 9-9-2-2-9 9-1 3Z M12 5l3 3" />
);
export const Upload = (p: IconProps) => (
  <Stroke {...p} d="M10 3v10 M5 8 L10 3 L15 8 M4 16h12" />
);