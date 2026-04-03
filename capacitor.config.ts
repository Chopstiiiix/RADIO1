import type { CapacitorConfig } from "@capacitor/cli";

// Toggle for simulator (localhost) vs real device (production)
const isSimulator = process.env.CAPACITOR_ENV !== "production";

const config: CapacitorConfig = {
  appId: "com.caster.radio",
  appName: "Caster",
  webDir: "out",
  server: {
    url: isSimulator
      ? "http://localhost:3000/intro"    // Simulator: local dev server
      : "https://cstr.inspire-edge.net/intro",  // Real device: production
    cleartext: isSimulator, // Allow HTTP for localhost
    allowNavigation: [
      "cstr.inspire-edge.net",
      "*.supabase.co",
    ],
  },
  ios: {
    contentInset: "automatic",
    backgroundColor: "#202020",
    preferredContentMode: "mobile",
    allowsLinkPreview: false,
  },
  android: {
    backgroundColor: "#202020",
    allowMixedContent: false,
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      launchShowDuration: 1500,
      backgroundColor: "#202020",
      showSpinner: false,
    },
    StatusBar: {
      style: "DARK",
      backgroundColor: "#202020",
    },
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
  },
};

export default config;
