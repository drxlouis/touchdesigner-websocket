import "./style.css";
import {
  MAX_WORDS,
  publishWindowWords,
  readWindowWords,
} from "./word-state";

function getElement<T extends Element>(selector: string) {
  const element = document.querySelector<T>(selector);
  if (!element) {
    throw new Error(`The required word form element "${selector}" was not found.`);
  }
  return element;
}

const form = getElement<HTMLFormElement>("#word-form");
const input = getElement<HTMLInputElement>("#word-input");
const list = getElement<HTMLUListElement>("#word-list");
const status = getElement<HTMLParagraphElement>("#word-status");
const submitButton = getElement<HTMLButtonElement>('#word-form button[type="submit"]');

let words = readWindowWords();

function renderWordList() {
  list.replaceChildren();

  words.forEach((word, index) => {
    const item = document.createElement("li");
    const label = document.createElement("span");
    const removeButton = document.createElement("button");

    label.textContent = word;
    removeButton.type = "button";
    removeButton.className = "word-remove";
    removeButton.textContent = "×";
    removeButton.setAttribute("aria-label", `Verwijder ${word}`);
    removeButton.addEventListener("click", () => {
      if (words.length === 1) {
        status.textContent = "Er moet minstens één woord in het raam staan.";
        return;
      }

      words = publishWindowWords(words.filter((_, wordIndex) => wordIndex !== index));
      renderWordList();
      status.textContent = `${word} is uit het raam verwijderd.`;
    });

    item.append(label, removeButton);
    list.append(item);
  });

  const isFull = words.length >= MAX_WORDS;
  input.disabled = isFull;
  input.placeholder = isFull ? "Het raam is vol" : "Typ een woord...";
  submitButton.disabled = isFull;
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const word = input.value.trim().toLocaleUpperCase();

  if (!word) {
    status.textContent = "Typ eerst een woord.";
    input.focus();
    return;
  }

  if (words.length >= MAX_WORDS) {
    status.textContent = `Er passen maximaal ${MAX_WORDS} woorden in het raam.`;
    return;
  }

  words = publishWindowWords([...words, word]);
  renderWordList();
  status.textContent = `${word} is aan het raam toegevoegd.`;
  input.value = "";
  input.focus();
});

words = publishWindowWords(words);
renderWordList();
