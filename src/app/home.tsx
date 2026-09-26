import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import NfcManager, { Ndef, NfcTech } from "react-native-nfc-manager";
import { decodeFromTag } from "../lib/tagCipher";
import { authenticateTag } from "../lib/nfcPassword";
import { useToast } from "../lib/toast";
import { useConfirm } from "../lib/confirmModal";
import { SafeAreaView } from "react-native-safe-area-context";

type Mode = "vehicle" | "family";

type Vehicle = {
  id: string;
  name: string;
  vehicleNumber: string;
  parkedAt?: string | null;
  parkedLocation?: { latitude: number; longitude: number } | null;
  notificationsEnabled?: boolean;
};

type FamilyMember = {
  id: string;
  name: string;
  relationship: string;
  phoneNumber: string; // e.g. "+919876543210"
};

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

export default function HomeScreen() {
  const router = useRouter();
  const { showToast } = useToast();
  const { confirm } = useConfirm();
  const { phoneNumber: userPhoneNumber } = useLocalSearchParams<{ phoneNumber: string }>();

  const [mode, setMode] = useState<Mode>("vehicle");

  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);

  const [familyMembers] = useState<FamilyMember[]>([]);
  const [selectedFamilyId, setSelectedFamilyId] = useState<string | null>(null);

  const [expanded, setExpanded] = useState(false);
  const [contacting, setContacting] = useState(false);

  const [parkingPanelOpen, setParkingPanelOpen] = useState(false);
  const [scanningPark, setScanningPark] = useState(false);
  const scanCancelledRef = useRef(false);
  const [togglingNotifications, setTogglingNotifications] = useState(false);

  const hasVehicles = vehicles.length > 0;
  const hasFamilyMembers = familyMembers.length > 0;

  const selectedVehicle = vehicles.find((v) => v.id === selectedVehicleId) ?? null;
  const selectedFamilyMember =
    familyMembers.find((f) => f.id === selectedFamilyId) ?? null;

  // Fetch this user's vehicles from the backend every time Home comes into focus
  // (e.g. right after saving a new vehicle and navigating back).
  const fetchVehicles = useCallback(async (): Promise<{ vehicles: Vehicle[]; selectedId: string | null }> => {
    if (!userPhoneNumber) return { vehicles: [], selectedId: null };
    try {
      const response = await fetch(
        `${BACKEND_URL}/vehicles?phoneNumber=${encodeURIComponent(userPhoneNumber)}`
      );
      const data = await response.json();
      if (data.success) {
        const fetchedVehicles: Vehicle[] = data.vehicles;
        setVehicles(fetchedVehicles);
        let resolvedSelectedId: string | null = null;
        setSelectedVehicleId((current) => {
          if (current && fetchedVehicles.some((v) => v.id === current)) {
            resolvedSelectedId = current;
            return current;
          }
          resolvedSelectedId = fetchedVehicles[0]?.id ?? null;
          return resolvedSelectedId;
        });
        // Park Map should already be open and visible whenever a vehicle exists,
        // with no need to tap the button first.
        setParkingPanelOpen(fetchedVehicles.length > 0);
        return { vehicles: fetchedVehicles, selectedId: resolvedSelectedId };
      }
    } catch (error) {
      console.error("Could not fetch vehicles", error);
    }
    return { vehicles: [], selectedId: null };
  }, [userPhoneNumber]);

  // Every time Home comes into focus (app opened, or navigated back to), refresh
  // the vehicle list AND immediately kick off the Park Map NFC scan for the
  // selected vehicle - no need to tap the Park Map button first.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        const { vehicles: fetched, selectedId } = await fetchVehicles();
        if (cancelled) return;
        const vehicleToScan = fetched.find((v) => v.id === selectedId) ?? fetched[0] ?? null;
        if (vehicleToScan) {
          scanToMarkParking(vehicleToScan);
        }
      })();
      return () => {
        cancelled = true;
        // Home is losing focus (e.g. navigating to Add Vehicle). If a Park Map
        // scan is still waiting for a tag, its NFC session is left open and
        // will block any other screen's NFC request with "You can only issue
        // one request at a time" - so cancel it here.
        if (scanningPark) {
          scanCancelledRef.current = true;
          NfcManager.cancelTechnologyRequest().catch(() => {});
        }
      };
    }, [fetchVehicles])
  );

  function handleSwitchMode(newMode: Mode) {
    setMode(newMode);
    setExpanded(false);
    setParkingPanelOpen(false);
  }

  function handleSelectVehicle(id: string) {
    setSelectedVehicleId(id);
    setExpanded(false);
    setParkingPanelOpen(false);
  }

  function handleSelectFamilyMember(id: string) {
    setSelectedFamilyId(id);
    setExpanded(false);
  }

  function handleAddVehicle() {
    setExpanded(false);
    router.push({ pathname: "/add-vehicle", params: { ownerPhoneNumber: userPhoneNumber } });
  }

  function handleAddFamilyMember() {
    setExpanded(false);
    router.push("/add-family-member");
  }

  function handleParkMap() {
    if (!selectedVehicle) return;
    if (parkingPanelOpen) {
      setParkingPanelOpen(false);
      return;
    }
    setParkingPanelOpen(true);
    scanToMarkParking(selectedVehicle);
  }

  function handleRemotePark() {
    if (!selectedVehicle) return;
    // TODO: hook up to real remote park feature
    showToast(`Remote parking ${selectedVehicle.name}`, { title: "Remote Park", type: "info" });
  }

  // Takes the vehicle explicitly (rather than reading selectedVehicle state)
  // so it can be triggered right after a fetch, before state has settled.
  async function scanToMarkParking(vehicle: Vehicle) {
    if (scanningPark) return;
    scanCancelledRef.current = false;
    setScanningPark(true);
    try {
      const supported = await NfcManager.isSupported();
      if (!supported) {
        showToast("This device doesn't support NFC.", { title: "NFC not supported", type: "error" });
        setScanningPark(false);
        return;
      }

      await NfcManager.start();

      const pairingCode = await readFullNfcCode();

      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        showToast("Location permission is required to mark where you parked.", { title: "Location needed", type: "error" });
        setScanningPark(false);
        return;
      }

      const position = await Location.getCurrentPositionAsync({});
      const { latitude, longitude } = position.coords;

      const response = await fetch(`${BACKEND_URL}/vehicles/${vehicle.id}/park`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pairingCode, latitude, longitude }),
      });
      const data = await response.json();

      if (!data.success) {
        showToast(data.error || "This tag doesn't match this vehicle.", { title: "Verification failed", type: "error" });
        setScanningPark(false);
        return;
      }

      showToast("We've texted you the location, and notifications are now on.", { title: "Parking marked", type: "success" });
      await fetchVehicles();
    } catch (error: any) {
      // Don't show an error toast if we cancelled this scan ourselves (e.g.
      // the user navigated away from Home before a tag was found).
      if (!scanCancelledRef.current) {
        showToast(error?.message || "Something went wrong while scanning.", { title: "Error", type: "error" });
      }
      scanCancelledRef.current = false;
    } finally {
      setScanningPark(false);
    }
  }

  async function handleDeleteVehicle(vehicle: Vehicle) {
    const confirmed = await confirm({
      title: `Delete ${vehicle.name}?`,
      message: "For adding this vehicle again, you'll need the box code and a new tag.",
      confirmLabel: "Delete",
      cancelLabel: "Cancel",
      destructive: true,
    });
    if (!confirmed) return;

    // The backend (Render free tier) can go to sleep and cold-start slowly, so
    // the DELETE request can time out on the client even though it still reaches
    // the server and deletes the vehicle. Rather than trust a network error at
    // face value, re-check the vehicle list afterwards and only report failure
    // if the vehicle is still actually there.
    let deleteSucceeded = false;
    let deleteErrorMessage: string | null = null;
    try {
      const response = await fetch(`${BACKEND_URL}/vehicles/${vehicle.id}`, {
        method: "DELETE",
      });
      const data = await response.json();
      deleteSucceeded = !!data.success;
      if (!deleteSucceeded) {
        deleteErrorMessage = data.error || "Please try again.";
      }
    } catch (error) {
      deleteErrorMessage = "Check your internet connection and try again.";
    }

    const { vehicles: refreshed } = await fetchVehicles();
    const stillExists = refreshed.some((v) => v.id === vehicle.id);

    if (deleteSucceeded || !stillExists) {
      showToast(`${vehicle.name} was deleted.`, { title: "Deleted", type: "success" });
    } else {
      showToast(deleteErrorMessage || "Please try again.", { title: "Couldn't delete", type: "error" });
    }
  }

  async function handleToggleNotifications(value: boolean) {
    if (!selectedVehicle) return;
    setTogglingNotifications(true);
    try {
      const response = await fetch(`${BACKEND_URL}/vehicles/${selectedVehicle.id}/notifications`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: value }),
      });
      const data = await response.json();
      if (data.success) {
        await fetchVehicles();
      } else {
        showToast("Please try again.", { title: "Couldn't update", type: "error" });
      }
    } catch (error) {
      showToast("Check your internet connection and try again.", { title: "Couldn't update", type: "error" });
    } finally {
      setTogglingNotifications(false);
    }
  }

  function handleEndPark() {
    if (!selectedVehicle) return;
    Alert.alert("End parking?", "Are you sure? This will clear the marked location, time, and turn off notifications.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "End Park",
        style: "destructive",
        onPress: async () => {
          try {
            const response = await fetch(`${BACKEND_URL}/vehicles/${selectedVehicle.id}/end-park`, {
              method: "POST",
            });
            const data = await response.json();
            if (data.success) {
              await fetchVehicles();
            } else {
              showToast("Please try again.", { title: "Couldn't end parking", type: "error" });
            }
          } catch (error) {
            showToast("Check your internet connection and try again.", { title: "Couldn't end parking", type: "error" });
          }
        },
      },
    ]);
  }

  // Vehicle mode: opens the Contact Owner screen, which scans the tag itself.
  function handleContactOwner() {
    router.push({ pathname: "/contact-owner", params: { userPhoneNumber } });
  }

  // Family mode: calls + texts the selected family member's phone with
  // the current location (Google Maps link) and the logged-in user's phone.
  async function handleContactRelative() {
    if (!selectedFamilyMember) return;
    setContacting(true);

    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        showToast(
          "Location permission is required to share your position with the relative.",
          { title: "Location needed", type: "error" }
        );
        setContacting(false);
        return;
      }

      const position = await Location.getCurrentPositionAsync({});
      const { latitude, longitude } = position.coords;
      const mapsLink = `https://www.google.com/maps?q=${latitude},${longitude}`;

      const response = await fetch(`${BACKEND_URL}/contact-relative`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          relativePhoneNumber: selectedFamilyMember.phoneNumber,
          userPhoneNumber,
          mapsLink,
        }),
      });
      const data = await response.json();

      if (data.success) {
        showToast(
          `${selectedFamilyMember.name} is being called, and they'll receive your location and phone number by text.`,
          { title: "Relative notified", type: "success" }
        );
      } else {
        showToast(data.message || "Please try again.", { title: "Couldn't reach relative", type: "error" });
      }
    } catch (error) {
      showToast("Check your internet connection and try again.", { title: "Couldn't reach relative", type: "error" });
    } finally {
      setContacting(false);
    }
  }

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      {/* Mode toggle: Car vs Family */}
      <View style={styles.toggleRow}>
        <TouchableOpacity
          style={[styles.toggleButton, mode === "vehicle" && styles.toggleButtonActive]}
          onPress={() => handleSwitchMode("vehicle")}
        >
          <Ionicons
            name="car-sport"
            size={20}
            color={mode === "vehicle" ? "#FFFFFF" : "#111111"}
          />
          <Text
            style={[
              styles.toggleLabel,
              mode === "vehicle" && styles.toggleLabelActive,
            ]}
          >
            Vehicle
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.toggleButton, mode === "family" && styles.toggleButtonActive]}
          onPress={() => handleSwitchMode("family")}
        >
          <Ionicons
            name="people"
            size={20}
            color={mode === "family" ? "#FFFFFF" : "#111111"}
          />
          <Text
            style={[
              styles.toggleLabel,
              mode === "family" && styles.toggleLabelActive,
            ]}
          >
            Family
          </Text>
        </TouchableOpacity>
      </View>

      {/* Vehicle mode */}
      {mode === "vehicle" && (
        <>
          <View style={styles.selectorSection}>
            {hasVehicles ? (
              <>
                <TouchableOpacity
                  style={styles.collapsedCard}
                  onPress={() => setExpanded((e) => !e)}
                  activeOpacity={0.8}
                >
                  <View>
                    <Text style={styles.itemName}>{selectedVehicle?.name}</Text>
                    <Text style={styles.itemSubtext}>
                      {selectedVehicle?.vehicleNumber}
                    </Text>
                  </View>
                  <Text style={styles.chevron}>{expanded ? "▲" : "▼"}</Text>
                </TouchableOpacity>

                {expanded && (
                  <View style={styles.expandedList}>
                    <FlatList
                      data={vehicles}
                      keyExtractor={(item) => item.id}
                      scrollEnabled={false}
                      renderItem={({ item }) => (
                        <TouchableOpacity
                          style={[
                            styles.listRow,
                            item.id === selectedVehicleId && styles.listRowSelected,
                          ]}
                          onPress={() => handleSelectVehicle(item.id)}
                        >
                          <View>
                            <Text style={styles.listRowName}>{item.name}</Text>
                            <Text style={styles.listRowSubtext}>
                              {item.vehicleNumber}
                            </Text>
                          </View>
                          <View style={styles.listRowActions}>
                            {item.id === selectedVehicleId && (
                              <Ionicons name="checkmark-circle" size={18} color="#2E8B57" />
                            )}
                            <TouchableOpacity
                              style={styles.deleteButton}
                              onPress={() => handleDeleteVehicle(item)}
                              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            >
                              <Ionicons name="trash-outline" size={18} color="#C4453A" />
                            </TouchableOpacity>
                          </View>
                        </TouchableOpacity>
                      )}
                    />
                    <TouchableOpacity style={styles.addRow} onPress={handleAddVehicle}>
                      <Text style={styles.addRowText}>+ Add Vehicle</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </>
            ) : (
              <TouchableOpacity style={styles.addRowStandalone} onPress={handleAddVehicle}>
                <Text style={styles.addRowText}>+ Add Vehicle</Text>
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.actionsSection}>
            <TouchableOpacity
              style={[styles.actionButton, !hasVehicles && styles.actionButtonDisabled]}
              onPress={handleParkMap}
              disabled={!hasVehicles}
            >
              <Text
                style={[
                  styles.actionButtonText,
                  !hasVehicles && styles.actionButtonTextDisabled,
                ]}
              >
                Park Map
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionButton, !hasVehicles && styles.actionButtonDisabled]}
              onPress={handleRemotePark}
              disabled={!hasVehicles}
            >
              <Text
                style={[
                  styles.actionButtonText,
                  !hasVehicles && styles.actionButtonTextDisabled,
                ]}
              >
                Remote Park
              </Text>
            </TouchableOpacity>
          </View>

          {parkingPanelOpen && selectedVehicle && (
            <View style={styles.parkingPanel}>
              <View style={styles.rowBetween}>
                <Text style={styles.rowLabel}>Notifications</Text>
                {togglingNotifications ? (
                  <ActivityIndicator />
                ) : (
                  <Switch
                    value={!!selectedVehicle.notificationsEnabled}
                    onValueChange={handleToggleNotifications}
                  />
                )}
              </View>

              <View style={styles.divider} />

              <Text style={styles.rowLabel}>Last marked</Text>
              <Text style={styles.rowValue}>
                {selectedVehicle.parkedAt
                  ? new Date(selectedVehicle.parkedAt).toLocaleString()
                  : "Not marked yet"}
              </Text>

              {scanningPark && (
                <Text style={styles.rowSubvalue}>Hold your phone near the tag...</Text>
              )}

              {selectedVehicle.parkedAt && (
                <TouchableOpacity style={styles.endParkButton} onPress={handleEndPark}>
                  <Text style={styles.endParkButtonText}>End Park</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </>
      )}

      {/* Family mode */}
      {mode === "family" && (
        <View style={styles.selectorSection}>
          {hasFamilyMembers ? (
            <>
              <TouchableOpacity
                style={styles.collapsedCard}
                onPress={() => setExpanded((e) => !e)}
                activeOpacity={0.8}
              >
                <View>
                  <Text style={styles.itemName}>{selectedFamilyMember?.name}</Text>
                  <Text style={styles.itemSubtext}>
                    {selectedFamilyMember?.relationship}
                  </Text>
                </View>
                <Text style={styles.chevron}>{expanded ? "▲" : "▼"}</Text>
              </TouchableOpacity>

              {expanded && (
                <View style={styles.expandedList}>
                  <FlatList
                    data={familyMembers}
                    keyExtractor={(item) => item.id}
                    scrollEnabled={false}
                    renderItem={({ item }) => (
                      <TouchableOpacity
                        style={[
                          styles.listRow,
                          item.id === selectedFamilyId && styles.listRowSelected,
                        ]}
                        onPress={() => handleSelectFamilyMember(item.id)}
                      >
                        <View>
                          <Text style={styles.listRowName}>{item.name}</Text>
                          <Text style={styles.listRowSubtext}>
                            {item.relationship}
                          </Text>
                        </View>
                        {item.id === selectedFamilyId && (
                          <Text style={styles.checkmark}>✓</Text>
                        )}
                      </TouchableOpacity>
                    )}
                  />
                  <TouchableOpacity style={styles.addRow} onPress={handleAddFamilyMember}>
                    <Text style={styles.addRowText}>+ Add Family Member</Text>
                  </TouchableOpacity>
                </View>
              )}
            </>
          ) : (
            <TouchableOpacity
              style={styles.addRowStandalone}
              onPress={handleAddFamilyMember}
            >
              <Text style={styles.addRowText}>+ Add Family Member</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Contact button — label and action depend on mode */}
      <View style={styles.contactSection}>
        <TouchableOpacity
          style={[
            styles.contactButton,
            mode === "family" && !selectedFamilyMember && styles.contactButtonDisabled,
          ]}
          onPress={mode === "vehicle" ? handleContactOwner : handleContactRelative}
          disabled={contacting || (mode === "family" && !selectedFamilyMember)}
        >
          {contacting ? (
            <ActivityIndicator color="#111111" />
          ) : (
            <Text style={styles.contactButtonText}>
              {mode === "vehicle" ? "Contact Owner" : "Contact Relative"}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 20,
  },
  toggleRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 16,
    marginBottom: 24,
  },
  toggleButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1.5,
    borderColor: "#E0E0E0",
    borderRadius: 14,
    paddingVertical: 14,
  },
  toggleButtonActive: {
    borderColor: "#111111",
    backgroundColor: "#111111",
  },
  toggleLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#111111",
  },
  toggleLabelActive: {
    color: "#FFFFFF",
  },
  selectorSection: {
    marginBottom: 28,
  },
  collapsedCard: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: "#E0E0E0",
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 18,
  },
  itemName: {
    fontSize: 17,
    fontWeight: "700",
    color: "#111111",
  },
  itemSubtext: {
    fontSize: 13,
    color: "#777777",
    marginTop: 2,
  },
  chevron: {
    fontSize: 14,
    color: "#999999",
  },
  expandedList: {
    marginTop: 8,
    borderWidth: 1.5,
    borderColor: "#E0E0E0",
    borderRadius: 14,
    overflow: "hidden",
  },
  listRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderBottomWidth: 1,
    borderBottomColor: "#F0F0F0",
  },
  listRowSelected: {
    backgroundColor: "#FAFAFA",
  },
  listRowName: {
    fontSize: 15,
    fontWeight: "600",
    color: "#111111",
  },
  listRowSubtext: {
    fontSize: 12,
    color: "#888888",
    marginTop: 2,
  },
  checkmark: {
    fontSize: 16,
    color: "#111111",
    fontWeight: "700",
  },
  listRowActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  deleteButton: {
    padding: 2,
  },
  addRow: {
    paddingVertical: 14,
    paddingHorizontal: 18,
    alignItems: "center",
  },
  addRowStandalone: {
    paddingVertical: 14,
    paddingHorizontal: 18,
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: "#E0E0E0",
    borderRadius: 14,
    borderStyle: "dashed",
  },
  addRowText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#111111",
  },
  actionsSection: {
    flexDirection: "row",
    gap: 12,
  },
  actionButton: {
    flex: 1,
    backgroundColor: "#111111",
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
  },
  actionButtonDisabled: {
    backgroundColor: "#F0F0F0",
  },
  actionButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "600",
  },
  actionButtonTextDisabled: {
    color: "#BBBBBB",
  },
  parkingPanel: {
    marginTop: 16,
    borderWidth: 1.5,
    borderColor: "#E0E0E0",
    borderRadius: 14,
    padding: 18,
  },
  rowBetween: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  rowLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
  },
  rowValue: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111",
    marginTop: 4,
  },
  rowSubvalue: {
    fontSize: 13,
    color: "#888",
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: "#F0F0F0",
    marginVertical: 16,
  },
  endParkButton: {
    borderWidth: 1.5,
    borderColor: "#D92D20",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 16,
  },
  endParkButtonText: {
    color: "#D92D20",
    fontSize: 15,
    fontWeight: "700",
  },
  contactSection: {
    marginTop: "auto",
    marginBottom: 12,
  },
  contactButton: {
    borderWidth: 1.5,
    borderColor: "#111111",
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
  },
  contactButtonDisabled: {
    borderColor: "#E0E0E0",
  },
  contactButtonText: {
    color: "#111111",
    fontSize: 15,
    fontWeight: "600",
  },
});