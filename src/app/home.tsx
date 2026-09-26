import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import * as Location from "expo-location";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

type Mode = "vehicle" | "family";

type Vehicle = {
  id: string;
  name: string;
  vehicleNumber: string;
};

type FamilyMember = {
  id: string;
  name: string;
  relationship: string;
  phoneNumber: string; // e.g. "+919876543210"
};

const BACKEND_URL = "https://car-contact-backend.onrender.com";

export default function HomeScreen() {
  const router = useRouter();
  const { phoneNumber: userPhoneNumber } = useLocalSearchParams<{ phoneNumber: string }>();

  const [mode, setMode] = useState<Mode>("vehicle");

  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);

  const [familyMembers] = useState<FamilyMember[]>([]);
  const [selectedFamilyId, setSelectedFamilyId] = useState<string | null>(null);

  const [expanded, setExpanded] = useState(false);
  const [contacting, setContacting] = useState(false);

  const hasVehicles = vehicles.length > 0;
  const hasFamilyMembers = familyMembers.length > 0;

  const selectedVehicle = vehicles.find((v) => v.id === selectedVehicleId) ?? null;
  const selectedFamilyMember =
    familyMembers.find((f) => f.id === selectedFamilyId) ?? null;

  // Fetch this user's vehicles from the backend every time Home comes into focus
  // (e.g. right after saving a new vehicle and navigating back).
  const fetchVehicles = useCallback(async () => {
    if (!userPhoneNumber) return;
    try {
      const response = await fetch(
        `${BACKEND_URL}/vehicles?phoneNumber=${encodeURIComponent(userPhoneNumber)}`
      );
      const data = await response.json();
      if (data.success) {
        setVehicles(data.vehicles);
        setSelectedVehicleId((current) => {
          if (current && data.vehicles.some((v: Vehicle) => v.id === current)) {
            return current;
          }
          return data.vehicles[0]?.id ?? null;
        });
      }
    } catch (error) {
      console.error("Could not fetch vehicles", error);
    }
  }, [userPhoneNumber]);

  useFocusEffect(
    useCallback(() => {
      fetchVehicles();
    }, [fetchVehicles])
  );

  function handleSwitchMode(newMode: Mode) {
    setMode(newMode);
    setExpanded(false);
  }

  function handleSelectVehicle(id: string) {
    setSelectedVehicleId(id);
    setExpanded(false);
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
    // TODO: hook up to real park map feature
    Alert.alert("Park Map", `Showing park map for ${selectedVehicle.name}`);
  }

  function handleRemotePark() {
    if (!selectedVehicle) return;
    // TODO: hook up to real remote park feature
    Alert.alert("Remote Park", `Remote parking ${selectedVehicle.name}`);
  }

  // Vehicle mode: calls the vehicle owner (existing behavior).
  async function handleContactOwner() {
    setContacting(true);
    try {
      const response = await fetch(`${BACKEND_URL}/contact-owner`, {
        method: "POST",
      });
      const data = await response.json();

      if (data.success) {
        Alert.alert("Owner notified", "The owner is being called now.");
      } else {
        Alert.alert("Couldn't reach owner", data.message || "Please try again.");
      }
    } catch (error) {
      Alert.alert("Couldn't reach owner", "Check your internet connection and try again.");
    } finally {
      setContacting(false);
    }
  }

  // Family mode: calls + texts the selected family member's phone with
  // the current location (Google Maps link) and the logged-in user's phone.
  async function handleContactRelative() {
    if (!selectedFamilyMember) return;
    setContacting(true);

    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(
          "Location needed",
          "Location permission is required to share your position with the relative."
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
        Alert.alert(
          "Relative notified",
          `${selectedFamilyMember.name} is being called, and they'll receive your location and phone number by text.`
        );
      } else {
        Alert.alert("Couldn't reach relative", data.message || "Please try again.");
      }
    } catch (error) {
      Alert.alert("Couldn't reach relative", "Check your internet connection and try again.");
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
                          {item.id === selectedVehicleId && (
                            <Text style={styles.checkmark}>✓</Text>
                          )}
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