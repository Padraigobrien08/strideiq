import path from "node:path";

/** Saved browser states from demo.setup.ts (git-ignored). */
export const STATE = {
  plan: path.join(process.cwd(), "e2e", ".state", "demo-plan.json"),
  noPlan: path.join(process.cwd(), "e2e", ".state", "demo-no-plan.json"),
};

export interface Viewport {
  name: string;
  width: number;
  /** Inner height: the screen minus browser chrome, which is what a page gets. */
  height: number;
  mobile: boolean;
  /** Laptop-class window at least 1280×720, where Today must fit one screen (rule 3). */
  laptop: boolean;
}

const vp = (name: string, width: number, height: number, mobile = false): Viewport => ({
  name,
  width,
  height,
  mobile,
  laptop: width >= 1280 && height >= 720,
});

/** The sizes the contract is checked at (docs: viewport contract, rules 1–6). */
export const VIEWPORTS: Viewport[] = [
  vp("phone-320x568", 320, 568, true), // iPhone SE (1st gen): rule 1 only
  vp("phone-375x667", 375, 667, true), // iPhone SE (2nd/3rd gen)
  vp("phone-390x700", 390, 700, true), // iPhone 14 with Safari bars
  vp("phone-430x800", 430, 800, true), // iPhone Pro Max with Safari bars
  vp("tablet-768x900", 768, 900, true), // iPad portrait
  vp("tablet-1024x650", 1024, 650), // iPad landscape in a browser
  vp("laptop-1280x650", 1280, 650), // small laptop window: first screen only
  vp("laptop-1366x650", 1366, 650),
  vp("laptop-1440x780", 1440, 780), // MacBook Pro 14" in Chrome
  vp("laptop-1470x830", 1470, 830), // MacBook Air 13" in Chrome
  vp("laptop-1536x730", 1536, 730), // 1920×1080 at 125% scaling
  vp("desktop-1920x950", 1920, 950),
];

/** Phones from 375×667 up get the first-screen rules; 320 only gets no-overflow. */
export const hasFirstScreenRules = (v: Viewport) => !(v.mobile && v.width < 375);
