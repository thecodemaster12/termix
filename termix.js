#!/usr/bin/env node

const blessed = require("blessed");
const fs = require("fs");

const FILE = "todos.json";

// ---------------- FILE ----------------
function loadTodos() {
  try {
    const data = fs.readFileSync(FILE, "utf-8");
    const parsed = JSON.parse(data);
    return parsed.map(item =>
      typeof item === "string"
        ? { text: item, done: false }
        : item
    );
  } catch {
    return [];
  }
}

function saveTodos(todos) {
  fs.writeFileSync(FILE, JSON.stringify(todos, null, 2));
}

// ---------------- SCREEN ----------------
const screen = blessed.screen({
  smartCSR: true,
  title: "Todo Dashboard",
  terminal: "xterm-256color"
});

screen.key(["q", "C-c"], () => {
  screen.destroy();
  process.exit(0);
});

// ---------------- STATE ----------------
let todos = loadTodos();
let filteredTodos = [...todos];
let selectedIndex = 0;
let mode = "normal"; // "normal" | "add" | "edit" | "search"
let inputBuffer = "";

// ---------------- HEADER ----------------
const header = blessed.box({
  top: 0,
  height: 1,
  width: "100%",
  content: " Termix",
  style: { bg: "#999", fg: "white" }
});

// ---------------- SIDEBAR ----------------
const sidebar = blessed.box({
  top: 1,
  left: 0,
  width: "25%",
  bottom: 0,
  border: { type: "line" },
  label: " Stats ",
  style: { border: { fg: "yellow" } }
});

function renderSidebar() {
  const total = todos.length;
  const done = todos.filter(t => t.done).length;
  const pending = total - done;
  sidebar.setContent(
    `Total:   ${total}\n\n✔ Done:   ${done}\n\n☐ Pending: ${pending}\n\n\n/ Search\nA Add\nSpace Toggle\nD Delete\nE Edit\nQ Quit`
  );
}

// ---------------- MAIN LIST ----------------
const list = blessed.list({
  top: 1,
  left: "25%",
  width: "75%",
  bottom: 4,           // leave room for the input panel at bottom
  border: { type: "line" },
  label: " Todos ",
  style: {
    selected: { bg: "green", fg: "black" },
    border: { fg: "cyan" }
  },
  keys: true,
  mouse: true,
  items: []
});

// ---------------- BOTTOM INPUT PANEL ----------------
const inputPanel = blessed.box({
  bottom: 0,
  left: "25%",
  width: "75%",
  height: 4,
  border: { type: "line" },
  label: " Ready ",
  style: { border: { fg: "gray" } }
});

const inputDisplay = blessed.text({
  parent: inputPanel,
  top: 0,
  left: 1,
  right: 1,
  height: 1,
  content: "",
  style: { fg: "white" }
});

function setInputPanelMode(label, color, prompt) {
  inputPanel.setLabel(` ${label} `);
  inputPanel.style.border.fg = color;
  inputDisplay.setContent(prompt);
}

function renderInputPanel() {
  if (mode === "normal") {
    setInputPanelMode("Ready", "gray", "↑↓/jk Navigate | Space Toggle | D Delete | E Edit | / Search | A Add | Q Quit");
  } else if (mode === "add") {
    setInputPanelMode("Add Todo  [Enter] confirm  [Esc] cancel", "green", "> " + inputBuffer + "█");
  } else if (mode === "edit") {
    setInputPanelMode("Edit Todo  [Enter] confirm  [Esc] cancel", "cyan", "> " + inputBuffer + "█");
  } else if (mode === "search") {
    setInputPanelMode("Search  [Enter/Esc] done", "yellow", "/ " + inputBuffer + "█");
  }
  screen.render();
}

// ---------------- RENDER TODOS ----------------
function renderTodos() {
  const data = mode === "search" ? filteredTodos : todos;
  const items = data.length
    ? data.map(t => `${t.done ? "✔" : "☐"} ${t.text}`)
    : ["(No todos)"];
  list.setItems(items);
  list.select(selectedIndex);
}

function renderAll() {
  renderSidebar();
  renderTodos();
  renderInputPanel();
}

// ---------------- GLOBAL KEYPRESS (capture typing) ----------------
screen.on("keypress", (ch, key) => {
  // Let q/C-c still work in normal mode (handled above via screen.key)
  if (mode === "normal") return;

  const k = key.name;

  if (k === "escape") {
    if (mode === "search") {
      filteredTodos = [...todos];
      inputBuffer = "";
    }
    mode = "normal";
    inputBuffer = "";
    list.focus();
    renderAll();
    return;
  }

  if (k === "enter") {
    if (mode === "add") {
      const val = inputBuffer.trim();
      if (val) {
        todos.push({ text: val, done: false });
        selectedIndex = todos.length - 1;
        saveTodos(todos);
      }
    } else if (mode === "edit") {
      const val = inputBuffer.trim();
      if (val) {
        todos[selectedIndex].text = val;
        saveTodos(todos);
      }
    } else if (mode === "search") {
      // find the highlighted filtered item's real index in todos
      const matched = filteredTodos[selectedIndex];
      if (matched) {
        selectedIndex = todos.indexOf(matched);
        if (selectedIndex === -1) selectedIndex = 0;
      }
      filteredTodos = [...todos];
      mode = "normal";
      inputBuffer = "";
      list.focus();
      renderAll();
      return;
    }
    mode = "normal";
    inputBuffer = "";
    list.focus();
    renderAll();
    return;
  }

  if (k === "backspace") {
    inputBuffer = inputBuffer.slice(0, -1);
  } else if (ch && !key.ctrl && !key.meta) {
    inputBuffer += ch;
  }

  // live filter while searching
  if (mode === "search") {
    filteredTodos = todos.filter(t =>
      t.text.toLowerCase().includes(inputBuffer.toLowerCase())
    );
    selectedIndex = 0;
    renderTodos();
  }

  renderInputPanel();
});

// ---------------- NORMAL MODE KEYS ----------------
screen.key("a", () => {
  if (mode !== "normal") return;
  mode = "add";
  inputBuffer = "";
  renderInputPanel();
});

list.key("e", () => {
  if (mode !== "normal" || !todos.length) return;
  mode = "edit";
  inputBuffer = todos[selectedIndex].text;
  renderInputPanel();
});

screen.key("/", () => {
  if (mode !== "normal") return;
  mode = "search";
  inputBuffer = "";
  filteredTodos = [...todos];
  renderInputPanel();
});

list.key("space", () => {
  if (mode !== "normal" || !todos.length) return;
  todos[selectedIndex].done = !todos[selectedIndex].done;
  saveTodos(todos);
  renderAll();
});

list.key("d", () => {
  if (mode !== "normal" || !todos.length) return;
  todos.splice(selectedIndex, 1);
  saveTodos(todos);
  if (selectedIndex >= todos.length) selectedIndex = Math.max(0, todos.length - 1);
  renderAll();
});

// ---------------- NAV ----------------
list.key(["up", "k"], () => {
  if (mode !== "normal") return;
  if (selectedIndex > 0) selectedIndex--;
  renderTodos();
  screen.render();
});

list.key(["down", "j"], () => {
  if (mode !== "normal") return;
  const data = todos;
  if (selectedIndex < data.length - 1) selectedIndex++;
  renderTodos();
  screen.render();
});

// ---------------- BUILD ----------------
screen.append(header);
screen.append(sidebar);
screen.append(list);
screen.append(inputPanel);

renderAll();
list.focus();