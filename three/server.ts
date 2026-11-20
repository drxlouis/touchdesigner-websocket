import { createServer } from "vite";

const server = await createServer({
  root: import.meta.dir,
  server: {
    host: "0.0.0.0",
    port: 3000,
    strictPort: true,
  },
});

await server.listen();
server.printUrls();
