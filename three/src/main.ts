import * as THREE from "three";
import { ProjectionMapper, ProjectionMapperGUI } from "three-projection-mapper";
import "./style.css";
import {
  normalizeWords,
  readWindowWords,
  subscribeToWindowWords,
} from "./word-state";

function getColumnCount(width: number, height: number) {
  return width / height < 0.75 ? 2 : 4;
}

let cols = getColumnCount(window.innerWidth, window.innerHeight);
let words = readWindowWords();
let rows = Math.ceil(words.length / cols);

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) {
  throw new Error("The glass window app container was not found.");
}

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.domElement.setAttribute("aria-label", "Een kleurrijk glas-in-loodraam");
app.appendChild(renderer.domElement);

function getGlassHalfSize(width: number, height: number) {
  const aspect = width / height;
  return new THREE.Vector2(
    Math.min(aspect * 0.47, 0.76) - 0.042,
    0.445 - 0.042,
  );
}

type Point = { x: number; y: number };
type PaneGeometry = {
  geometry: THREE.BufferGeometry;
  aspect: number;
  axisAngle: number;
};

function fract(value: number) {
  return value - Math.floor(value);
}

function hash2(x: number, y: number): Point {
  return {
    x: fract(Math.sin(x * 127.1 + y * 311.7) * 43758.5453),
    y: fract(Math.sin(x * 269.5 + y * 183.3) * 43758.5453),
  };
}

function clipVoronoiCell(
  site: Point,
  sites: readonly Point[],
  halfSize: THREE.Vector2,
) {
  let polygon: Point[] = [
    { x: -halfSize.x, y: -halfSize.y },
    { x: halfSize.x, y: -halfSize.y },
    { x: halfSize.x, y: halfSize.y },
    { x: -halfSize.x, y: halfSize.y },
  ];

  for (const other of sites) {
    if (other === site) continue;

    const normal = { x: other.x - site.x, y: other.y - site.y };
    const limit = (other.x ** 2 + other.y ** 2 - site.x ** 2 - site.y ** 2) / 2;
    const clipped: Point[] = [];

    for (let index = 0; index < polygon.length; index++) {
      const current = polygon[index]!;
      const previous = polygon[(index + polygon.length - 1) % polygon.length]!;
      const currentDistance = current.x * normal.x + current.y * normal.y - limit;
      const previousDistance = previous.x * normal.x + previous.y * normal.y - limit;
      const currentInside = currentDistance <= 0;
      const previousInside = previousDistance <= 0;

      if (currentInside !== previousInside) {
        const amount = previousDistance / (previousDistance - currentDistance);
        clipped.push({
          x: previous.x + (current.x - previous.x) * amount,
          y: previous.y + (current.y - previous.y) * amount,
        });
      }
      if (currentInside) clipped.push(current);
    }

    polygon = clipped;
  }

  return polygon;
}

function getPrincipalAxis(polygon: readonly Point[], center: Point) {
  let xx = 0;
  let yy = 0;
  let xy = 0;

  for (const point of polygon) {
    const x = point.x - center.x;
    const y = point.y - center.y;
    xx += x * x;
    yy += y * y;
    xy += x * y;
  }

  xx /= polygon.length;
  yy /= polygon.length;
  xy /= polygon.length;
  const angle = 0.5 * Math.atan2(2 * xy, xx - yy);
  const undirectedAngle = angle > Math.PI / 2
    ? angle - Math.PI
    : angle < -Math.PI / 2
      ? angle + Math.PI
      : angle;
  const maximumTextAngle = 18 * Math.PI / 180;
  return THREE.MathUtils.clamp(undirectedAngle, -maximumTextAngle, maximumTextAngle);
}

