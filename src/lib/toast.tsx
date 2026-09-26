import { Ionicons } from "@expo/vector-icons";
import React, { createContext, useCallback, useContext, useRef, useState } from "react";
import { Animated, Easing, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type ToastType = "success" | "error" | "info";

type ToastState = {
  visible: boolean;
  message: string;
  title?: string;
  type: ToastType;
};

type ShowToastOptions = {
  title?: string;
  type?: ToastType;
  duration?: number;
};

type ToastContextValue = {
  showToast: (message: string, options?: ShowToastOptions) => void;
};

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return ctx;
}

const ACCENT: Record<ToastType, string> = {
  success: "#3DDC84",
  error: "#FF6B6B",
  info: "#4EA8FF",
};

const ICON: Record<ToastType, keyof typeof Ionicons.glyphMap> = {
  success: "checkmark-circle",
  error: "close-circle",
  info: "information-circle",
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  const [toast, setToast] = useState<ToastState>({ visible: false, message: "", type: "info" });
  const translateY = useRef(new Animated.Value(-40)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.94)).current;
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hide = useCallback(() => {
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: -40,
        duration: 260,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start(() => {
      setToast((t) => ({ ...t, visible: false }));
    });
  }, [translateY, opacity]);

  const showToast = useCallback(
    (message: string, options?: ShowToastOptions) => {
      if (hideTimer.current) {
        clearTimeout(hideTimer.current);
      }
      setToast({ visible: true, message, title: options?.title, type: options?.type ?? "info" });

      translateY.setValue(-16);
      opacity.setValue(0);
      scale.setValue(0.94);

      Animated.parallel([
        Animated.spring(translateY, {
          toValue: 0,
          useNativeDriver: true,
          damping: 18,
          mass: 0.7,
          stiffness: 180,
        }),
        Animated.timing(opacity, { toValue: 1, duration: 220, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.spring(scale, { toValue: 1, useNativeDriver: true, damping: 16, mass: 0.6 }),
      ]).start();

      hideTimer.current = setTimeout(hide, options?.duration ?? 3000);
    },
    [hide, translateY, opacity, scale]
  );

  const accent = ACCENT[toast.type];

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {toast.visible && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.wrapper,
            {
              top: insets.top + 10,
              opacity,
              transform: [{ translateY }, { scale }],
            },
          ]}
        >
          <View style={styles.card}>
            <View style={[styles.accentBar, { backgroundColor: accent }]} />
            <Ionicons name={ICON[toast.type]} size={20} color={accent} style={styles.icon} />
            <View style={styles.textColumn}>
              {toast.title ? <Text style={styles.title}>{toast.title}</Text> : null}
              <Text style={styles.message}>{toast.message}</Text>
            </View>
          </View>
        </Animated.View>
      )}
    </ToastContext.Provider>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: "absolute",
    left: 16,
    right: 16,
    zIndex: 999,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(20, 20, 22, 0.92)",
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 16,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
    borderWidth: 0.5,
    borderColor: "rgba(255,255,255,0.08)",
  },
  accentBar: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
  },
  icon: {
    marginRight: 10,
  },
  textColumn: {
    flex: 1,
  },
  title: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 2,
    letterSpacing: 0.2,
  },
  message: {
    color: "rgba(255,255,255,0.82)",
    fontSize: 13.5,
    lineHeight: 18,
  },
});
