// Base URL of your deployed backend on Render.
// If you ever redeploy to a different URL, this is the only line you need to change.
const API_BASE_URL = "https://car-contact-backend.onrender.com";

type SendOtpResponse = {
  success: boolean;
  status?: string;
  error?: string;
};

type VerifyOtpResponse = {
  success: boolean;
  verified?: boolean;
  error?: string;
};

/**
 * Sends an OTP to the given phone number.
 * phoneNumber must be in international format, e.g. "+919876543210"
 */
export async function sendOtp(phoneNumber: string): Promise<SendOtpResponse> {
  try {
    const response = await fetch(`${API_BASE_URL}/auth/send-otp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phoneNumber }),
    });

    const data = await response.json();
    return data;
  } catch (error) {
    console.error("sendOtp error:", error);
    return { success: false, error: "Could not reach the server. Check your internet connection." };
  }
}

/**
 * Verifies the OTP code entered by the user.
 */
export async function verifyOtp(phoneNumber: string, code: string): Promise<VerifyOtpResponse> {
  try {
    const response = await fetch(`${API_BASE_URL}/auth/verify-otp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phoneNumber, code }),
    });

    const data = await response.json();
    return data;
  } catch (error) {
    console.error("verifyOtp error:", error);
    return { success: false, error: "Could not reach the server. Check your internet connection." };
  }
}