function createPaneGeometry(
  paneIndex: number,
  columnCount: number,
  rowCount: number,
  halfSize: THREE.Vector2,
  aspect: number,
): PaneGeometry {
  const sites: Point[] = [];

  for (let topRow = 0; topRow < rowCount; topRow++) {
    const bottomRow = rowCount - 1 - topRow;
    for (let col = 0; col < columnCount; col++) {
      const jitter = hash2(col, bottomRow);
      sites.push({
        x: ((col + 0.5 + (jitter.x - 0.5) * 0.16) / columnCount * 2 - 1) * halfSize.x,
        y: ((bottomRow + 0.5 + (jitter.y - 0.5) * 0.16) / rowCount * 2 - 1) * halfSize.y,
      });
    }
  }

  const site = sites[paneIndex]!;
  const polygon = clipVoronoiCell(site, sites, halfSize);
  if (polygon.length < 3) {
    throw new Error(`Could not create the glass pane geometry for word ${paneIndex + 1}.`);
  }

  const minX = Math.min(...polygon.map((point) => point.x));
  const maxX = Math.max(...polygon.map((point) => point.x));
  const minY = Math.min(...polygon.map((point) => point.y));
  const maxY = Math.max(...polygon.map((point) => point.y));
  const center = polygon.reduce(
    (sum, point) => ({ x: sum.x + point.x / polygon.length, y: sum.y + point.y / polygon.length }),
    { x: 0, y: 0 },
  );
  const axisAngle = getPrincipalAxis(polygon, center);
  const vertices = [center, ...polygon];
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const textInset = 0.82;

  for (const point of vertices) {
    const insetPoint = {
      x: center.x + (point.x - center.x) * textInset,
      y: center.y + (point.y - center.y) * textInset,
    };
    positions.push(insetPoint.x * 2 / aspect, insetPoint.y * 2, 0);
    uvs.push(
      (point.x - minX) / (maxX - minX),
      (point.y - minY) / (maxY - minY),
    );
  }

  for (let index = 0; index < polygon.length; index++) {
    indices.push(0, index + 1, (index + 1) % polygon.length + 1);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  return {
    geometry,
    aspect: (maxX - minX) / (maxY - minY),
    axisAngle,
  };
}

function splitIntoTwoLines(
  context: CanvasRenderingContext2D,
  word: string,
  maxWidth: number,
) {
  if (context.measureText(word).width <= maxWidth) return [word];

  const candidates: string[][] = [];
  const words = word.trim().split(/\s+/);
  if (words.length > 1) {
    for (let split = 1; split < words.length; split++) {
      candidates.push([
        words.slice(0, split).join(" "),
        words.slice(split).join(" "),
      ]);
    }
  } else {
    const characters = Array.from(word);
    for (let split = 1; split < characters.length; split++) {
      candidates.push([
        characters.slice(0, split).join(""),
        characters.slice(split).join(""),
      ]);
    }
  }

  return candidates
    .sort((left, right) => {
      const score = (lines: string[]) =>
        Math.max(...lines.map((line) => context.measureText(line).width));
      const widthDifference = score(left) - score(right);
      if (Math.abs(widthDifference) > 0.01) return widthDifference;
      return Math.abs(left[0]!.length - left[1]!.length)
        - Math.abs(right[0]!.length - right[1]!.length);
    })[0] ?? [word];
}

async function createWordTexture(word: string, paneAspect: number, axisAngle: number) {
  const fontFamily = 'Georgia, "Times New Roman", serif';
  const fontWeight = 700;
  await document.fonts.load(`${fontWeight} 400px ${fontFamily}`, word);
  await document.fonts.ready;

  const longSide = 1024;
  const width = paneAspect >= 1
    ? longSide
    : Math.max(128, Math.round(longSide * paneAspect));
  const height = paneAspect >= 1
    ? Math.max(128, Math.round(longSide / paneAspect))
    : longSide;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Could not create a canvas for the pane text.");
  }

  context.clearRect(0, 0, width, height);
  context.fillStyle = "#fff";
  context.textAlign = "center";
  context.textBaseline = "middle";

  const cosine = Math.abs(Math.cos(axisAngle));
  const sine = Math.abs(Math.sin(axisAngle));
  const alongAxis = Math.min(
    width / Math.max(cosine, 0.0001),
    height / Math.max(sine, 0.0001),
  ) * 0.78;
  const acrossAxis = Math.min(
    width / Math.max(sine, 0.0001),
    height / Math.max(cosine, 0.0001),
  ) * 0.72;
  const fontSize = Math.min(height * 0.42, acrossAxis * 0.48);
  context.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
  const lines = word.length > 6 && context.measureText(word).width > alongAxis * 0.9
    ? splitIntoTwoLines(context, word, alongAxis * 0.9)
    : [word];
  const metrics = context.measureText(lines[0]!);
  const glyphHeight = metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent;
  if (metrics.width <= 0 || glyphHeight <= 0) {
    throw new Error(`Could not measure the loaded font for "${word}".`);
  }

  context.save();
  context.translate(width / 2, height / 2);
  context.rotate(-axisAngle);
  const widestLine = Math.max(...lines.map((line) => context.measureText(line).width));
  const lineHeight = glyphHeight * 1.28;
  const totalTextHeight = lineHeight * lines.length;
  const scale = Math.min(
    1,
    alongAxis * 0.92 / widestLine,
    acrossAxis * 0.9 / totalTextHeight,
  );
  context.scale(scale, scale);
  context.textBaseline = "alphabetic";
  const firstBaseline = -((lines.length - 1) * lineHeight) / 2
    + (metrics.actualBoundingBoxAscent - metrics.actualBoundingBoxDescent) / 2;
  lines.forEach((line, index) => {
    context.fillText(line, 0, firstBaseline + index * lineHeight);
  });
  context.restore();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.NoColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  return texture;
}

