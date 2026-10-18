const paths = {
  plus: <path d="M12 5v14M5 12h14" />,
  back: <path d="M15 5l-7 7 7 7" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  photo: (
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="3" />
      <circle cx="9" cy="10" r="1.6" />
      <path d="M4 17l5-4.5 4 3.5 3-2.5 4 3.5" />
    </>
  ),
  text: <path d="M5 7V5h14v2M12 5v14M9 19h6" />,
  canvas: (
    <>
      <rect x="3.5" y="6" width="17" height="12" rx="2.5" />
      <path d="M9.2 6v12M14.8 6v12" strokeDasharray="2 2.4" />
    </>
  ),
  layers: (
    <>
      <path d="M12 4l8.5 4.5L12 13 3.5 8.5 12 4z" />
      <path d="M3.5 12.5L12 17l8.5-4.5M3.5 16L12 20.5l8.5-4.5" />
    </>
  ),
  forward: (
    <>
      <rect x="9" y="9" width="11" height="11" rx="2.5" fill="currentColor" stroke="none" />
      <path d="M15 5.5H7A2.5 2.5 0 004.500 8v7" />
    </>
  ),
  backward: (
    <>
      <rect x="9" y="9" width="11" height="11" rx="2.5" />
      <rect x="4" y="4" width="11" height="11" rx="2.500" fill="currentColor" stroke="none" opacity=".45" />
    </>
  ),
  copy: (
    <>
      <rect x="8.500" y="8.500" width="11" height="11" rx="2.500" />
      <path d="M15.500 5.500v-.5a2 2 0 00-2-2H6.500a2 2 0 00-2 2v7a2 2 0 002 2H7" />
    </>
  ),
  trash: <path d="M4.500 7h15M9.500 7V4.500h5V7M6.500 7l.8 12h9.400l.8-12M10 10.500v5.500M14 10.500v5.500" />,
  edit: <path d="M4.500 19.500l1-4L16.500 4.500l3 3L8.500 18.500l-4 1zM14 7l3 3" />,
  fitAll: <path d="M9 4.500H4.500V9M15 4.500h4.500V9M9 19.500H4.500V15M15 19.500h4.500V15" />,
  fitFrame: <path d="M4.500 9H9V4.500M19.500 9H15V4.500M4.500 15H9v4.500M19.500 15H15v4.500" />,
  alignLeft: <path d="M4.500 6h15M4.500 10.500h9M4.500 15h15M4.500 19.500h9" />,
  alignCenter: <path d="M4.500 6h15M7.500 10.500h9M4.500 15h15M7.500 19.500h9" />,
  alignRight: <path d="M4.500 6h15M10.500 10.500h9M4.500 15h15M10.500 19.500h9" />,
  up: <path d="M6 14.500l6-6 6 6" />,
  down: <path d="M6 9.500l6 6 6-6" />,
  minus: <path d="M5 12h14" />,
  layout: (
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
      <path d="M10.5 4.5v15M10.5 11.5h10" />
    </>
  ),
  swap: <path d="M7 4.5L3.5 8 7 11.5M3.5 8h13M17 12.5l3.5 3.5-3.5 3.5M20.5 16h-13" />,
  heart: <path d="M12 20s-7.500-4.600-7.500-10.200A4.300 4.300 0 0112 7.300a4.300 4.300 0 017.500 2.500C19.500 15.400 12 20 12 20z" />,
  lock: (
    <>
      <rect x="5.500" y="10.500" width="13" height="9.500" rx="2.500" />
      <path d="M8.500 10.500V8a3.500 3.500 0 017 0v2.500" />
    </>
  ),
  unlock: (
    <>
      <rect x="5.500" y="10.500" width="13" height="9.500" rx="2.500" />
      <path d="M8.500 10.500V8a3.500 3.500 0 016.700-1.400" />
    </>
  ),
  shapes: (
    <>
      <circle cx="8.500" cy="15.500" r="4.500" />
      <path d="M14.500 3.500l5.500 9h-11l5.500-9z" />
    </>
  ),
  undo: <path d="M8.500 6L4.500 10l4 4M4.500 10h9.500a5 5 0 010 10h-3" />,
  redo: <path d="M15.500 6l4 4-4 4M19.500 10H10a5 5 0 000 10h3" />,
  link: <path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.700-5.700l-1 1M14 10a4 4 0 00-5.700 0l-3 3a4 4 0 005.700 5.700l1-1" />,
  bell: <path d="M6 16.5V11a6 6 0 0112 0v5.5l1.5 2h-15zM10 20.5a2 2 0 004 0" />,
  gear: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3.500v2.200M12 18.300v2.200M3.500 12h2.200M18.300 12h2.200M6 6l1.600 1.600M16.400 16.400L18 18M6 18l1.600-1.600M16.400 7.600L18 6" />
    </>
  ),
  share: (
    <>
      <circle cx="6.5" cy="12" r="2.3" />
      <circle cx="17" cy="6" r="2.3" />
      <circle cx="17" cy="18" r="2.3" />
      <path d="M8.5 10.9l6.5-3.8M8.5 13.1l6.5 3.8" />
    </>
  ),
  comment: <path d="M5 6h14a1.500 1.500 0 011.500 1.500v8a1.500 1.500 0 01-1.500 1.500h-7l-4 3v-3H5a1.500 1.500 0 01-1.500-1.500v-8A1.500 1.500 0 015 6z" />,
  sort: <path d="M7 5v14M7 19l-3-3M7 19l3-3M17 19V5M17 5l-3 3M17 5l3 3" />,
  move: <path d="M12 4v16M4 12h16M12 4l-2.500 2.500M12 4l2.500 2.500M12 20l-2.500-2.500M12 20l2.500-2.500M4 12l2.500-2.500M4 12l2.500 2.500M20 12l-2.500-2.500M20 12l-2.500 2.500" />,
  play: <path d="M8 5.5v13l11-6.5-11-6.5z" fill="currentColor" stroke="none" />,
  download: <path d="M12 4v11M7.5 10.5L12 15l4.5-4.5M5 19.5h14" />,
  preview: (
    <>
      <rect x="7" y="4.5" width="10" height="15" rx="2.5" />
      <path d="M3.5 7.5v9M20.5 7.5v9" />
    </>
  ),
}

export default function Icon({ name, size = 24 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  )
}
