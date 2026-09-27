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
import MapView, { Circle, Heatmap, PROVIDER_GOOGLE, Region } from "react-native-maps";
import { SafeAreaView } from "react-native-safe-area-context";
import { useToast } from "../lib/toast";

const BACKEND_URL = "https://car-contact-backend.onrender.com";
const RADIUS_METERS = 50;
const EVENT_POLL_MS = 10000;

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

// Free, no-API-key forward geocoding (OpenStreetMap Nominatim), since the
// device's native Geocoder can be unreliable/absent depending on the phone.
async function geocodeArea(query: string): Promise<{ latitude: number; longitude: number } | null> {
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`;
  const response = await fetch(url, {
    headers: { "User-Agent": "car-contact-nfc/1.0" },
  });
  if (!response.ok) {
    throw new Error(`Search request failed (${response.status}).`);
  }
  const results = await response.json();
  if (!Array.isArray(results) || results.length === 0) {
    return null;
  }
  return { latitude: parseFloat(results[0].lat), longitude: parseFloat(results[0].lon) };
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
  const [locatingMe, setLocatingMe] = useState(false);

  // Gentle "breathing" pulse driving the heatmap radius, so the smoke feels
  // alive rather than a static blob.
  const [pulse, setPulse] = useState(0);

  useEffect(() => {
    let mounted = true;
    let start = Date.now();
    const CYCLE_MS = 3200;

    function tick() {
      if (!mounted) return;
      const elapsed = (Date.now() - start) % CYCLE_MS;
      setPulse(elapsed / CYCLE_MS);
      requestAnimationFrame(tick);
    }
    const frame = requestAnimationFrame(tick);
    return () => {
      mounted = false;
      cancelAnimationFrame(frame);
    };
  }, []);

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
      const result = await geocodeArea(searchText.trim());
      if (!result) {
        showToast("Couldn't find that place - try a different search.", { title: "No results", type: "error" });
        return;
      }
      mapRef.current?.animateToRegion(
        { ...result, latitudeDelta: 0.01, longitudeDelta: 0.01 },
        400
      );
    } catch (error) {
      showToast("Search failed. Check your internet connection.", { title: "Error", type: "error" });
    } finally {
      setSearching(false);
    }
  }

  async function handleGoToCurrentLocation() {
    setLocatingMe(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        showToast("Location permission is required to find you.", { title: "Location needed", type: "error" });
        return;
      }
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
    } catch (error) {
      showToast("Couldn't get your location.", { title: "Error", type: "error" });
    } finally {
      setLocatingMe(false);
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

  const redPoints = events
    .filter((e) => e.type === "started")
    .map((e) => ({ latitude: e.latitude, longitude: e.longitude, weight: 1 }));
  const greenPoints = events
    .filter((e) => e.type === "ended")
    .map((e) => ({ latitude: e.latitude, longitude: e.longitude, weight: 1 }));

  // Breathing radius: oscillates gently so the smoke feels like it's drifting.
  const heatmapRadius = 32 + Math.sin(pulse * Math.PI * 2) * 8;

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

        {redPoints.length > 0 && (
          <Heatmap
            points={redPoints}
            radius={heatmapRadius}
            opacity={0.75}
            gradient={{
              colors: ["rgba(255,107,107,0)", "#FF9E9E", "#FF6B6B", "#D93E3E"],
              startPoints: [0.05, 0.4, 0.75, 1],
              colorMapSize: 256,
            }}
          />
        )}

        {greenPoints.length > 0 && (
          <Heatmap
            points={greenPoints}
            radius={heatmapRadius}
            opacity={0.75}
            gradient={{
              colors: ["rgba(61,220,132,0)", "#8FE8B4", "#3DDC84", "#22A85C"],
              startPoints: [0.05, 0.4, 0.75, 1],
              colorMapSize: 256,
            }}
          />
        )}
      </MapView>

      <TouchableOpacity style={styles.myLocationButton} onPress={handleGoToCurrentLocation} disabled={locatingMe}>
        {locatingMe ? (
          <ActivityIndicator size="small" color="#111111" />
        ) : (
          <Ionicons name="locate" size={22} color="#111111" />
        )}
      </TouchableOpacity>

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
  myLocationButton: {
    position: "absolute",
    bottom: 96,
    right: 20,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
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