const vertexShader = `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const fragmentShader = `
  uniform float uTime;
  uniform vec2 uResolution;
  uniform float uCols;
  uniform float uRows;

  varying vec2 vUv;

  float hash1(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  vec2 hash2(vec2 p) {
    return fract(sin(vec2(
      dot(p, vec2(127.1, 311.7)),
      dot(p, vec2(269.5, 183.3))
    )) * 43758.5453);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash1(i), hash1(i + vec2(1.0, 0.0)), f.x),
      mix(hash1(i + vec2(0.0, 1.0)), hash1(i + vec2(1.0, 1.0)), f.x),
      f.y
    );
  }

  float fbm(vec2 p) {
    float value = 0.0;
    float amplitude = 0.5;
    for (int octave = 0; octave < 5; octave++) {
      value += noise(p) * amplitude;
      p = p * 2.03 + 17.17;
      amplitude *= 0.5;
    }
    return value;
  }

  float boxDistance(vec2 point, vec2 halfSize) {
    vec2 d = abs(point) - halfSize;
    return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
  }

  void main() {
    float aspect = uResolution.x / uResolution.y;
    vec2 point = (vUv - 0.5) * vec2(aspect, 1.0);
    vec2 windowHalfSize = vec2(min(aspect * 0.47, 0.76), 0.445);
    vec2 glassHalfSize = windowHalfSize - vec2(0.042, 0.042);
    float frameDistance = boxDistance(point, windowHalfSize);
    float glassDistance = boxDistance(point, glassHalfSize);

    float backdropNoise = fbm(point * vec2(7.0, 13.0)) * 0.018;
    vec3 color = vec3(0.018, 0.019, 0.022) + backdropNoise;
    float halo = exp(-dot(point * vec2(0.8, 1.1), point * vec2(0.8, 1.1)) * 2.8);
    color += vec3(0.045, 0.028, 0.016) * halo;

    float shadow = 1.0 - smoothstep(-0.015, 0.14, frameDistance);
    color = mix(color, vec3(0.004, 0.003, 0.002), shadow * 0.64);

    float inWindow = 1.0 - smoothstep(0.0, 0.003, frameDistance);
    float inGlass = 1.0 - smoothstep(-0.002, 0.002, glassDistance);
    float frame = inWindow * (1.0 - inGlass);
    float frameDepth = -frameDistance;
    float edgeLight = exp(-pow((frameDepth - 0.003) / 0.002, 2.0));
    float outerMolding = exp(-pow((frameDepth - 0.011) / 0.003, 2.0));
    float carvedGroove = exp(-pow((frameDepth - 0.018) / 0.002, 2.0));
    float innerMolding = exp(-pow((frameDepth - 0.031) / 0.004, 2.0));
    float woodGrain = fbm(point * vec2(9.0, 190.0));
    float crossGrain = fbm(point.yx * vec2(9.0, 190.0));
    float horizontalRail = smoothstep(0.58, 0.78, abs(point.y) / windowHalfSize.y);
    float woodGrainValue = mix(woodGrain, crossGrain, horizontalRail);
    vec3 frameColor = vec3(0.052, 0.029, 0.014) * (0.72 + woodGrainValue * 0.7);
    frameColor += vec3(0.18, 0.105, 0.038) * outerMolding;
    frameColor += vec3(0.018, 0.01, 0.005) * carvedGroove;
    frameColor += vec3(0.12, 0.069, 0.025) * innerMolding;
    frameColor += vec3(0.17, 0.12, 0.057) * edgeLight;
    float frameSide = step(abs(point.y) / windowHalfSize.y, abs(point.x) / windowHalfSize.x);
    vec2 frameNormal = mix(
      vec2(0.0, sign(point.y)),
      vec2(sign(point.x), 0.0),
      frameSide
    );
    float woodLighting = 0.72 + 0.3 * max(dot(normalize(frameNormal), normalize(vec2(-0.5, 0.8))), 0.0);
    frameColor *= woodLighting;
    color = mix(color, frameColor, frame);

    vec2 glassUv = (point / glassHalfSize) * 0.5 + 0.5;
    vec2 grid = vec2(uCols, uRows);
    vec2 cellPoint = glassUv * grid;
    vec2 cell = floor(cellPoint);
    vec2 local = fract(cellPoint);
    vec2 physicalCellSize = (glassHalfSize * 2.0) / grid;
    vec2 distanceScale = physicalCellSize / max(physicalCellSize.x, physicalCellSize.y);

    float nearestDistance = 10.0;
    float nextDistance = 10.0;
    vec2 nearestCell = vec2(0.0);
    for (int y = -1; y <= 1; y++) {
      for (int x = -1; x <= 1; x++) {
        vec2 neighbor = vec2(float(x), float(y));
        vec2 candidateCell = cell + neighbor;
        if (
          candidateCell.x >= 0.0 && candidateCell.x < uCols &&
          candidateCell.y >= 0.0 && candidateCell.y < uRows
        ) {
          vec2 jitter = (hash2(candidateCell) - 0.5) * 0.16;
          vec2 offset = local - neighbor - 0.5 - jitter;
          float distanceToSeed = length(offset * distanceScale);
          if (distanceToSeed < nearestDistance) {
            nextDistance = nearestDistance;
            nearestDistance = distanceToSeed;
            nearestCell = candidateCell;
          } else if (distanceToSeed < nextDistance) {
            nextDistance = distanceToSeed;
          }
        }
      }
    }

    float edgeDistance = max(nextDistance - nearestDistance, 0.0);
    float leadNoise = fbm(cellPoint * 57.0 + nearestCell * 13.7) - 0.5;
    float leadWidth = 0.022 + leadNoise * 0.006;
    float lead = 1.0 - smoothstep(leadWidth * 0.72, leadWidth * 1.22, edgeDistance);
    float leadShadow = exp(-pow(edgeDistance / (leadWidth * 2.8), 2.0));
    float paneEdgeOcclusion = 1.0 - smoothstep(leadWidth * 1.2, leadWidth * 5.0, edgeDistance);

    float cellHash = hash1(nearestCell);
    vec3 glassColor;
    if (cellHash < 0.17) glassColor = vec3(0.035, 0.12, 0.36);
    else if (cellHash < 0.34) glassColor = vec3(0.39, 0.025, 0.06);
    else if (cellHash < 0.51) glassColor = vec3(0.04, 0.23, 0.095);
    else if (cellHash < 0.68) glassColor = vec3(0.48, 0.25, 0.025);
    else if (cellHash < 0.84) glassColor = vec3(0.19, 0.065, 0.32);
    else glassColor = vec3(0.02, 0.25, 0.3);

    vec2 glassDistortion = vec2(
      fbm(cellPoint * 9.0 + nearestCell * 4.1),
      fbm(cellPoint * 9.0 + nearestCell * 4.1 + 19.3)
    ) - 0.5;
    float cloud = fbm(cellPoint * 5.0 + glassDistortion * 2.8 + nearestCell * 1.7);
    float streak = fbm(cellPoint * vec2(2.5, 23.0) + glassDistortion * 1.8);
    float fineGrain = noise(cellPoint * 190.0 + nearestCell * 31.0);
    float transmission = 0.66 + cloud * 0.64 + streak * 0.16;
    glassColor *= transmission;
    glassColor *= 1.0 - paneEdgeOcclusion * 0.33;
    glassColor += (fineGrain - 0.48) * vec3(0.035, 0.032, 0.029);

    vec2 bubbleCell = floor(cellPoint * vec2(17.0, 23.0));
    vec2 bubbleOffset = fract(cellPoint * vec2(17.0, 23.0)) - hash2(bubbleCell);
    float bubbleDistance = length(bubbleOffset);
    float bubbleSize = 0.07 + hash1(bubbleCell + 6.2) * 0.09;
    float bubblePresence = step(hash1(bubbleCell + 2.8), 0.28);
    float bubbleRim = exp(-pow((bubbleDistance - bubbleSize) / 0.014, 2.0)) * bubblePresence;
    float bubbleCenter = exp(-pow(bubbleDistance / (bubbleSize * 0.7), 2.0)) * bubblePresence;

    float surfaceHeight = cloud * 0.32
      + streak * 0.12
      + fineGrain * 0.018
      + bubbleCenter * 0.1;
    vec3 surfaceNormal = normalize(vec3(
      -dFdx(surfaceHeight) * 7.5,
      -dFdy(surfaceHeight) * 7.5,
      1.0
    ));
    vec3 viewDirection = vec3(0.0, 0.0, 1.0);
    vec3 lightDirection = normalize(vec3(
      -0.48 + sin(uTime * 0.22) * 0.12,
      0.7 + cos(uTime * 0.17) * 0.08,
      0.82
    ));
    vec3 halfDirection = normalize(lightDirection + viewDirection);
    float diffuse = 0.52 + 0.48 * max(dot(surfaceNormal, lightDirection), 0.0);
    float specular = pow(max(dot(surfaceNormal, halfDirection), 0.0), 42.0);
    float broadSpecular = pow(max(dot(surfaceNormal, halfDirection), 0.0), 10.0);
    float fresnel = pow(1.0 - max(dot(surfaceNormal, viewDirection), 0.0), 4.0);
    glassColor *= diffuse;
    glassColor += vec3(0.8, 0.88, 1.0) * (specular * 0.72 + broadSpecular * 0.1 + fresnel * 0.18);
    glassColor += vec3(0.52, 0.6, 0.58) * bubbleRim * 0.3;
    glassColor *= 1.0 - bubbleCenter * 0.16;

    float leadGrain = fbm(cellPoint * 125.0 + nearestCell * 29.0);
    float leadShoulder = exp(-pow((edgeDistance - leadWidth * 1.65) / (leadWidth * 0.55), 2.0));
    float leadCrest = exp(-pow((edgeDistance - leadWidth * 0.38) / (leadWidth * 0.24), 2.0));
    vec3 leadColor = vec3(0.009, 0.008, 0.007) * (0.72 + leadGrain * 0.48);
    leadColor += vec3(0.12, 0.095, 0.058) * leadShoulder;
    leadColor += vec3(0.2, 0.16, 0.1) * leadCrest;
    glassColor *= 1.0 - leadShadow * 0.24;
    glassColor = mix(glassColor, leadColor, lead);

    float reflectionAxis = point.x + point.y * 0.54 + glassDistortion.x * 0.025;
    float reflectionPosition = 0.22 + sin(uTime * 0.12) * 0.004;
    float reflectionLine = exp(-pow((reflectionAxis - reflectionPosition) / 0.009, 2.0));
    float reflectionSoft = exp(-pow((reflectionAxis - reflectionPosition) / 0.062, 2.0));
    float reflectionPatch = exp(-dot((point - vec2(-0.19, 0.25)) * vec2(7.5, 12.0),
                                      (point - vec2(-0.19, 0.25)) * vec2(7.5, 12.0)));
    glassColor += vec3(0.84, 0.91, 0.9) * (reflectionLine * 0.22 + reflectionSoft * 0.075 + reflectionPatch * 0.12);

    color = mix(color, glassColor, inGlass);
    gl_FragColor = vec4(color, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const textVertexShader = `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const textFragmentShader = `
  uniform sampler2D uTextTexture;
  uniform vec2 uTexelSize;
  uniform float uTime;
  varying vec2 vUv;

  void main() {
    float coverage = texture2D(uTextTexture, vUv).a;
    vec2 texel = uTexelSize * 1.35;
    float leftAlpha = texture2D(uTextTexture, vUv - vec2(texel.x, 0.0)).a;
    float rightAlpha = texture2D(uTextTexture, vUv + vec2(texel.x, 0.0)).a;
    float downAlpha = texture2D(uTextTexture, vUv - vec2(0.0, texel.y)).a;
    float upAlpha = texture2D(uTextTexture, vUv + vec2(0.0, texel.y)).a;
    float surrounding = max(max(leftAlpha, rightAlpha), max(downAlpha, upAlpha));
    float outline = max(surrounding - coverage, 0.0) * (1.0 - coverage);
    float shadow = texture2D(uTextTexture, vUv + uTexelSize * vec2(-1.5, -2.2)).a
      * (1.0 - coverage) * 0.42;
    float outputAlpha = max(coverage, max(outline * 0.78, shadow));
    if (outputAlpha < 0.015) discard;

    vec2 gradient = vec2(leftAlpha - rightAlpha, downAlpha - upAlpha);
    vec3 surfaceNormal = normalize(vec3(gradient * 2.0, 0.9));
    vec3 lightDirection = normalize(vec3(
      -0.5 + sin(uTime * 0.22) * 0.12,
      0.72 + cos(uTime * 0.17) * 0.08,
      0.85
    ));
    float diffuse = 0.72 + 0.28 * max(dot(surfaceNormal, lightDirection), 0.0);
    float bevel = smoothstep(0.03, 0.42, length(gradient) * 2.0);
    float glint = pow(
      max(dot(surfaceNormal, normalize(lightDirection + vec3(0.0, 0.0, 1.0))), 0.0),
      26.0
    );
    vec3 darkEdge = vec3(0.12, 0.045, 0.012);
    vec3 gold = vec3(1.0, 0.84, 0.53) * diffuse;
    gold += vec3(0.24, 0.18, 0.09) * bevel;
    gold += vec3(0.3, 0.24, 0.14) * glint;
    float fineVariation = fract(sin(dot(floor(vUv * vec2(320.0, 260.0)), vec2(127.1, 311.7))) * 43758.5453);
    gold *= 0.98 + fineVariation * 0.025;
    vec3 color = mix(darkEdge, gold, coverage);

    gl_FragColor = vec4(color, outputAlpha);
    #include <colorspace_fragment>
  }
`;

const material = new THREE.ShaderMaterial({
  vertexShader,
  fragmentShader,
  uniforms: {
    uTime: { value: 0 },
    uResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
    uCols: { value: cols },
    uRows: { value: rows },
  },
  depthWrite: false,
  depthTest: false,
});

const scene = new THREE.Scene();
const camera = new THREE.Camera();
const geometry = new THREE.PlaneGeometry(2, 2);
scene.add(new THREE.Mesh(geometry, material));

const paneGroup = new THREE.Group();
scene.add(paneGroup);
const projectionSize = renderer.getDrawingBufferSize(new THREE.Vector2());
const projectionTarget = new THREE.WebGLRenderTarget(
  projectionSize.x,
  projectionSize.y,
  {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    depthBuffer: false,
  },
);
projectionTarget.texture.colorSpace = THREE.SRGBColorSpace;
const projectionMapper = new ProjectionMapper(renderer, projectionTarget.texture, {
  appId: "stained-glass-window",
  canvasBoundary: true,
  zoom: 0.85,
});
const projectionGui = new ProjectionMapperGUI(projectionMapper, {
  title: "Glas-in-lood projectie",
  anchor: "right",
});
let renderGeneration = 0;

function disposePaneMeshes(meshes: readonly THREE.Mesh[]) {
  for (const mesh of meshes) {
    mesh.geometry.dispose();
    const textMaterial = mesh.material as THREE.ShaderMaterial;
    (textMaterial.uniforms.uTextTexture.value as THREE.Texture).dispose();
    textMaterial.dispose();
  }
}

async function createPaneMeshes(
  wordsToRender: readonly string[],
  columnCount: number,
  rowCount: number,
  width: number,
  height: number,
) {
  const aspect = width / height;
  const halfSize = getGlassHalfSize(width, height);
  const meshes: THREE.Mesh[] = [];

  try {
    for (let index = 0; index < wordsToRender.length; index++) {
      const {
        geometry: paneGeometry,
        aspect: paneAspect,
        axisAngle,
      } = createPaneGeometry(
        index,
        columnCount,
        rowCount,
        halfSize,
        aspect,
      );
      let texture: THREE.CanvasTexture;
      try {
        texture = await createWordTexture(wordsToRender[index]!, paneAspect, axisAngle);
      } catch (error) {
        paneGeometry.dispose();
        throw error;
      }
      const paneMaterial = new THREE.ShaderMaterial({
        vertexShader: textVertexShader,
        fragmentShader: textFragmentShader,
        uniforms: {
          uTextTexture: { value: texture },
          uTexelSize: { value: new THREE.Vector2(1 / texture.image.width, 1 / texture.image.height) },
          uTime: { value: 0 },
        },
        transparent: true,
        depthTest: false,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false,
      });
      const mesh = new THREE.Mesh(paneGeometry, paneMaterial);
      mesh.renderOrder = 1;
      meshes.push(mesh);
    }

    return meshes;
  } catch (error) {
    disposePaneMeshes(meshes);
    throw error;
  }
}

function replacePaneMeshes(meshes: readonly THREE.Mesh[]) {
  const previousMeshes = [...paneGroup.children] as THREE.Mesh[];
  paneGroup.clear();
  for (const mesh of meshes) paneGroup.add(mesh);
  disposePaneMeshes(previousMeshes);
}

async function setWindowWords(nextWords: readonly string[]) {
  const normalizedWords = normalizeWords(nextWords);
  const nextCols = cols;
  const nextRows = Math.ceil(normalizedWords.length / nextCols);
  const generation = ++renderGeneration;
  const nextMeshes = await createPaneMeshes(
    normalizedWords,
    nextCols,
    nextRows,
    window.innerWidth,
    window.innerHeight,
  );
  if (generation !== renderGeneration) {
    disposePaneMeshes(nextMeshes);
    return;
  }

  replacePaneMeshes(nextMeshes);
  words = normalizedWords;
  cols = nextCols;
  rows = nextRows;
  material.uniforms.uCols.value = cols;
  material.uniforms.uRows.value = rows;
}

function reportRenderError(error: unknown) {
  console.error("Could not render the stained-glass words.", error);
}

subscribeToWindowWords((nextWords) => {
  void setWindowWords(nextWords).catch(reportRenderError);
});
void setWindowWords(words).catch(reportRenderError);

window.addEventListener("resize", () => {
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  const nextProjectionSize = renderer.getDrawingBufferSize(new THREE.Vector2());
  projectionTarget.setSize(nextProjectionSize.x, nextProjectionSize.y);
  projectionMapper.resize(window.innerWidth, window.innerHeight);
  material.uniforms.uResolution.value.set(window.innerWidth, window.innerHeight);
  const nextCols = getColumnCount(window.innerWidth, window.innerHeight);
  const nextRows = Math.ceil(words.length / nextCols);
  const generation = ++renderGeneration;
  cols = nextCols;
  rows = nextRows;
  material.uniforms.uCols.value = cols;
  material.uniforms.uRows.value = rows;
  void createPaneMeshes(
    words,
    cols,
    rows,
    window.innerWidth,
    window.innerHeight,
  ).then((nextMeshes) => {
    if (generation !== renderGeneration) {
      disposePaneMeshes(nextMeshes);
      return;
    }
    replacePaneMeshes(nextMeshes);
  }).catch(reportRenderError);
});

const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");

window.addEventListener("keydown", (event) => {
  if (
    event.target instanceof Element
    && event.target.closest("input, textarea, select, button, [contenteditable='true']")
  ) {
    return;
  }

  switch (event.key.toLocaleLowerCase()) {
    case "g":
    case "p":
      projectionGui.toggle();
      event.preventDefault();
      break;
    case "t":
      projectionGui.toggleTestCard();
      event.preventDefault();
      break;
    case "w":
      projectionGui.toggleWarpUI();
      event.preventDefault();
      break;
  }
});

const startTime = performance.now();
function animate() {
  requestAnimationFrame(animate);
  material.uniforms.uTime.value = motionPreference.matches
    ? 0
    : (performance.now() - startTime) / 1000;
  for (const child of paneGroup.children) {
    const textMaterial = (child as THREE.Mesh).material as THREE.ShaderMaterial;
    textMaterial.uniforms.uTime.value = material.uniforms.uTime.value;
  }

  renderer.setRenderTarget(projectionTarget);
  renderer.clear();
  renderer.render(scene, camera);
  renderer.setRenderTarget(null);
  projectionMapper.render();
}
animate();
