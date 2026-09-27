import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Keyboard,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import MapView, { Circle, PROVIDER_GOOGLE, Region } from "react-native-maps";
import { SafeAreaView } from "react-native-safe-area-context";
import { useToast } from "../lib/toast";

const BACKEND_URL = "https://car-contact-backend.onrender.com";
const RADIUS_METERS = 50;
const EVENT_POLL_MS = 10000;

// A parking spot is roughly car-sized on the ground - about 5m across.
const CAR_SIZE_RADIUS_METERS = 2.5;

type ParkingEvent = {
  id: string;
  vehicleId: string;
  latitude: number;
  longitude: number;
  type: "started" | "ended";
  timestamp: number;
};

const DEFAULT_REGION: Region = {
  latitude: 12.9716,
  longitude: 77.5946,
  latitudeDelta: 0.02,
  longitudeDelta: 0.02,
};

function SmokeMarker({ event }: { event: ParkingEvent }) {
  const [phase, setPhase] = useState(0); // 0 -> 1, looping

  useEffect(() => {
    let mounted = true;
    let start = Date.now();
    const CYCLE_MS = 2200;

    function tick() {
      if (!mounted) return;
      const elapsed = (Date.now() - start) % CYCLE_MS;
      setPhase(elapsed / CYCLE_MS);
      requestAnimationFrame(tick);
    }
    const frame = requestAnimationFrame(tick);
    return () => {
      mounted = false;
      cancelAnimationFrame(frame);
    };
  }, []);

  const isAvailable = event.type === "ended";
  const color = isAvailable ? "61, 220, 132" : "255, 107, 107"; // rgb triples

  // Two overlapping "puffs" at different phase offsets so the smoke feels
  // continuous rather than a single pulse restarting abruptly.
  const puffs = [phase, (phase + 0.5) % 1];

  return (
    <>
      {puffs.map((p, i) => {
        const radius = CAR_SIZE_RADIUS_METERS * (0.6 + p * 0.9);
        const opacity = 0.5 * (1 - p);
        return (
          <Circle
            key={i}
            center={{ latitude: event.latitude, longitude: event.longitude }}
            radius={radius}
            strokeWidth={0}
            fillColor={`rgba(${color}, ${opacity})`}
          />
        );
      })}
      <Circle
        center={{ latitude: event.latitude, longitude: event.longitude }}
        radius={CAR_SIZE_RADIUS_METERS * 0.55}
        strokeWidth={1}
        strokeColor={`rgba(${color}, 0.9)`}
        fillColor={`rgba(${color}, 0.35)`}
      />
    </>
  );
}

