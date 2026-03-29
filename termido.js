#!/usr/bin/env node

const blessed = require("blessed");
const fs = require("fs");
const os = require("os");
const path = require("path");

// ---------------- FILE ----------------
const DATA_DIR = path.join(os.homedir(), ".termido");
const FILE = path.join(DATA_DIR, "termido.json");

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadTodos() {
  try {
    const data = fs.readFileSync(FILE, "utf-8");
    const parsed = JSON.parse(data);
    return parsed.map(item => {
      if (typeof item === "string") return { text: item, done: false, priority: "none", createdAt: null };
      return {
        text: item.text || "",
        done: item.done || false,
        priority: item.priority || "none",
        createdAt: item.createdAt || null,
      };
    });
  } catch {
    return [];
  }
}

function saveTodos(list) {
  fs.writeFileSync(FILE, JSON.stringify(list, null, 2));
}

// ---------------- SCREEN ----------------
const screen = blessed.screen({
  smartCSR: true,
  title: "TermiDo",
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
let mode = "normal";
// modes: normal | add | edit | search | priority | filter
let inputBuffer = "";
let activeFilter = "all"; // all | high | medium | low | none | done | pending
let pendingPriorityFor = null; // "add" | "edit" — which flow triggered priority pick

// ---------------- PRIORITY HELPERS ----------------
const PRIORITIES = ["high", "medium", "low", "none"];

const PRIORITY_COLOR = {
  high:   "red",
  medium: "yellow",
  low:    "green",
  none:   "gray",
};

const PRIORITY_ICON = {
  high:   "!!",
  medium: "! ",
  low:   ". ",
  none:  "  ",
};

function timeAgo(iso) {
  if (!iso) return "no date";
  const diff = Math.floor((Date.now() - new Date(iso)) / 1000); // seconds
  if (diff < 60)                   return `${diff}s ago`;
  if (diff < 3600)                 return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400)                return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 7 * 86400)            return `${Math.floor(diff / 86400)}d ago`;
  if (diff < 30 * 86400)           return `${Math.floor(diff / (7 * 86400))}w ago`;
  if (diff < 365 * 86400)          return `${Math.floor(diff / (30 * 86400))}mo ago`;
  return `${Math.floor(diff / (365 * 86400))}y ago`;
}

