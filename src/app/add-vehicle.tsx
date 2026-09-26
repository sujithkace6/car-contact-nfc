import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity } from "react-native";
import NfcManager, { Ndef, NfcTech } from "react-native-nfc-manager";
import { SafeAreaView } from "react-native-safe-area-context";

const BACKEND_URL = "https://car-contact-backend.onrender.com";

async function readNfcTagCode(): Promise<string> {
  await NfcManager.requestTechnology(NfcTech.Ndef);
  try {
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
    const decoded = Ndef.text.decodePayload(new Uint8Array(textRecord.payload));
    const digitsOnly = decoded.replace(/\D/g, "");
    if (digitsOnly.length !== 4) {
      throw new Error(`Expected a 4-digit code on the tag, got "${decoded}" instead.`);
    }
    return digitsOnly;
  } finally {
    await NfcManager.cancelTechnologyRequest().catch(() => {});
  }
}

export default function AddVehicleScreen() {
  const router = useRouter();
  const { ownerPhoneNumber } = useLocalSearchParams<{ ownerPhoneNumber: string }>();

  const [name, setName] = useState("");
  const [vehicleNumber, setVehicleNumber] = useState("");
  const [boxCode, setBoxCode] = useState("");
  const [verifying, setVerifying] = useState(false);

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
      Alert.alert("Missing info", "Please fill in the name, vehicle number, and 4-digit box code.");
      return;
    }

    setVerifying(true);
    try {
      const supported = await NfcManager.isSupported();
      if (!supported) {
        Alert.alert("NFC not supported", "This device doesn't support NFC.");
        setVerifying(false);
        return;
      }

      await NfcManager.start();
      Alert.alert("Ready to scan", "Hold your phone near the NFC tag now.");

      const tagCode = await readNfcTagCode();
      const fullCode = `${boxCode}${tagCode}`;

      const verifyResponse = await fetch(`${BACKEND_URL}/verify-vehicle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vehicleNumber, pairingCode: fullCode }),
      });
      const verifyData = await verifyResponse.json();

      if (!verifyData.verified) {
        Alert.alert("Verification failed", "This code doesn't match this vehicle. Nothing was saved.");
        setVerifying(false);
        return;
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
        Alert.alert("Save failed", "Verification passed but saving failed. Please try again.");
        setVerifying(false);
        return;
      }

      Alert.alert("Success", "Vehicle verified and saved.", [
        { text: "OK", onPress: () => router.back() },
      ]);
    } catch (error: any) {
      Alert.alert("Error", error?.message || "Something went wrong while scanning.");
    } finally {
      setVerifying(false);
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
        />

        <Text style={styles.label}>Vehicle Number</Text>
        <TextInput
          style={styles.input}
          value={vehicleNumber}
          onChangeText={handleVehicleNumberChange}
          placeholder="e.g. MH01BF9379"
          placeholderTextColor="#999"
          autoCapitalize="characters"
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
});