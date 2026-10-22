// Hand-drawn 24px stroke icons. Category "glyphs" and UI icons share one set.

const P: Record<string, React.ReactNode> = {
  food: <><path d="M7 3v8a2 2 0 0 0 2 2v8M5 3v5a2 2 0 0 0 2 2M9 3v5a2 2 0 0 1-2 2" /><path d="M17 21V3c-2 1-3.5 3.5-3.5 7 0 2 1 3 3.5 3" /></>,
  cart: <><path d="M3 4h2.5l2.2 10.2a1.5 1.5 0 0 0 1.5 1.2h8.4a1.5 1.5 0 0 0 1.5-1.1L21 8H6.3" /><circle cx="10" cy="19.5" r="1.4" /><circle cx="17" cy="19.5" r="1.4" /></>,
  car: <><path d="M5 16V11l2-5h10l2 5v5" /><path d="M3 16h18v2.5H3zM5 11h14" /><circle cx="7.5" cy="14" r=".6" /><circle cx="16.5" cy="14" r=".6" /></>,
  bag: <><path d="M5 8h14l-1 13H6L5 8Z" /><path d="M9 8V6a3 3 0 0 1 6 0v2" /></>,
  heart: <path d="M12 20s-7-4.4-8.6-8.8C2.3 8 4.3 5 7.4 5c1.9 0 3.3 1 4.6 2.6C13.3 6 14.7 5 16.6 5c3.1 0 5.1 3 4 6.2C19 15.6 12 20 12 20Z" />,
  film: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M7 5v14M17 5v14M3 9.5h4M3 14.5h4M17 9.5h4M17 14.5h4" /></>,
  bolt: <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" />,
  home: <><path d="m3 11 9-7 9 7" /><path d="M5 10v10h14V10M10 20v-6h4v6" /></>,
  book: <><path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2V5Z" /><path d="M4 19a2 2 0 0 1 2-2h13" /></>,
  gift: <><rect x="3" y="8" width="18" height="5" /><path d="M5 13v8h14v-8M12 8v13M12 8S10.5 3.5 8 4.5 9 8 12 8Zm0 0s1.5-4.5 4-3.5S15 8 12 8Z" /></>,
  plane: <path d="M10.5 13.5 3 11l1.5-1.5 8 .8L17 5.8c.8-.8 2.4-1 3-.4s.4 2.2-.4 3l-4.5 4.5.8 8L14.4 22l-2.5-7.5-3.4 3.4.4 2.6L7.4 22l-1.6-3.8L2 16.6l1.5-1.5 2.6.4 4.4-2Z" />,
  paw: <><circle cx="6.5" cy="10" r="1.8" /><circle cx="10" cy="5.8" r="1.8" /><circle cx="14" cy="5.8" r="1.8" /><circle cx="17.5" cy="10" r="1.8" /><path d="M12 11c-3 0-5.5 4.5-5 7 .4 2 2.6 1.5 5 1.5s4.6.5 5-1.5c.5-2.5-2-7-5-7Z" /></>,
  briefcase: <><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M3 12.5h18" /></>,
  coins: <><ellipse cx="9" cy="7" rx="6" ry="3" /><path d="M3 7v5c0 1.7 2.7 3 6 3s6-1.3 6-3V7" /><path d="M9 15v2c0 1.7 2.7 3 6 3s6-1.3 6-3v-5c0-1.6-2.4-2.9-5.5-3" /></>,
  chart: <><path d="M4 20V4M4 20h16" /><path d="m7 15 4-5 3 3 5-7" /></>,
  star: <path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3Z" />,
  piggy: <><path d="M19 11c0-3.3-3.1-6-7-6S5 7.7 5 11c0 1.7.8 3.2 2 4.3V19h3v-2h4v2h3v-3.7c.6-.5 1.1-1.1 1.4-1.8H21v-3h-2.1" /><circle cx="15" cy="10" r=".7" /><path d="M10 5.3V4" /></>,
  phone: <><rect x="6" y="2.5" width="12" height="19" rx="2.5" /><path d="M10.5 18.5h3" /></>,
  shield: <path d="M12 3 4.5 6v5.5c0 4.6 3.2 8.5 7.5 9.5 4.3-1 7.5-4.9 7.5-9.5V6L12 3Z" />,
  dots: <><circle cx="5.5" cy="12" r="1.3" /><circle cx="12" cy="12" r="1.3" /><circle cx="18.5" cy="12" r="1.3" /></>,
  // ui
  plus: <path d="M12 5v14M5 12h14" />,
  x: <path d="M6 6l12 12M18 6 6 18" />,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  list: <path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" />,
  target: <><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="4.5" /><circle cx="12" cy="12" r=".8" /></>,
  wallet: <><path d="M4 7a2 2 0 0 1 2-2h11v3" /><rect x="3" y="8" width="18" height="12" rx="2" /><path d="M16 14h2" /></>,
  calendar: <><rect x="3.5" y="5" width="17" height="15.5" rx="2" /><path d="M3.5 10h17M8 3v4M16 3v4" /></>,
  gear: <><circle cx="12" cy="12" r="3" /><path d="M12 2.5v3M12 18.5v3M4.6 4.6l2.1 2.1M17.3 17.3l2.1 2.1M2.5 12h3M18.5 12h3M4.6 19.4l2.1-2.1M17.3 6.7l2.1-2.1" /></>,
  camera: <><path d="M4 8h3l1.5-2.5h7L17 8h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z" /><circle cx="12" cy="13.5" r="3.6" /></>,
  swap: <path d="M7 4 3.5 7.5 7 11M3.5 7.5h14M17 13l3.5 3.5L17 20M20.5 16.5h-14" />,
  down: <path d="M12 4v16m0 0-6-6m6 6 6-6" />,
  up: <path d="M12 20V4m0 0-6 6m6-6 6 6" />,
  repeat: <><path d="M4 11V9a3 3 0 0 1 3-3h12m0 0-3-3m3 3-3 3" /><path d="M20 13v2a3 3 0 0 1-3 3H5m0 0 3 3m-3-3 3-3" /></>,
  download: <path d="M12 4v11m0 0-4.5-4.5M12 15l4.5-4.5M4 19h16" />,
  trash: <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />,
  edit: <path d="M4 20h4L19 9l-4-4L4 16v4ZM13.5 6.5l4 4" />,
  search: <><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4.5 4.5" /></>,
  logout: <path d="M10 5H5v14h5M15 8l4 4-4 4M19 12H9" />,
  sparkle: <path d="M12 3c.6 4.2 2.8 6.4 7 7-4.2.6-6.4 2.8-7 7-.6-4.2-2.8-6.4-7-7 4.2-.6 6.4-2.8 7-7Z" />,
};

export default function Icon({ name, size = 22, stroke = 2, className }: { name: string; size?: number; stroke?: number; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={stroke}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      {P[name] ?? P.dots}
    </svg>
  );
}

export function Glyph({ name, color, size = 44 }: { name: string; color: string; size?: number }) {
  // pick readable ink on light/dark swatches
  const dark = ['#16213E', '#7A5CFA', '#2E86FF', '#8D6E63', '#14A44D', '#00B8A9', '#FF6159'].includes(color);
  return (
    <span className="glyph" style={{ background: color, color: dark ? '#fff' : '#16213E', width: size, height: size }}>
      <Icon name={name} size={Math.round(size * 0.5)} />
    </span>
  );
}
