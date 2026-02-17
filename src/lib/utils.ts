import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDisplayPath(path: string): string {
  if (!path || path.startsWith("~")) {
    return path;
  }

  const unixHome = path.match(/^\/(?:Users|home)\/[^/]+/);
  if (unixHome) {
    return `~${path.slice(unixHome[0].length) || "/"}`;
  }

  const windowsHome = path.match(/^[A-Za-z]:\\Users\\[^\\]+/);
  if (windowsHome) {
    return `~${path.slice(windowsHome[0].length).split("\\").join("/") || "/"}`;
  }

  return path;
}
