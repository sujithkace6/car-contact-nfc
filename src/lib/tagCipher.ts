// Simple, dependency-free scrambler so a generic NFC reader app can't make
// sense of what's written on the tag. This does NOT stop someone from
// physically cloning the tag's raw bytes onto another blank tag (only a
// hardware-secured chip like NTAG 424 DNA can truly prevent that) - it just
// means the plain 8-digit code is never sitting on the tag in readable form.

const SECRET_KEY = "CarContactNfcSharedSecret2026";

function xorBytes(input: string, key: string): number[] {
  const bytes: number[] = [];
  for (let i = 0; i < input.length; i++) {
    const inputCode = input.charCodeAt(i);
    const keyCode = key.charCodeAt(i % key.length);
    bytes.push(inputCode ^ keyCode);
  }
  return bytes;
}

function bytesToHex(bytes: number[]): string {
  return bytes.map((b) => b.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(hex: string): number[] {
  const bytes: number[] = [];
  for (let i = 0; i < hex.length; i += 2) {
    bytes.push(parseInt(hex.substring(i, i + 2), 16));
  }
  return bytes;
}

// Turns a plain code (e.g. "12345678") into scrambled hex text to write to the tag.
export function encodeForTag(plainCode: string): string {
  return bytesToHex(xorBytes(plainCode, SECRET_KEY));
}

// Turns the scrambled hex text read off the tag back into the plain code.
export function decodeFromTag(hexText: string): string {
  const bytes = hexToBytes(hexText.trim());
  let result = "";
  for (let i = 0; i < bytes.length; i++) {
    const keyCode = SECRET_KEY.charCodeAt(i % SECRET_KEY.length);
    result += String.fromCharCode(bytes[i] ^ keyCode);
  }
  return result;
}