// ---------------- HEADER ----------------
const header = blessed.box({
  top: 0,
  height: 3,
  width: "100%",
  content: "TermiDo",
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
  const done  = todos.filter(t => t.done).length;
  const pending = total - done;
  const high   = todos.filter(t => t.priority === "high").length;
  const medium = todos.filter(t => t.priority === "medium").length;
  const low    = todos.filter(t => t.priority === "low").length;

  const filterLabel = activeFilter === "all" ? "all" : activeFilter;

  sidebar.setContent(
    `\n Total:   ${total}\n` +
    ` ✔ Done:   ${done}\n` +
    ` ☐ Pending: ${pending}\n` +
    `\n── Priority ──\n` +
    ` !! High:   ${high}\n` +
    `  ! Medium: ${medium}\n` +
    `  . Low:    ${low}\n` +
    `\n── Filter ──\n` +
    ` F  [${filterLabel}]\n` +
    `\n── Keys ──\n` +
    ` /  Search\n` +
    ` A  Add\n` +
    ` E  Edit\n` +
    ` P  Priority\n` +
    ` Spc Toggle\n` +
    ` D  Delete\n` +
    ` Q  Quit`
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
  tags: true,
  scrollable: true,
  alwaysScroll: true,
  wrap: false,
  scrollbar: {
    ch: "█",
    style: { fg: "cyan" }
  },
  style: {
    selected: { bg: "blue", fg: "white" },
    border: { fg: "cyan" }
  },
  keys: true,
  mouse: true,
  items: []
});

// ---------------- PRIORITY PICKER OVERLAY ----------------
const priorityBox = blessed.list({
  top: "center",
  left: "center",
  width: 30,
  height: 7,
  border: { type: "line" },
  label: " Set Priority ",
  tags: true,
  keys: true,
  mouse: true,
  hidden: true,
  style: {
    selected: { bg: "blue", fg: "white" },
    border: { fg: "magenta" }
  },
  items: [
    "{red-fg}!! High{/}",
    "{yellow-fg} ! Medium{/}",
    "{green-fg} . Low{/}",
    "{gray-fg}   None{/}",
  ]
});

// ---------------- FILTER PICKER OVERLAY ----------------
const filterBox = blessed.list({
  top: "center",
  left: "center",
  width: 30,
  height: 13,
  border: { type: "line" },
  label: " Filter By ",
  tags: true,
  keys: true,
  mouse: true,
  hidden: true,
  style: {
    selected: { bg: "blue", fg: "white" },
    border: { fg: "cyan" }
  },
  items: [
    "  All",
    "{red-fg}!! High priority{/}",
    "{yellow-fg} ! Medium priority{/}",
    "{green-fg} . Low priority{/}",
    "     No priority",
    "  ✔ Done",
    "  ☐ Pending",
    "  Cancel",
  ]
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

function getVisibleBuffer(buf, maxWidth) {
  if (buf.length <= maxWidth) return buf;
  return "…" + buf.slice(-(maxWidth - 1));
}

function renderInputPanel() {
  const screenW = (screen.width && screen.width > 10) ? screen.width : 80;
  const panelWidth = Math.max(10, Math.floor(screenW * 0.75) - 6);

  if (mode === "normal") {
    setInputPanelMode("Ready", "gray",
      "↑↓ Nav | Spc Toggle | D Del | E Edit | P Priority | F Filter | / Search | A Add | Q Quit");
  } else if (mode === "add") {
    setInputPanelMode("Add Todo  [Enter] confirm  [Esc] cancel", "green",
      "> " + getVisibleBuffer(inputBuffer, panelWidth) + "█");
  } else if (mode === "edit") {
    setInputPanelMode("Edit Todo  [Enter] confirm  [Esc] cancel", "cyan",
      "> " + getVisibleBuffer(inputBuffer, panelWidth) + "█");
  } else if (mode === "search") {
    setInputPanelMode("Search  [Enter] jump  [Esc] cancel", "yellow",
      "/ " + getVisibleBuffer(inputBuffer, panelWidth) + "█");
  } else if (mode === "priority") {
    setInputPanelMode("Priority", "magenta", "↑↓ pick priority  [Enter] confirm  [Esc] cancel");
  } else if (mode === "filter") {
    setInputPanelMode("Filter", "cyan", "↑↓ pick filter  [Enter] apply  [Esc] cancel");
  }
  screen.render();
}

// ---------------- DATA HELPERS ----------------
function getActiveData() {
  const base = mode === "search" ? filteredTodos : todos;
  if (activeFilter === "all") return base;
  return base.filter(t => {
    if (activeFilter === "done")    return t.done;
    if (activeFilter === "pending") return !t.done;
    return t.priority === activeFilter;
  });
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

let lineToTodo = [];

function renderTodos() {
  const data = getActiveData();
  const screenW = (screen.width && screen.width > 10) ? screen.width : 80;
  // subtract: border(2) + scrollbar(1) + padding(2) + priority icon(3)
  const availWidth = Math.floor(screenW * 0.75) - 8;
  const textWidth  = Math.max(10, availWidth);

  const items = [];
  lineToTodo = [];

  const filterSuffix = activeFilter !== "all" ? ` [${activeFilter}]` : "";
  list.setLabel(` Todos${filterSuffix} `);

  if (!data.length) {
    items.push("  (No todos)");
    lineToTodo.push(0);
  } else {
    data.forEach((t, i) => {
      const doneIcon = t.done ? "✔" : "☐";
      const pri      = t.priority || "none";
      const priIcon  = PRIORITY_ICON[pri];
      const color    = PRIORITY_COLOR[pri];
      const lines    = wrapText(t.text, textWidth);

      const age = timeAgo(t.createdAt);
      const ageStr = age.padEnd(8);  // fixed width so text aligns
      lines.forEach((line, li) => {
        if (li === 0) {
          items.push(`{${color}-fg}${priIcon}{/} {gray-fg}${ageStr}{/} ${doneIcon} ${line}`);
        } else {
          items.push(`            ${line}`); // indent continuation lines
        }
        lineToTodo.push(i);
      });
    });
  }

  list.setItems(items);
  const displayLine = lineToTodo.indexOf(selectedIndex);
  list.select(displayLine >= 0 ? displayLine : 0);
}

function renderAll() {
  renderSidebar();
  renderTodos();
  renderInputPanel();
}

// ---------------- GLOBAL KEYPRESS ----------------
screen.on("keypress", (ch, key) => {
  if (mode === "normal" || mode === "priority" || mode === "filter") return;

  const k = key.name;

  if (k === "escape") {
    if (mode === "search") filteredTodos = [...todos];
    mode = "normal";
    inputBuffer = "";
    pendingPriorityFor = null;
    list.focus();
    renderAll();
    return;
  }

  if (k === "enter") {
    if (mode === "add") {
      const val = inputBuffer.trim();
      if (val) {
        const newTodo = {
          text: val,
          done: false,
          priority: "none",
          createdAt: new Date().toISOString(),
        };
        todos.push(newTodo);
        selectedIndex = todos.length - 1;
        saveTodos(todos);
        // after adding, open priority picker
        inputBuffer = "";
        mode = "priority";
        pendingPriorityFor = "add";
        priorityBox.show();
        priorityBox.select(3); // default to "none"
        priorityBox.focus();
        renderAll();
        screen.render();
        return;
      }
    } else if (mode === "edit") {
      const val = inputBuffer.trim();
      if (val) {
        todos[selectedIndex].text = val;
        saveTodos(todos);
      }
    } else if (mode === "search") {
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

  if (mode === "search") {
    filteredTodos = todos.filter(t =>
      t.text.toLowerCase().includes(inputBuffer.toLowerCase())
    );
    selectedIndex = 0;
    renderTodos();
  }

  renderInputPanel();
});

// ---------------- PRIORITY PICKER HANDLER ----------------
priorityBox.key("enter", () => {
  const i = priorityBox.selected;
  const picked = PRIORITIES[i]; // high=0 medium=1 low=2 none=3
  if (picked !== undefined) {
    todos[selectedIndex].priority = picked;
    saveTodos(todos);
  }
  priorityBox.hide();
  mode = "normal";
  pendingPriorityFor = null;
  list.focus();
  renderAll();
});

priorityBox.key("escape", () => {
  priorityBox.hide();
  mode = "normal";
  pendingPriorityFor = null;
  list.focus();
  renderAll();
});

// ---------------- FILTER PICKER HANDLER ----------------
const FILTER_VALUES = ["all", "high", "medium", "low", "none", "done", "pending", null];

filterBox.key("enter", () => {
  const picked = FILTER_VALUES[filterBox.selected];
  if (picked !== null) {
    activeFilter = picked;
    selectedIndex = 0;
  }
  filterBox.hide();
  mode = "normal";
  list.focus();
  renderAll();
});

filterBox.key("escape", () => {
  filterBox.hide();
  mode = "normal";
  list.focus();
  renderAll();
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

list.key("p", () => {
  if (mode !== "normal" || !todos.length) return;
  mode = "priority";
  const cur = PRIORITIES.indexOf(todos[selectedIndex].priority || "none");
  priorityBox.select(cur >= 0 ? cur : 3);
  priorityBox.show();
  priorityBox.focus();
  renderInputPanel();
  screen.render();
});

screen.key("f", () => {
  if (mode !== "normal") return;
  mode = "filter";
  const cur = FILTER_VALUES.indexOf(activeFilter);
  filterBox.select(cur >= 0 ? cur : 0);
  filterBox.show();
  filterBox.focus();
  renderInputPanel();
  screen.render();
});

list.key("space", () => {
  if (mode !== "normal" || !todos.length) return;
  const data = getActiveData();
  const real = todos.findIndex(t => t === data[selectedIndex]);
  if (real !== -1) {
    todos[real].done = !todos[real].done;
    saveTodos(todos);
  }
  renderAll();
});

list.key("d", () => {
  if (mode !== "normal" || !todos.length) return;
  const data = getActiveData();
  const real = todos.findIndex(t => t === data[selectedIndex]);
  if (real !== -1) todos.splice(real, 1);
  saveTodos(todos);
  if (selectedIndex >= getActiveData().length) selectedIndex = Math.max(0, getActiveData().length - 1);
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
  const data = getActiveData();
  if (selectedIndex < data.length - 1) selectedIndex++;
  renderTodos();
  screen.render();
});

// ---------------- BUILD ----------------
screen.append(header);
screen.append(sidebar);
screen.append(list);
screen.append(inputPanel);
screen.append(priorityBox);
screen.append(filterBox);

setImmediate(() => {
  renderAll();
  list.focus();
});