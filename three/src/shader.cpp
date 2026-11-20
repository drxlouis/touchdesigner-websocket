uniform float uTime;
uniform vec2 uResolution;
uniform float uCols;
uniform float uRows;
uniform float uTotalWords;
uniform sampler2D uSpriteSheet;
varying vec2 vUv;

float hash1(vec2 p)
{
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

vec2 hash2(vec2 p)
{
  return fract(sin(vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)))) * 43758.5453);
}

float noise(vec2 p)
{
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
      mix(hash1(i), hash1(i + vec2(1.0, 0.0)), f.x),
      mix(hash1(i + vec2(0.0, 1.0)), hash1(i + vec2(1.0, 1.0)), f.x),
      f.y);
}

float fbm(vec2 p)
{
  float value = 0.0;
  float amplitude = 0.5;
  for (int octave = 0; octave < 5; octave++)
  {
    value += noise(p) * amplitude;
    p = p * 2.03 + 17.17;
    amplitude *= 0.5;
  }
  return value;
}

float boxDistance(vec2 point, vec2 halfSize)
{
  vec2 d = abs(point) - halfSize;
  return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
}

void main()
{
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
      frameSide);
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
  vec2 nearestOffset = vec2(0.0);

  for (int y = -1; y <= 1; y++)
  {
    for (int x = -1; x <= 1; x++)
    {
      vec2 neighbor = vec2(float(x), float(y));
      vec2 candidateCell = cell + neighbor;
      if (
          candidateCell.x >= 0.0 && candidateCell.x < uCols &&
          candidateCell.y >= 0.0 && candidateCell.y < uRows)
      {
        vec2 jitter = (hash2(candidateCell) - 0.5) * 0.3;
        vec2 offset = local - neighbor - 0.5 - jitter;
        float distanceToSeed = length(offset * distanceScale);

        if (distanceToSeed < nearestDistance)
        {
          nextDistance = nearestDistance;
          nearestDistance = distanceToSeed;
          nearestCell = candidateCell;
          nearestOffset = offset;
        }
        else if (distanceToSeed < nextDistance)
        {
          nextDistance = distanceToSeed;
        }
      }
    }
  }

  float edgeDistance = nextDistance - nearestDistance;
  float seam = 1.0 - smoothstep(0.008, 0.025, edgeDistance);
  float cellHash = hash1(nearestCell);
  vec3 glassColor;
  if (cellHash < 0.17)
    glassColor = vec3(0.035, 0.12, 0.36);
  else if (cellHash < 0.34)
    glassColor = vec3(0.39, 0.025, 0.06);
  else if (cellHash < 0.51)
    glassColor = vec3(0.04, 0.23, 0.095);
  else if (cellHash < 0.68)
    glassColor = vec3(0.48, 0.25, 0.025);
  else if (cellHash < 0.84)
    glassColor = vec3(0.19, 0.065, 0.32);
  else
    glassColor = vec3(0.02, 0.25, 0.3);

  float grain = fbm(cellPoint * 24.0 + nearestCell * 3.1) * 0.13;
  float cloudyGlass = fbm(cellPoint * 3.0 + nearestCell * 1.7);
  float bevel = smoothstep(0.018, 0.19, edgeDistance);
  float centerLight = 0.78 + 0.22 * (1.0 - smoothstep(0.0, 0.9, nearestDistance));
  glassColor *= 0.57 + cloudyGlass * 0.62 + bevel * 0.28;
  glassColor += grain * vec3(0.34, 0.3, 0.22);
  glassColor *= centerLight;

  float cameShadow = exp(-pow((edgeDistance - 0.018) / 0.021, 2.0));
  float cameCrest = exp(-pow((edgeDistance - 0.057) / 0.019, 2.0));
  vec3 leadColor = vec3(0.009, 0.008, 0.007);
  leadColor += cameCrest * vec3(0.16, 0.12, 0.071);
  glassColor = mix(glassColor, leadColor, seam);
  glassColor += vec3(0.11, 0.09, 0.055) * cameShadow;

  vec2 bubbleCell = floor(cellPoint * vec2(13.0, 17.0));
  vec2 bubbleCenter = hash2(bubbleCell);
  vec2 bubbleOffset = fract(cellPoint * vec2(13.0, 17.0)) - bubbleCenter;
  float bubbleRadius = 0.09 + hash1(bubbleCell) * 0.1;
  float bubbleDistance = length(bubbleOffset);
  float bubbleRim = exp(-pow((bubbleDistance - bubbleRadius) / 0.018, 2.0));
  float bubbleCore = exp(-pow(bubbleDistance / (bubbleRadius * 0.72), 2.0));
  float bubbleMask = step(hash1(bubbleCell + vec2(3.7)), 0.22) * (1.0 - seam);
  glassColor *= 1.0 - bubbleCore * bubbleMask * 0.13;
  glassColor += vec3(0.42, 0.48, 0.46) * bubbleRim * bubbleMask * 0.16;

  float rowFromBottom = floor(nearestCell.y);
  float wordIndex = (uRows - 1.0 - rowFromBottom) * uCols + floor(nearestCell.x);
  vec2 labelUv = clamp(0.5 + nearestOffset, vec2(0.39, 0.35), vec2(0.61, 0.65));
  float labelBounds = step(0.0, labelUv.x) * step(labelUv.x, 1.0) * step(0.0, labelUv.y) * step(labelUv.y, 1.0);
  float spriteY = 1.0 - (wordIndex + (1.0 - labelUv.y)) / uTotalWords;
  vec2 glyphUv = vec2(labelUv.x, spriteY);
  float textMask = 0.0;
  float shadowSample = 0.0;
  float highlightSample = 0.0;
  if (wordIndex >= 0.0 && wordIndex < uTotalWords)
  {
    textMask = texture2D(uSpriteSheet, glyphUv).r * labelBounds;
    shadowSample = texture2D(
                       uSpriteSheet,
                       glyphUv + vec2(-0.002, 0.005 / uTotalWords))
                       .r *
                   labelBounds;
    highlightSample = texture2D(
                          uSpriteSheet,
                          glyphUv + vec2(0.002, -0.005 / uTotalWords))
                          .r *
                      labelBounds;
  }
  float engravedShadow = max(shadowSample - textMask, 0.0) * (1.0 - seam);
  float foilHighlight = max(textMask - highlightSample, 0.0) * (1.0 - seam);
  textMask = smoothstep(0.28, 0.75, textMask) * (1.0 - seam);
  vec3 etchedInk = vec3(1.0, 0.79, 0.43);
  glassColor = mix(glassColor, vec3(0.12, 0.055, 0.018), engravedShadow * 0.55);
  glassColor = mix(glassColor, etchedInk, textMask * 0.78);
  glassColor += etchedInk * textMask * 0.08;
  glassColor += vec3(0.26, 0.19, 0.1) * foilHighlight * 0.5;

  float reflectionAxis = point.x + point.y * 0.54;
  float reflectedShape = 1.0 - smoothstep(
                                   glassHalfSize.x * 0.04,
                                   glassHalfSize.x * 0.8,
                                   abs(point.x - 0.17));
  float reflectionPosition = 0.22 + sin(uTime * 0.12) * 0.004;
  float reflectionLine = exp(-pow((reflectionAxis - reflectionPosition) / 0.012, 2.0));
  float reflectionSoft = exp(-pow((reflectionAxis - reflectionPosition) / 0.075, 2.0));
  float reflection = (reflectionLine * 0.17 + reflectionSoft * 0.052) * reflectedShape;
  float secondaryReflection = exp(-pow((reflectionAxis + 0.18) / 0.018, 2.0)) * reflectedShape * 0.055;
  glassColor += vec3(0.78, 0.83, 0.81) * (reflection + secondaryReflection);

  color = mix(color, glassColor, inGlass);
  gl_FragColor = vec4(color, 1.0);
  }