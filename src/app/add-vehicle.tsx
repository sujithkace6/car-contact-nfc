import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import NfcManager, { Ndef, NfcTech } from "react-native-nfc-manager";
import { encodeForTag } from "../lib/tagCipher";
import { lockTagWithPassword } from "../lib/nfcPassword";
import { useToast } from "../lib/toast";
import { SafeAreaView } from "react-native-safe-area-context";

const BACKEND_URL = "https://car-contact-backend.onrender.com";
const HOLD_DURATION_MS = 3000;
const SKIP_LOCK_FOR_TESTING = true; // set to false before using real, final tags

// Reads the tag's current text record. Assumes an NFC technology session is
// already open (the caller manages requestTechnology/cancelTechnologyRequest),
// so this can be called mid-session alongside a later write.
async function readTagTextRecord(): Promise<string> {
  const tag = await NfcManager.getTag();
  const ndefRecords = tag?.ndefMessage;
  if (!ndefRecords || ndefRecords.length === 0) {
    throw new Error("This tag doesn't have any data written to it.");
  }
  const textRecord = ndefRecords.find((record) => {
    try {
      return Ndef.isType(record, Ndef.TNF_WELL_KNOWN, Ndef.RTD_TEXT);
    } catch {
      return false;
    }
  });
  if (!textRecord) {
    throw new Error("No text record found on this tag.");
  }
  return Ndef.text.decodePayload(new Uint8Array(textRecord.payload));
}

export default function AddVehicleScreen() {
  const router = useRouter();
  const { showToast } = useToast();
  const { ownerPhoneNumber } = useLocalSearchParams<{ ownerPhoneNumber: string }>();

  const [name, setName] = useState("");
  const [vehicleNumber, setVehicleNumber] = useState("");
  const [boxCode, setBoxCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);

  function handleVehicleNumberChange(text: string) {
    const cleaned = text.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
    setVehicleNumber(cleaned);
  }

  function handleBoxCodeChange(text: string) {
    const digitsOnly = text.replace(/\D/g, "").slice(0, 4);
    setBoxCode(digitsOnly);
  }

  const canSave = name.trim().length > 0 && vehicleNumber.length > 0 && boxCode.length === 4;

  async function handleVerifyAndSave() {
    if (!canSave) {
      showToast("Please fill in the name, vehicle number, and 4-digit box code.", { title: "Missing info", type: "error" });
      return;
    }

    setVerifying(true);
    setCountdown(3);
    const countdownTimer = setInterval(() => {
      setCountdown((c) => (c && c > 1 ? c - 1 : 0));
    }, 1000);

    try {
      const supported = await NfcManager.isSupported();
      if (!supported) {
        showToast("This device doesn't support NFC.", { title: "NFC not supported", type: "error" });
        return;
      }

      await NfcManager.start();
      await NfcManager.requestTechnology(NfcTech.Ndef);

      try {
        // Everything below runs in ONE continuous tag session - hold the
        // phone steady on the tag until it's done (read, verify, save, write).
        const doWork = (async () => {
          const decoded = await readTagTextRecord();
          const tagCode = decoded.replace(/\D/g, "");
          if (tagCode.length !== 4) {
            throw new Error(`Expected a 4-digit code on the tag, got "${decoded}" instead.`);
          }
          const fullCode = `${boxCode}${tagCode}`;

          const verifyResponse = await fetch(`${BACKEND_URL}/verify-vehicle`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ vehicleNumber, pairingCode: fullCode }),
          });
          const verifyData = await verifyResponse.json();
          if (!verifyData.verified) {
            const err: any = new Error("Incorrect code.");
            err.isVerificationError = true;
            throw err;
          }

          const saveResponse = await fetch(`${BACKEND_URL}/vehicles`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name,
              vehicleNumber,
              pairingCode: fullCode,
              ownerPhoneNumber,
            }),
          });
          const saveData = await saveResponse.json();
          if (!saveData.success) {
            throw new Error(saveData.error || "Verification passed but saving failed. Please try again.");
          }

          const scrambled = encodeForTag(fullCode);
          const bytes = Ndef.encodeMessage([Ndef.textRecord(scrambled)]);
          await NfcManager.ndefHandler.writeNdefMessage(bytes);
          if (!SKIP_LOCK_FOR_TESTING) {
            await NfcManager.ndefHandler.makeReadOnly();
          }
          await lockTagWithPassword();
        })();

        const holdForFullDuration = new Promise((resolve) => setTimeout(resolve, HOLD_DURATION_MS));
        await Promise.all([doWork, holdForFullDuration]);

        showToast("Vehicle verified, saved, and the tag is now updated.", { title: "Success", type: "success" });
        setTimeout(() => router.back(), 900);
      } finally {
        await NfcManager.cancelTechnologyRequest().catch(() => {});
      }
    } catch (error: any) {
      const title = error?.isVerificationError ? "Verification failed" : "Error";
      showToast(
        error?.message || "The tag moved away too soon - hold it steady and try again.",
        { title, type: "error" }
      );
    } finally {
      clearInterval(countdownTimer);
      setVerifying(false);
      setCountdown(null);
    }
  }

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Add Vehicle</Text>

        <Text style={styles.label}>Vehicle Name</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder="e.g. My Sedan"
          placeholderTextColor="#999"
          editable={!verifying}
        />

        <Text style={styles.label}>Vehicle Number</Text>
        <TextInput
          style={styles.input}
          value={vehicleNumber}
          onChangeText={handleVehicleNumberChange}
          placeholder="e.g. MH01BF9379"
          placeholderTextColor="#999"
          autoCapitalize="characters"
          editable={!verifying}
        />

        <Text style={styles.label}>Box Code (4 digits)</Text>
        <TextInput
          style={styles.input}
          value={boxCode}
          onChangeText={handleBoxCodeChange}
          placeholder="e.g. 1234"
          placeholderTextColor="#999"
          keyboardType="number-pad"
          maxLength={4}
          editable={!verifying}
        />

        <TouchableOpacity
          style={[styles.verifyButton, (!canSave || verifying) && styles.verifyButtonDisabled]}
          onPress={handleVerifyAndSave}
          disabled={!canSave || verifying}
        >
          <Text style={styles.verifyButtonText}>
            {verifying ? "Verifying..." : "Verify Contact Card"}
          </Text>
        </TouchableOpacity>

        {verifying && countdown !== null && (
          <View style={styles.countdownWrapper}>
            <View style={styles.countdownCircle}>
              <Text style={styles.countdownNumber}>{countdown}</Text>
            </View>
            <Text style={styles.countdownLabel}>Hold your phone steady on the tag</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  content: { padding: 20 },
  title: { fontSize: 24, fontWeight: "700", marginBottom: 20 },
  label: { fontSize: 14, fontWeight: "600", marginTop: 16, marginBottom: 6, color: "#333" },
  input: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  verifyButton: {
    backgroundColor: "#208AEF",
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 32,
  },
  verifyButtonDisabled: {
    backgroundColor: "#a9c9e8",
  },
  verifyButtonText: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "700",
  },
  countdownWrapper: {
    marginTop: 28,
    alignItems: "center",
  },
  countdownCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 2,
    borderColor: "#208AEF",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  countdownNumber: {
    fontSize: 26,
    fontWeight: "700",
    color: "#208AEF",
  },
  countdownLabel: {
    fontSize: 14,
    color: "#666",
  },
});
