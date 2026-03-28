#!/usr/bin/env node

const blessed = require("blessed");
const fs = require("fs");
const os = require("os");
const path = require("path");

// ---------------- FILE ----------------
const DATA_DIR = path.join(os.homedir(), ".termix");
const FILE = path.join(DATA_DIR, "termix.json");

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

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
  height: 3,
  width: "100%",
  content: " Termix",
  align: "center",
  valign: "middle",
  border: { type: "line" },
  style: { bg: "#000", fg: "white" }
});

// ---------------- SIDEBAR ----------------
const sidebar = blessed.box({
  top: 3,
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
    `\nTotal:   ${total}\n✔ Done:   ${done}\n☐ Pending: ${pending}\n\n\n/ Search\nA Add\nSpace Toggle\nD Delete\nE Edit\nQ Quit`
  );
}

// ---------------- MAIN LIST ----------------
const list = blessed.list({
  top: 3,
  left: "25%",
  width: "75%",
  bottom: 4,
  border: { type: "line" },
  label: " Todos ",
  scrollable: true,
  alwaysScroll: true,
  wrap: false,
  scrollbar: {
    ch: "█",
    style: { fg: "cyan" }
  },
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
  style: { fg: "white" },
  wrap: false,
});

function setInputPanelMode(label, color, prompt) {
  inputPanel.setLabel(` ${label} `);
  inputPanel.style.border.fg = color;
  inputDisplay.setContent(prompt);
}

// always shows the tail of the buffer so the cursor (█) stays visible
function getVisibleBuffer(buf, maxWidth) {
  if (buf.length <= maxWidth) return buf;
  return "…" + buf.slice(-(maxWidth - 1));
}

function renderInputPanel() {
  const screenW = (screen.width && screen.width > 10) ? screen.width : 80;
  const panelWidth = Math.max(10, Math.floor(screenW * 0.75) - 6);

  if (mode === "normal") {
    setInputPanelMode("Ready", "gray", "↑↓/jk Navigate | Space Toggle | D Delete | E Edit | / Search | A Add | Q Quit");
  } else if (mode === "add") {
    setInputPanelMode("Add Todo  [Enter] confirm  [Esc] cancel", "green", "> " + getVisibleBuffer(inputBuffer, panelWidth) + "█");
  } else if (mode === "edit") {
    setInputPanelMode("Edit Todo  [Enter] confirm  [Esc] cancel", "cyan", "> " + getVisibleBuffer(inputBuffer, panelWidth) + "█");
  } else if (mode === "search") {
    setInputPanelMode("Search  [Enter] jump to item  [Esc] cancel", "yellow", "/ " + getVisibleBuffer(inputBuffer, panelWidth) + "█");
  }
  screen.render();
}

// ---------------- RENDER TODOS ----------------
function wrapText(text, maxWidth) {
  const words = text.split(" ");
  const lines = [];
  let current = "";
  for (const word of words) {
    if ((current + (current ? " " : "") + word).length > maxWidth) {
      if (current) lines.push(current);
      let w = word;
      while (w.length > maxWidth) {
        lines.push(w.slice(0, maxWidth));
        w = w.slice(maxWidth);
      }
      current = w;
    } else {
      current = current ? current + " " + word : word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

// maps each display line index back to its todo index
let lineToTodo = [];

function renderTodos() {
  const data = mode === "search" ? filteredTodos : todos;

  // safely get screen width, fallback to 80 if not ready yet
  const screenW = (screen.width && screen.width > 10) ? screen.width : 80;
  const availWidth = Math.floor(screenW * 0.75) - 5;
  const textWidth = Math.max(10, availWidth - 2); // never below 10

  const items = [];
  lineToTodo = [];

  if (!data.length) {
    items.push("(No todos)");
    lineToTodo.push(0);
  } else {
    data.forEach((t, i) => {
      const icon = t.done ? "✔" : "☐";
      const lines = wrapText(t.text, textWidth);
      lines.forEach((line, li) => {
        items.push((li === 0 ? icon : " ") + " " + line);
        lineToTodo.push(i);
      });
    });
  }

  list.setItems(items);

  // highlight the first display line belonging to selectedIndex
  const displayLine = lineToTodo.indexOf(selectedIndex);
  list.select(displayLine >= 0 ? displayLine : 0);
}

function renderAll() {
  renderSidebar();
  renderTodos();
  renderInputPanel();
}

// ---------------- GLOBAL KEYPRESS (capture typing) ----------------
screen.on("keypress", (ch, key) => {
  if (mode === "normal") return;

  const k = key.name;

  if (k === "escape") {
    if (mode === "search") {
      filteredTodos = [...todos];
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
      // find real index by object reference (filter keeps same refs)
      const matched = filteredTodos[selectedIndex];
      if (matched) {
        const realIdx = todos.findIndex(t => t === matched);
        selectedIndex = realIdx !== -1 ? realIdx : 0;
      }
      filteredTodos = [...todos];
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
    selectedIndex = 0; // reset to top of filtered results on each keystroke
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
  if (mode !== "normal" && mode !== "search") return;
  if (selectedIndex > 0) selectedIndex--;
  renderTodos();
  screen.render();
});

list.key(["down", "j"], () => {
  if (mode !== "normal" && mode !== "search") return;
  const data = mode === "search" ? filteredTodos : todos;
  if (selectedIndex < data.length - 1) selectedIndex++;
  renderTodos();
  screen.render();
});



// ---------------- BUILD ----------------
screen.append(header);
screen.append(sidebar);
screen.append(list);
screen.append(inputPanel);

// wait for screen to be fully initialized before first render
setImmediate(() => {
  renderAll();
  list.focus();
});