import { range } from "lodash";

export const MaxWounds = 24;
export const WoundRange = range(1, MaxWounds + 1);
export const SaveRange = range(2, 7);

// Theme accent color (orange used elsewhere via CSS filters on white SVGs)
export const ThemeAccentOrange = '#e8541a';