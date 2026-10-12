import { customAlphabet } from "./nanoid.js";
import { isReservedSlug } from "@blink/shared";
import { config } from "./config.js";

const alphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const generate = customAlphabet(alphabet, config.slugLength);

export function randomSlug(): string {
  for (let i = 0; i < 20; i++) {
    const s = generate();
    if (!isReservedSlug(s)) return s;
  }
  return generate() + "x";
}
