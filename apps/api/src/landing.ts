import { readFile } from "node:fs/promises";
import { config } from "./config.js";

export async function readLandingPage(): Promise<string | null> {
  const path = config.landingPage?.trim();
  if (!path) return null;
  try {
    return await readFile(path, "utf8");
  } catch {
    return null;
  }
}

export function hasLandingPageConfigured(): boolean {
  return Boolean(config.landingPage?.trim());
}
