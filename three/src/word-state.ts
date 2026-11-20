export const INITIAL_WORDS = [
  "INNOVATIE",
  "DESIGN",
  "CODE",
  "TOEKOMST",
  "LOGICA",
  "KUNST",
  "INTERACTIE",
  "WEB3",
  "SHADERS",
  "PIXELS",
  "CREATIE",
  "VISION",
];

export const MAX_WORDS = 24;

const STORAGE_KEY = "stained-glass-words";
const CHANNEL_NAME = "stained-glass-window";
const channel = typeof BroadcastChannel === "undefined"
  ? null
  : new BroadcastChannel(CHANNEL_NAME);

export function normalizeWords(words: readonly string[]) {
  const normalized = words.map((word) => word.trim().toLocaleUpperCase()).filter(Boolean);

  if (normalized.length === 0 || normalized.length > MAX_WORDS) {
    throw new RangeError(`The window must contain between 1 and ${MAX_WORDS} words.`);
  }

  if (normalized.some((word) => word.length > 24)) {
    throw new RangeError("Words must be 24 characters or fewer.");
  }

  return normalized;
}

function parseWords(value: unknown) {
  if (!Array.isArray(value) || !value.every((word): word is string => typeof word === "string")) {
    throw new TypeError("The saved window words are invalid.");
  }

  return normalizeWords(value);
}

export function readWindowWords() {
  const storedWords = localStorage.getItem(STORAGE_KEY);
  return storedWords === null
    ? [...INITIAL_WORDS]
    : parseWords(JSON.parse(storedWords) as unknown);
}

export function publishWindowWords(words: readonly string[]) {
  const normalized = normalizeWords(words);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  channel?.postMessage(normalized);
  return normalized;
}

export function subscribeToWindowWords(onChange: (words: string[]) => void) {
  const handleUpdate = (value: unknown) => {
    onChange(parseWords(value));
  };
  const handleStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY && event.newValue !== null) {
      handleUpdate(JSON.parse(event.newValue) as unknown);
    }
  };
  const handleMessage = (event: MessageEvent<unknown>) => handleUpdate(event.data);

  if (channel) {
    channel.addEventListener("message", handleMessage);
  } else {
    window.addEventListener("storage", handleStorage);
  }

  return () => {
    if (channel) {
      channel.removeEventListener("message", handleMessage);
    } else {
      window.removeEventListener("storage", handleStorage);
    }
  };
}