export default function MapScreen() {
  const router = useRouter();
  const { showToast } = useToast();
  const mapRef = useRef<MapView | null>(null);

  const [searchText, setSearchText] = useState("");
  const [searching, setSearching] = useState(false);
  const [events, setEvents] = useState<ParkingEvent[]>([]);
  const [radiusVisible, setRadiusVisible] = useState(false);
  const [radiusCenter, setRadiusCenter] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locatingRadius, setLocatingRadius] = useState(false);

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === "granted") {
        const position = await Location.getCurrentPositionAsync({});
        mapRef.current?.animateToRegion(
          {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            latitudeDelta: 0.01,
            longitudeDelta: 0.01,
          },
          400
        );
      }
    })();
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function fetchEvents() {
      try {
        const response = await fetch(`${BACKEND_URL}/parking-events`);
        const data = await response.json();
        if (!cancelled && data.success) {
          setEvents(data.events);
        }
      } catch (error) {
        // Silent - the map just won't update this cycle.
      }
    }

    fetchEvents();
    const interval = setInterval(fetchEvents, EVENT_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  async function handleSearch() {
    if (!searchText.trim()) return;
    Keyboard.dismiss();
    setSearching(true);
    try {
      const results = await Location.geocodeAsync(searchText.trim());
      if (results.length === 0) {
        showToast("Couldn't find that place - try a different search.", { title: "No results", type: "error" });
        return;
      }
      const { latitude, longitude } = results[0];
      mapRef.current?.animateToRegion(
        { latitude, longitude, latitudeDelta: 0.01, longitudeDelta: 0.01 },
        400
      );
    } catch (error) {
      showToast("Search failed. Check your internet connection.", { title: "Error", type: "error" });
    } finally {
      setSearching(false);
    }
  }

  async function handleShowRadius() {
    setLocatingRadius(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        showToast("Location permission is required to show your radius.", { title: "Location needed", type: "error" });
        return;
      }
      const position = await Location.getCurrentPositionAsync({});
      const center = { latitude: position.coords.latitude, longitude: position.coords.longitude };
      setRadiusCenter(center);
      setRadiusVisible(true);
      mapRef.current?.animateToRegion(
        { ...center, latitudeDelta: 0.006, longitudeDelta: 0.006 },
        400
      );
    } catch (error) {
      showToast("Couldn't get your location.", { title: "Error", type: "error" });
    } finally {
      setLocatingRadius(false);
    }
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.searchBar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={22} color="#111111" />
        </TouchableOpacity>
        <TextInput
          style={styles.searchInput}
          value={searchText}
          onChangeText={setSearchText}
          placeholder="Search an area..."
          placeholderTextColor="#999"
          onSubmitEditing={handleSearch}
          returnKeyType="search"
        />
        <TouchableOpacity onPress={handleSearch} style={styles.searchButton} disabled={searching}>
          {searching ? <ActivityIndicator size="small" color="#111111" /> : <Ionicons name="search" size={20} color="#111111" />}
        </TouchableOpacity>
      </View>

      <MapView
        ref={mapRef}
        style={styles.map}
        provider={PROVIDER_GOOGLE}
        initialRegion={DEFAULT_REGION}
        showsUserLocation
        showsMyLocationButton={false}
      >
        {radiusVisible && radiusCenter && (
          <Circle
            center={radiusCenter}
            radius={RADIUS_METERS}
            strokeWidth={2}
            strokeColor="rgba(32, 138, 239, 0.8)"
            fillColor="rgba(32, 138, 239, 0.12)"
          />
        )}

        {events.map((event) => (
          <SmokeMarker key={event.id} event={event} />
        ))}
      </MapView>

      <TouchableOpacity style={styles.radiusButton} onPress={handleShowRadius} disabled={locatingRadius}>
        {locatingRadius ? (
          <ActivityIndicator size="small" color="#FFFFFF" />
        ) : (
          <>
            <Ionicons name="locate" size={18} color="#FFFFFF" />
            <Text style={styles.radiusButtonText}>{radiusVisible ? "Update 50m radius" : "Show 50m radius"}</Text>
          </>
        )}
      </TouchableOpacity>

      <View style={styles.legend}>
        <View style={styles.legendRow}>
          <View style={[styles.legendDot, { backgroundColor: "#FF6B6B" }]} />
          <Text style={styles.legendText}>Just occupied</Text>
        </View>
        <View style={styles.legendRow}>
          <View style={[styles.legendDot, { backgroundColor: "#3DDC84" }]} />
          <Text style={styles.legendText}>Might be free now</Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
    backgroundColor: "#FFFFFF",
    zIndex: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#EFEFEF",
  },
  backButton: {
    padding: 6,
  },
  searchInput: {
    flex: 1,
    backgroundColor: "#F2F4F7",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
  },
  searchButton: {
    padding: 6,
  },
  map: {
    flex: 1,
  },
  radiusButton: {
    position: "absolute",
    bottom: 96,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#111111",
    borderRadius: 24,
    paddingVertical: 12,
    paddingHorizontal: 20,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  radiusButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600",
  },
  legend: {
    position: "absolute",
    bottom: 24,
    left: 20,
    gap: 6,
  },
  legendRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendText: {
    fontSize: 12,
    color: "#333333",
    fontWeight: "500",
  },
});
