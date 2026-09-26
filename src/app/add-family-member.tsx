import { useRouter } from "expo-router";
import { useState } from "react";
import {
    ActivityIndicator,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useToast } from "../lib/toast";

// NOTE ON NFC PAIRING:
// Same scheme as vehicles — each collar/watch gets an 8-digit pairing code:
//   - Box code (first 4 digits): printed on the tag's box, typed in manually below
//   - Tag code (last 4 digits): stored inside the tag's NFC memory only —
//     it is NEVER shown or typed by the user, it's only ever read via a real scan
// The two halves are combined server-side and checked against the code issued
// for this family member/pet.
//
// Real NFC scanning needs a native module (e.g. react-native-nfc-manager),
// which requires a custom development build — it will NOT work inside Expo Go.
// handleScanTag() below is a placeholder until that's set up. Until then,
// tagCode stays null and Save is intentionally blocked.

const RELATIONSHIP_OPTIONS = [
  "Mother",
  "Father",
  "Grandma",
  "Grandpa",
  "Son",
  "Daughter",
  "Spouse",
  "Pet",
];

const BACKEND_URL = "https://car-contact-backend.onrender.com";

export default function AddFamilyMemberScreen() {
  const router = useRouter();
  const { showToast } = useToast();

  const [name, setName] = useState("");
  const [relationship, setRelationship] = useState<string | null>(null);
  const [boxCode, setBoxCode] = useState(""); // first 4 digits, typed manually
  const [tagCode, setTagCode] = useState<string | null>(null); // last 4 digits, scan-only, never shown
  const [scanning, setScanning] = useState(false);
  const [saving, setSaving] = useState(false);

  const isBoxCodeValid = boxCode.length === 4 && /^\d+$/.test(boxCode);
  const isTagPaired = tagCode !== null;
  const canSave =
    name.trim().length > 0 &&
    relationship !== null &&
    isBoxCodeValid &&
    isTagPaired &&
    !saving;

  async function handleScanTag() {
    setScanning(true);

    // Placeholder — replace with a real NFC read once a dev build is set up.
    // Example with react-native-nfc-manager would look roughly like:
    //   await NfcManager.requestTechnology(NfcTech.Ndef);
    //   const tag = await NfcManager.getTag();
    //   const code = parseTagCodeFromNdef(tag); // the hidden last-4 digits
    //   setTagCode(code);
    //   await NfcManager.cancelTechnologyRequest();
    setTimeout(() => {
      setScanning(false);
      showToast(
        "This needs a custom development build (not Expo Go) to actually read the tag. Saving will stay disabled until a real scan sets the tag code.",
        { title: "NFC scanning not set up yet", type: "error" }
      );
    }, 800);
  }

  async function handleSave() {
    if (!canSave || !tagCode) return;
    setSaving(true);

    const pairingCode = `${boxCode}${tagCode}`; // combined 8-digit code, server-side only

    try {
      // TODO: point this at a real backend route once one exists, e.g.
      // POST /family-members  { name, relationship, pairingCode }
      const response = await fetch(`${BACKEND_URL}/family-members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, relationship, pairingCode }),
      });

      if (!response.ok) {
        throw new Error("Server didn't accept this yet.");
      }

      router.back();
    } catch (error) {
      // Backend route doesn't exist yet — flagging clearly rather than
      // pretending this succeeded.
      showToast(
        "The server doesn't have a way to store family members yet — this screen is ready, but we still need to add a /family-members route to the backend.",
        { title: "Couldn't save yet", type: "error" }
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Add Family Member</Text>
        <Text style={styles.subtitle}>
          Add someone (or a pet) and pair their NFC tag
        </Text>

        <Text style={styles.label}>Name</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. Priya"
          placeholderTextColor="#9AA0A6"
          value={name}
          onChangeText={setName}
        />

        <Text style={styles.label}>Relationship</Text>
        <View style={styles.chipGrid}>
          {RELATIONSHIP_OPTIONS.map((option) => {
            const selected = relationship === option;
            return (
              <TouchableOpacity
                key={option}
                style={[styles.chip, selected && styles.chipSelected]}
                onPress={() => setRelationship(option)}
              >
                <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                  {option}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={styles.label}>Box code</Text>
        <Text style={styles.hint}>
          The 4-digit code printed on the collar/watch's box
        </Text>
        <TextInput
          style={styles.input}
          placeholder="0000"
          placeholderTextColor="#9AA0A6"
          keyboardType="number-pad"
          maxLength={4}
          value={boxCode}
          onChangeText={(t) => setBoxCode(t.replace(/\D/g, ""))}
        />

        <Text style={styles.label}>NFC tag</Text>
        <Text style={styles.hint}>
          Tap the button below and hold your phone near the collar/watch
        </Text>
        <TouchableOpacity
          style={[styles.scanButton, isTagPaired && styles.scanButtonPaired]}
          onPress={handleScanTag}
          disabled={scanning}
        >
          {scanning ? (
            <ActivityIndicator color="#111111" />
          ) : (
            <Text
              style={[
                styles.scanButtonText,
                isTagPaired && styles.scanButtonTextPaired,
              ]}
            >
              {isTagPaired ? "Tag paired ✓" : "Scan NFC Tag"}
            </Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.saveButton, !canSave && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={!canSave}
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.saveButtonText}>Save</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 40,
  },
  title: {
    fontSize: 26,
    fontWeight: "700",
    color: "#111111",
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 14,
    color: "#666666",
    marginBottom: 28,
  },
  label: {
    fontSize: 13,
    fontWeight: "600",
    color: "#111111",
    marginBottom: 4,
    marginTop: 16,
  },
  hint: {
    fontSize: 12,
    color: "#999999",
    marginBottom: 8,
  },
  input: {
    borderWidth: 1.5,
    borderColor: "#E0E0E0",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 15,
    color: "#111111",
  },
  chipGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 8,
  },
  chip: {
    borderWidth: 1.5,
    borderColor: "#E0E0E0",
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  chipSelected: {
    backgroundColor: "#111111",
    borderColor: "#111111",
  },
  chipText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#111111",
  },
  chipTextSelected: {
    color: "#FFFFFF",
  },
  scanButton: {
    borderWidth: 1.5,
    borderColor: "#111111",
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
  },
  scanButtonPaired: {
    backgroundColor: "#111111",
  },
  scanButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#111111",
  },
  scanButtonTextPaired: {
    color: "#FFFFFF",
  },
  saveButton: {
    backgroundColor: "#111111",
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 32,
  },
  saveButtonDisabled: {
    backgroundColor: "#CCCCCC",
  },
  saveButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
});