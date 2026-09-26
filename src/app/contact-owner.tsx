import * as Location from "expo-location";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
    ActivityIndicator,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import NfcManager, { Ndef, NfcTech } from "react-native-nfc-manager";
import { decodeFromTag } from "../lib/tagCipher";
import { authenticateTag } from "../lib/nfcPassword";
import { useToast } from "../lib/toast";
import { SafeAreaView } from "react-native-safe-area-context";

const BACKEND_URL = "https://car-contact-backend.onrender.com";

async function readFullNfcCode(): Promise<string> {
  await authenticateTag();
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
    const rawText = Ndef.text.decodePayload(new Uint8Array(textRecord.payload));
    const decoded = decodeFromTag(rawText.trim());
    const digitsOnly = decoded.replace(/\D/g, "");
    if (digitsOnly.length !== 8) {
      throw new Error("This tag's code could not be read. Make sure it was written by this app.");
    }
    return digitsOnly;
  } finally {
    await NfcManager.cancelTechnologyRequest().catch(() => {});
  }
}

export default function ContactOwnerScreen() {
  const router = useRouter();
  const { showToast } = useToast();
  const { userPhoneNumber } = useLocalSearchParams<{ userPhoneNumber: string }>();

  const [scanning, setScanning] = useState(true);
  const [actionLoading, setActionLoading] = useState<"call" | "emergency" | null>(null);

  const [vehicleId, setVehicleId] = useState<string | null>(null);
  const [vehicleName, setVehicleName] = useState<string | null>(null);
  const [withinRange, setWithinRange] = useState(true);
  const [callAvailable, setCallAvailable] = useState(true);
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);

  useEffect(() => {
    scanAndIdentify();
  }, []);

  async function scanAndIdentify() {
    setScanning(true);
    try {
      const supported = await NfcManager.isSupported();
      if (!supported) {
        showToast("This device doesn't support NFC.", { title: "NFC not supported", type: "error" });
        setScanning(false);
        router.back();
        return;
      }

      await NfcManager.start();

      const pairingCode = await readFullNfcCode();

      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        showToast("Location permission is required to contact the owner.", { title: "Location needed", type: "error" });
        setScanning(false);
        router.back();
        return;
      }

      const position = await Location.getCurrentPositionAsync({});
      const { latitude, longitude } = position.coords;
      setCoords({ latitude, longitude });

      const response = await fetch(`${BACKEND_URL}/identify-vehicle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pairingCode, latitude, longitude }),
      });
      const data = await response.json();

      if (!data.success) {
        showToast(data.error || "This tag isn't registered to any vehicle.", { title: "Not found", type: "error" });
        router.back();
        return;
      }

      setVehicleId(data.vehicleId);
      setVehicleName(data.vehicleName);
      setWithinRange(data.withinRange);
      setCallAvailable(data.callAvailable);
    } catch (error: any) {
      showToast(error?.message || "Something went wrong while scanning.", { title: "Error", type: "error" });
      router.back();
    } finally {
      setScanning(false);
    }
  }

  async function handleAction(action: "call" | "emergency") {
    if (!vehicleId || !coords) return;
    setActionLoading(action);
    try {
      const response = await fetch(`${BACKEND_URL}/vehicles/${vehicleId}/contact`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          userPhoneNumber,
          latitude: coords.latitude,
          longitude: coords.longitude,
        }),
      });
      const data = await response.json();

      if (data.success) {
        showToast(data.message || "Sent.", { title: "Done", type: "success" });
        setTimeout(() => router.back(), 900);
      } else {
        showToast(data.message || data.error || "Please try again.", { title: "Couldn't complete this", type: "error" });
      }
    } catch (error) {
      showToast("Check your internet connection and try again.", { title: "Error", type: "error" });
    } finally {
      setActionLoading(null);
    }
  }

  if (scanning) {
    return (
      <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" />
          <Text style={styles.scanningText}>Hold your phone near the tag...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <TouchableOpacity onPress={() => router.back()} style={styles.backRow}>
        <Text style={styles.backText}>← Back</Text>
      </TouchableOpacity>

      <Text style={styles.title}>{vehicleName}</Text>

      {!withinRange && (
        <View style={styles.warningBox}>
          <Text style={styles.warningText}>
            You're more than 10 meters from where this vehicle was parked.
          </Text>
          <Text style={styles.warningSubtext}>
            {callAvailable
              ? "You can place one call; further calls will be locked for 24 hours."
              : "You've already used today's call for this vehicle from this distance. Try again later."}
          </Text>
          <Text style={styles.warningSubtext}>
            Emergency alerts require being within 10 meters.
          </Text>
        </View>
      )}

      <TouchableOpacity
        style={[
          styles.callButton,
          (!withinRange && !callAvailable) || actionLoading === "call"
            ? styles.buttonDisabled
            : null,
        ]}
        onPress={() => handleAction("call")}
        disabled={(!withinRange && !callAvailable) || actionLoading !== null}
      >
        <Text style={styles.callButtonText}>
          {actionLoading === "call" ? "Calling..." : "Call Owner — Ask Driver to Come"}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[
          styles.emergencyButton,
          !withinRange || actionLoading === "emergency" ? styles.buttonDisabled : null,
        ]}
        onPress={() => handleAction("emergency")}
        disabled={!withinRange || actionLoading !== null}
      >
        <Text style={styles.emergencyButtonText}>
          {actionLoading === "emergency" ? "Sending..." : "It's an Emergency"}
        </Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff", paddingHorizontal: 20 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  scanningText: { marginTop: 16, fontSize: 15, color: "#666" },
  backRow: { marginTop: 8, marginBottom: 8 },
  backText: { fontSize: 16, color: "#208AEF", fontWeight: "600" },
  title: { fontSize: 24, fontWeight: "700", marginTop: 8, marginBottom: 24 },
  warningBox: {
    borderWidth: 1.5,
    borderColor: "#F5A623",
    backgroundColor: "#FFF8EC",
    borderRadius: 14,
    padding: 16,
    marginBottom: 24,
  },
  warningText: { fontSize: 15, fontWeight: "700", color: "#8A5300" },
  warningSubtext: { fontSize: 13, color: "#8A5300", marginTop: 6 },
  callButton: {
    backgroundColor: "#111111",
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
    marginBottom: 12,
  },
  callButtonText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  emergencyButton: {
    backgroundColor: "#D92D20",
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
  },
  emergencyButtonText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  buttonDisabled: { opacity: 0.4 },
});