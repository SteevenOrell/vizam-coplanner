import Svg, { Circle, Path } from 'react-native-svg';

import { decorativeProps } from './platform';

/**
 * 24 px stroke icons drawn for CoPlanner (no icon font, no third-party marks). Decorative by default: give the
 * pressable around it an accessibility label. Category icons use the same set (names stored in the database).
 */
const PATHS = {
  home: ['M4 11l8-6.5 8 6.5', 'M6 9.5V19h12V9.5', 'M10 19v-5h4v5'],
  activity: ['M5 7h14', 'M5 12h14', 'M5 17h9'],
  plus: ['M12 5v14', 'M5 12h14'],
  minus: ['M5 12h14'],
  budget: ['M12 4a8 8 0 1 0 8 8h-8z', 'M14.5 3.5a7 7 0 0 1 6 6h-6z'],
  goal: ['M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18z', 'M12 16.5a4.5 4.5 0 1 1 0-9 4.5 4.5 0 0 1 0 9z', 'M12 12h.01'],
  bell: ['M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15z', 'M10 20.5a2 2 0 0 0 4 0'],
  settings: [
    'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
    'M19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.3.9a7 7 0 0 0-2.1-1.2L14 3h-4l-.5 2.6a7 7 0 0 0-2.1 1.2l-2.3-.9-2 3.4 2 1.5a7 7 0 0 0 0 2.4l-2 1.5 2 3.4 2.3-.9a7 7 0 0 0 2.1 1.2L10 21h4l.5-2.6a7 7 0 0 0 2.1-1.2l2.3.9 2-3.4-2-1.5c.07-.4.1-.8.1-1.2z',
  ],
  chevronLeft: ['M15 5l-7 7 7 7'],
  chevronRight: ['M9 5l7 7-7 7'],
  chevronDown: ['M5 9l7 7 7-7'],
  chevronUp: ['M5 15l7-7 7 7'],
  search: ['M11 18a7 7 0 1 1 0-14 7 7 0 0 1 0 14z', 'M16 16l4.5 4.5'],
  filter: ['M4 6h16', 'M7 12h10', 'M10 18h4'],
  close: ['M6 6l12 12', 'M18 6L6 18'],
  check: ['M5 12.5l4.5 4.5L19 7.5'],
  calendar: ['M5 6h14v14H5z', 'M5 10h14', 'M9 3.5V7', 'M15 3.5V7'],
  chart: ['M5 19V10', 'M10 19V5', 'M15 19v-7', 'M20 19v-4', 'M3 19h18'],
  trend: ['M4 16l5-5 4 3 7-7', 'M15 7h5v5'],
  repeat: ['M17 3l3 3-3 3', 'M4 11V9a3 3 0 0 1 3-3h13', 'M7 21l-3-3 3-3', 'M20 13v2a3 3 0 0 1-3 3H4'],
  wallet: ['M4 7h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z', 'M4 7l11-3v3', 'M16 13.5h.01'],
  arrowUp: ['M12 19V5', 'M6 11l6-6 6 6'],
  arrowDown: ['M12 5v14', 'M6 13l6 6 6-6'],
  arrowRight: ['M5 12h14', 'M13 6l6 6-6 6'],
  edit: ['M4 20h4L19 9l-4-4L4 16z', 'M13.5 6.5l4 4'],
  trash: ['M5 7h14', 'M9 7V4.5h6V7', 'M7 7l1 13h8l1-13', 'M10.5 11v5.5', 'M13.5 11v5.5'],
  eye: ['M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z', 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z'],
  eyeOff: [
    'M4 4l16 16',
    'M10 6a9 9 0 0 1 2-.5c6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-3 3.7',
    'M6.4 7.6A16 16 0 0 0 2.5 12S6 18.5 12 18.5a9 9 0 0 0 4.3-1.1',
    'M9.9 9.9a3 3 0 0 0 4.2 4.2',
  ],
  share: ['M12 15V4', 'M8 8l4-4 4 4', 'M5 12v7h14v-7'],
  download: ['M12 4v11', 'M8 11l4 4 4-4', 'M5 19h14'],
  briefcase: ['M4 8h16v11H4z', 'M9 8V5h6v3', 'M4 13h16'],
  laptop: ['M6 6h12v9H6z', 'M3 18h18'],
  'plus-circle': ['M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18z', 'M12 8v8', 'M8 12h8'],
  cart: ['M3 4h2l2.4 11h10.2L20 8H6.2', 'M9 20h.01', 'M17 20h.01'],
  bus: [
    'M6 4h12a1 1 0 0 1 1 1v12H5V5a1 1 0 0 1 1-1z',
    'M5 11h14',
    'M8 17v2.5',
    'M16 17v2.5',
    'M8 14h.01',
    'M16 14h.01',
  ],
  utensils: ['M7 3v8', 'M5 3v5a2 2 0 0 0 4 0V3', 'M7 11v10', 'M16 21V3c-2 1.5-3 4-3 7h3'],
  bolt: ['M13 3L5 13.5h6L10 21l8-10.5h-6z'],
  heart: ['M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.4 4.3 4.3 0 0 1 19.5 10C19.5 15.4 12 20 12 20z'],
  users: [
    'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z',
    'M3 20a6 6 0 0 1 12 0',
    'M16 4.3a3.5 3.5 0 0 1 0 6.4',
    'M18 14.5a6 6 0 0 1 3 5.5',
  ],
  tag: ['M3.5 12.5l8-8H20v8.5l-8 8z', 'M15.5 8.5h.01'],
  shield: ['M12 3l7 3v5c0 5-3.5 8.5-7 10-3.5-1.5-7-5-7-10V6z', 'M9 12l2 2 4-4'],
  plane: ['M3 13.5l7-1.5 3.5-7.5 2 .5-1.5 7 6 2-.5 2-6.5-.5-2 4.5-2-.5.5-4-6.5-1z'],
  piggy: [
    'M19 11.5c0-3.6-3.4-6-7.5-6S4 7.9 4 11.5c0 2 1 3.6 2.6 4.6V19h3v-1.8h4V19h3v-2.9c1-.6 1.8-1.4 2.2-2.4H21v-3.2h-2.1',
    'M15.5 10h.01',
    'M9 6.5L7.5 4',
  ],
  info: ['M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18z', 'M12 11v5', 'M12 8h.01'],
  alert: ['M12 4l9 16H3z', 'M12 10v4', 'M12 17h.01'],
  cloud: ['M7 18h10a4 4 0 0 0 .5-8A6 6 0 0 0 6 9.5 4.3 4.3 0 0 0 7 18z'],
  cloudOff: ['M4 4l16 16', 'M9 6.2A6 6 0 0 1 17.5 10a4 4 0 0 1 2 6.5', 'M7 18h9.5', 'M6 9.5A4.3 4.3 0 0 0 7 18'],
  user: ['M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z', 'M4.5 20a7.5 7.5 0 0 1 15 0'],
  globe: [
    'M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18z',
    'M3 12h18',
    'M12 3c2.5 2.7 3.5 5.7 3.5 9s-1 6.3-3.5 9c-2.5-2.7-3.5-5.7-3.5-9s1-6.3 3.5-9z',
  ],
  moon: ['M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z'],
  sun: [
    'M12 16.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9z',
    'M12 2.5v2',
    'M12 19.5v2',
    'M2.5 12h2',
    'M19.5 12h2',
    'M5.3 5.3l1.4 1.4',
    'M17.3 17.3l1.4 1.4',
    'M5.3 18.7l1.4-1.4',
    'M17.3 6.7l1.4-1.4',
  ],
  logout: ['M10 5H5v14h5', 'M15 8l4 4-4 4', 'M19 12H9'],
  more: ['M6 12h.01', 'M12 12h.01', 'M18 12h.01'],
  clock: ['M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18z', 'M12 7.5V12l3 2'],
  exchange: ['M7 4L4 7l3 3', 'M4 7h13', 'M17 20l3-3-3-3', 'M20 17H7'],
  note: ['M6 4h9l3 3v13H6z', 'M9 10h6', 'M9 14h6', 'M9 18h3'],
  sparkle: [
    'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z',
    'M18.5 16l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z',
  ],
  lock: ['M6 11h12v9H6z', 'M8.5 11V8a3.5 3.5 0 0 1 7 0v3'],
  mail: ['M4 6h16v12H4z', 'M4 7l8 6 8-6'],
} as const;

export type IconName = keyof typeof PATHS | 'dot';

export const ICON_NAMES = Object.keys(PATHS) as IconName[];

/** Icons offered when the user picks one for a category or goal. */
export const PICKABLE_ICONS: readonly IconName[] = [
  'tag',
  'home',
  'cart',
  'utensils',
  'bus',
  'bolt',
  'heart',
  'users',
  'repeat',
  'briefcase',
  'laptop',
  'plus-circle',
  'shield',
  'plane',
  'piggy',
  'wallet',
  'sparkle',
  'globe',
];

export function isIconName(name: string): name is IconName {
  return name === 'dot' || Object.prototype.hasOwnProperty.call(PATHS, name);
}

export function Icon({
  name,
  size = 24,
  color,
  strokeWidth = 1.8,
}: {
  name: IconName | string;
  size?: number;
  color: string;
  strokeWidth?: number;
}) {
  const stroke = { stroke: color, strokeWidth, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  const key = isIconName(name) ? name : 'tag';
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" {...decorativeProps}>
      {key === 'dot' ? (
        <Circle cx={12} cy={12} r={4} fill={color} />
      ) : (
        PATHS[key].map((d, i) => <Path key={i} d={d} {...stroke} />)
      )}
    </Svg>
  );
}
