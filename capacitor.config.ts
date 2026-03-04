import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.markbromwich.taverai",
  appName: "Taverai",
  server: {
    url: "https://taverai.onrender.com",
    cleartext: false,
    allowNavigation: ["taverai.onrender.com"]
  },
};

export default config;