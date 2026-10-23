import { createSocket } from "node:dgram";
import * as osc from "osc-min";

const WEBSOCKET_PORT = 3000;
const TD_IP = "127.0.0.1";
const TD_PORT = 7000;

const udpClient = createSocket("udp4");

Bun.serve({
  port: WEBSOCKET_PORT,
  fetch(req, server) {
    if (server.upgrade(req)) return;
    return new Response(Bun.file("./index.html"));
  },
  websocket: {
    message(ws, message) {
      try {
        if (typeof message !== "string") {
          throw new Error("WebSocket message must be text");
        }

        const word = message.trim();
        if (!word) {
          throw new Error("WebSocket message must not be empty");
        }

        const oscBuffer = osc.toBuffer({
          address: "/word",
          args: [{ type: "string", value: word }],
        });

        udpClient.send(oscBuffer, TD_PORT, TD_IP, (error) => {
          if (error) {
            console.error("Sending OSC via UDP:", error);
          }
        });
      } catch (err) {
        console.error("Processing or sending:", err);
      }
    },
    open(ws) {
      console.log("Web client connected");
    },
    close(ws) {
      console.log("Web client disconnected");
    },
  },
});

console.log(`running ws://localhost:${WEBSOCKET_PORT}`);
console.log(`OSC data via UDP to TouchDesigner on ${TD_IP}:${TD_PORT}`);
