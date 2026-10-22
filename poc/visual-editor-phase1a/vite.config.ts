import { defineConfig } from "vite";

export default defineConfig({
  server: {
    // Tauri dev recompiles this directory while Vite serves the PoC. Watching
    // the generated DLL causes Windows EBUSY errors when the file is locked.
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
});
