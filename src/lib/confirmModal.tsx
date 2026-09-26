import { Ionicons } from "@expo/vector-icons";
import React, { createContext, useCallback, useContext, useRef, useState } from "react";
import { Animated, Easing, Modal, Pressable, StyleSheet, Text, View } from "react-native";

type ConfirmOptions = {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
};

type ConfirmContextValue = {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
};

const ConfirmContext = createContext<ConfirmContextValue | undefined>(undefined);

export function useConfirm(): ConfirmContextValue {
  const ctx = useContext(ConfirmContext);
  if (!ctx) {
    throw new Error("useConfirm must be used within a ConfirmProvider");
  }
  return ctx;
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [visible, setVisible] = useState(false);
  const [options, setOptions] = useState<ConfirmOptions>({ title: "" });
  const resolverRef = useRef<((value: boolean) => void) | null>(null);

  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.92)).current;

  const animateIn = useCallback(() => {
    opacity.setValue(0);
    scale.setValue(0.92);
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 220, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, damping: 18, mass: 0.7, stiffness: 200 }),
    ]).start();
  }, [opacity, scale]);

  const close = useCallback(
    (result: boolean) => {
      Animated.parallel([
        Animated.timing(opacity, { toValue: 0, duration: 160, useNativeDriver: true }),
        Animated.timing(scale, { toValue: 0.92, duration: 160, useNativeDriver: true }),
      ]).start(() => {
        setVisible(false);
        resolverRef.current?.(result);
        resolverRef.current = null;
      });
    },
    [opacity, scale]
  );

  const confirm = useCallback(
    (opts: ConfirmOptions) => {
      return new Promise<boolean>((resolve) => {
        resolverRef.current = resolve;
        setOptions(opts);
        setVisible(true);
        requestAnimationFrame(animateIn);
      });
    },
    [animateIn]
  );

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      <Modal visible={visible} transparent animationType="none" onRequestClose={() => close(false)}>
        <Pressable style={styles.backdrop} onPress={() => close(false)}>
          <Animated.View style={[styles.cardWrapper, { opacity, transform: [{ scale }] }]}>
            <Pressable onPress={() => {}}>
              <View style={styles.card}>
                <View style={[styles.iconCircle, options.destructive && styles.iconCircleDanger]}>
                  <Ionicons
                    name={options.destructive ? "trash" : "help-circle"}
                    size={22}
                    color={options.destructive ? "#FF6B6B" : "#4EA8FF"}
                  />
                </View>
                <Text style={styles.title}>{options.title}</Text>
                {options.message ? <Text style={styles.message}>{options.message}</Text> : null}

                <View style={styles.buttonRow}>
                  <Pressable style={styles.cancelButton} onPress={() => close(false)}>
                    <Text style={styles.cancelButtonText}>{options.cancelLabel ?? "Cancel"}</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.confirmButton, options.destructive && styles.confirmButtonDanger]}
                    onPress={() => close(true)}
                  >
                    <Text style={styles.confirmButtonText}>{options.confirmLabel ?? "Confirm"}</Text>
                  </Pressable>
                </View>
              </View>
            </Pressable>
          </Animated.View>
        </Pressable>
      </Modal>
    </ConfirmContext.Provider>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
  },
  cardWrapper: {
    width: "100%",
    maxWidth: 340,
  },
  card: {
    backgroundColor: "rgba(24, 24, 26, 0.96)",
    borderRadius: 22,
    paddingTop: 22,
    paddingBottom: 18,
    paddingHorizontal: 22,
    alignItems: "center",
    borderWidth: 0.5,
    borderColor: "rgba(255,255,255,0.08)",
    shadowColor: "#000",
    shadowOpacity: 0.35,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 14,
  },
  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(78, 168, 255, 0.14)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  iconCircleDanger: {
    backgroundColor: "rgba(255, 107, 107, 0.14)",
  },
  title: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "700",
    textAlign: "center",
    letterSpacing: 0.2,
  },
  message: {
    color: "rgba(255,255,255,0.72)",
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
    marginTop: 8,
  },
  buttonRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 20,
    width: "100%",
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 14,
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  cancelButtonText: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 15,
    fontWeight: "600",
  },
  confirmButton: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 14,
    alignItems: "center",
    backgroundColor: "#4EA8FF",
  },
  confirmButtonDanger: {
    backgroundColor: "#FF6B6B",
  },
  confirmButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
  },
});
