import { sendOtp, verifyOtp } from "@/lib/api";
import { useToast } from "@/lib/toast";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

const CODE_LENGTH = 6;
const RESEND_WAIT_SECONDS = 30;

export default function OtpScreen() {
  const router = useRouter();
  const { showToast } = useToast();
  const { phoneNumber } = useLocalSearchParams<{ phoneNumber: string }>();

  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(RESEND_WAIT_SECONDS);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const timer = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [secondsLeft]);

  const canVerify = code.length === CODE_LENGTH && !loading;

  async function handleVerify() {
    if (!canVerify || !phoneNumber) return;
    setLoading(true);

    const result = await verifyOtp(phoneNumber, code);

    setLoading(false);

    if (result.success && result.verified) {
      router.replace({ pathname: "/home", params: { phoneNumber } });
    } else if (result.success && !result.verified) {
      showToast("That code didn't match. Please try again.", { title: "Incorrect code", type: "error" });
      setCode("");
    } else {
      showToast(result.error || "Something went wrong. Please try again.", { title: "Couldn't verify", type: "error" });
    }
  }

  async function handleResend() {
    if (!phoneNumber || secondsLeft > 0 || resending) return;
    setResending(true);

    const result = await sendOtp(phoneNumber);

    setResending(false);

    if (result.success) {
      setSecondsLeft(RESEND_WAIT_SECONDS);
      setCode("");
      showToast("A new code has been sent to your phone.", { title: "Code sent", type: "success" });
    } else {
      showToast(result.error || "Something went wrong. Please try again.", { title: "Couldn't resend", type: "error" });
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.content}>
        <Text style={styles.title}>Enter code</Text>
        <Text style={styles.subtitle}>
          We sent a {CODE_LENGTH}-digit code to{"\n"}
          <Text style={styles.phoneText}>{phoneNumber}</Text>
        </Text>

        <TouchableOpacity
          style={styles.codeBoxRow}
          activeOpacity={1}
          onPress={() => inputRef.current?.focus()}
        >
          {Array.from({ length: CODE_LENGTH }).map((_, i) => (
            <View
              key={i}
              style={[styles.codeBox, code.length === i && styles.codeBoxActive]}
            >
              <Text style={styles.codeBoxText}>{code[i] || ""}</Text>
            </View>
          ))}
        </TouchableOpacity>

        <TextInput
          ref={inputRef}
          style={styles.hiddenInput}
          value={code}
          onChangeText={(text) => setCode(text.replace(/\D/g, "").slice(0, CODE_LENGTH))}
          keyboardType="number-pad"
          maxLength={CODE_LENGTH}
          autoFocus
        />

        <TouchableOpacity
          style={[styles.button, !canVerify && styles.buttonDisabled]}
          onPress={handleVerify}
          disabled={!canVerify}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Verify</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.resendRow}
          onPress={handleResend}
          disabled={secondsLeft > 0 || resending}
        >
          <Text style={styles.resendText}>
            {resending
              ? "Resending..."
              : secondsLeft > 0
              ? `Resend code in ${secondsLeft}s`
              : "Resend code"}
          </Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  content: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    color: "#111111",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    color: "#666666",
    marginBottom: 32,
    lineHeight: 21,
  },
  phoneText: {
    color: "#111111",
    fontWeight: "600",
  },
  codeBoxRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 32,
  },
  codeBox: {
    width: 44,
    height: 54,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: "#E0E0E0",
    alignItems: "center",
    justifyContent: "center",
  },
  codeBoxActive: {
    borderColor: "#111111",
  },
  codeBoxText: {
    fontSize: 22,
    fontWeight: "600",
    color: "#111111",
  },
  hiddenInput: {
    position: "absolute",
    opacity: 0,
    height: 0,
    width: 0,
  },
  button: {
    backgroundColor: "#111111",
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
    marginBottom: 20,
  },
  buttonDisabled: {
    backgroundColor: "#CCCCCC",
  },
  buttonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
  resendRow: {
    alignItems: "center",
  },
  resendText: {
    fontSize: 14,
    color: "#666666",
    fontWeight: "500",
  },
});
