import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Une clases y deja ganar a la última cuando dos chocan. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
