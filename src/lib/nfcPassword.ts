// Password-protects NTAG213/215/216 tags using their built-in PWD_AUTH feature,
// so a generic NFC reader can't even read the tag's memory without the password.
//
// DANGER: writing the wrong configuration to a tag can permanently lock it with
// no way to recover it (not even by this app). ALWAYS test on a spare tag first
// with TESTING_MODE left as-is before ever touching a tag that's already paired
// to a real vehicle. Only flip TESTING_MODE off once you've confirmed the full
// lock -> authenticate -> read cycle works reliably on a spare tag.

import NfcManager, { NfcTech } from "react-native-nfc-manager";

export const TESTING_MODE = true; // keep true until proven safe on a spare tag

const WRITE_CMD = 0xa2;
const PWD_AUTH_CMD = 0x1b;

// The password shared by every tag this app writes. Since this lives in the app
// bundle, treat it the same way as the tag encryption key: it raises the bar
// against casual reading, but isn't a secret against someone who decompiles the app.
const TAG_PASSWORD = "cCnF"; // exactly 4 characters -> 4 bytes

type Variant = { cfg0: number; cfg1: number; pwd: number; pack: number };

const VARIANTS: Record<string, Variant> = {
  NTAG213: { cfg0: 0x29, cfg1: 0x2a, pwd: 0x2b, pack: 0x2c },
  NTAG215: { cfg0: 0x83, cfg1: 0x84, pwd: 0x85, pack: 0x86 },
  NTAG216: { cfg0: 0xe3, cfg1: 0xe4, pwd: 0xe5, pack: 0xe6 },
};

function passwordToBytes(password: string): number[] {
  const padded = password.padEnd(4, "0").slice(0, 4);
  return [padded.charCodeAt(0), padded.charCodeAt(1), padded.charCodeAt(2), padded.charCodeAt(3)];
}

async function detectVariant(): Promise<Variant> {
  const tag = await NfcManager.getTag();
  const capacity = (tag as any)?.ndefStatus?.capacity ?? (tag as any)?.maxSize ?? 0;
  if (capacity > 400) return VARIANTS.NTAG216;
  if (capacity > 130) return VARIANTS.NTAG215;
  return VARIANTS.NTAG213;
}

async function writePage(page: number, bytes: number[]): Promise<void> {
  await NfcManager.transceive([WRITE_CMD, page, ...bytes]);
}

// Call this AFTER writing the (encrypted) NDEF content, as the very last step,
// since setting AUTH0 can restrict reads/writes from that point on.
export async function lockTagWithPassword(): Promise<void> {
  if (TESTING_MODE) {
    return; // no-op until you've verified this on a spare tag
  }

  await NfcManager.requestTechnology(NfcTech.NfcA);
  try {
    const variant = await detectVariant();
    const pwdBytes = passwordToBytes(TAG_PASSWORD);

    await writePage(variant.pwd, pwdBytes);
    await writePage(variant.pack, [0x00, 0x00, 0x00, 0x00]);
    await writePage(variant.cfg0, [0x04, 0x00, 0x00, 0x00]); // protect from page 4 onward
    await writePage(variant.cfg1, [0x80, 0x00, 0x00, 0x00]); // PROT bit: password required to read AND write
  } finally {
    await NfcManager.cancelTechnologyRequest().catch(() => {});
  }
}

// Call this BEFORE reading a tag that may be password-locked. Safe to call even
// on a tag that isn't locked yet (or while TESTING_MODE is on) - it just won't
// be required in that case.
export async function authenticateTag(): Promise<void> {
  if (TESTING_MODE) {
    return;
  }
  try {
    const pwdBytes = passwordToBytes(TAG_PASSWORD);
    await NfcManager.transceive([PWD_AUTH_CMD, ...pwdBytes]);
  } catch {
    // If the tag isn't password-protected, this command may fail harmlessly -
    // the following read will simply proceed unauthenticated.
  }
}
