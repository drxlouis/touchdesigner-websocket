# touchdesigner-websocket

To install dependencies:

```bash
bun install
```

To run:

```bash
bun run webs.ts
```

Open [http://localhost:3000](http://localhost:3000) in a browser. The server serves the web
interface there and upgrades WebSocket connections on the same port.

This project was created using `bun init` in bun v1.3.14. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.

## Three.js glas-in-loodraam

Start the two-page glass-window app with:

```bash
cd three
bun run start
```

The Bun entry point in `three/server.ts` serves the word editor at
[http://localhost:3000](http://localhost:3000). Open
[http://localhost:3000/window.html](http://localhost:3000/window.html) in a second tab or
window to display the stained glass. Words added or removed in the editor sync to the
display while both pages are open.

The window page is also a projection-mapping example using
[three-projection-mapper](https://github.com/bhoffmann93/three-projection-mapper).
Drag the corner and grid points to align the image with a physical surface. Use `G` to
toggle the controls, `T` for the test card, and `W` for the warp grid. Calibration is
saved in the browser. The app builds the GitHub dependency before starting because its
repository provides source files rather than a prebuilt `dist` directory.
