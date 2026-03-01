import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.markbromwich.taverai",
  appName: "Taverai",

  // Use the hosted web app (Render) so /api routes work
  server: {
    url: "https://taverai.onrender.com",
    cleartext: false,
  },
};

export default config;