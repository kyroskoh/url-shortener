import { randomBytes } from "node:crypto";

export function customAlphabet(alphabet: string, defaultSize: number) {
  const mask = (2 << (Math.log(alphabet.length - 1) / Math.LN2)) - 1;
  const step = Math.ceil((1.6 * mask * defaultSize) / alphabet.length);

  return (size = defaultSize): string => {
    let id = "";
    while (id.length < size) {
      const bytes = randomBytes(step);
      for (let i = 0; i < bytes.length && id.length < size; i++) {
        const byte = bytes[i] & mask;
        if (alphabet[byte]) id += alphabet[byte];
      }
    }
    return id;
  };
}
