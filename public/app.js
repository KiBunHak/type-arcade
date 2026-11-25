let isRegisterMode = false;
let token = localStorage.getItem("token");
let currentUsername = localStorage.getItem("username");
let startTime = null;

const authSection = document.getElementById("auth-section");
const appSection = document.getElementById("app-section");
const userBar = document.getElementById("user-bar");
const authTitle = document.getElementById("auth-title");
const usernameInput = document.getElementById("username-input");
const emailInput = document.getElementById("email-input");
const passwordInput = document.getElementById("password-input");
const authSubmitBtn = document.getElementById("auth-submit-btn");
const authMessage = document.getElementById("auth-message");
const toggleLink = document.getElementById("toggle-auth-mode");
const togglePrompt = document.getElementById("toggle-prompt");

toggleLink.addEventListener("click", (e) => {
  e.preventDefault();
  isRegisterMode = !isRegisterMode;
  authTitle.textContent = isRegisterMode ? "Register" : "Login";
  authSubmitBtn.textContent = isRegisterMode ? "Create Account" : "Login";
  togglePrompt.textContent = isRegisterMode
    ? "Already have an account?"
    : "New here?";
  toggleLink.textContent = isRegisterMode ? "Login" : "Create an account";
  usernameInput.classList.toggle("hidden", !isRegisterMode);
  authMessage.textContent = "";
});

authSubmitBtn.addEventListener("click", async () => {
  const endpoint = isRegisterMode ? "/api/register" : "/api/login";
  const body = {
    email: emailInput.value.trim(),
    password: passwordInput.value,
    ...(isRegisterMode && { username: usernameInput.value.trim() }),
  };

  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) return (authMessage.textContent = data.error);

  saveLogin(data);
});

async function handleGoogleLogin(response) {
  const res = await fetch("/api/google-login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ credential: response.credential }),
  });
  const data = await res.json();
  if (!res.ok) return (authMessage.textContent = data.error);

  saveLogin(data);
}

function saveLogin(data) {
  token = data.token;
  currentUsername = data.username;
  localStorage.setItem("token", token);
  localStorage.setItem("username", currentUsername);
  showApp();
}

document.getElementById("logout-btn").addEventListener("click", () => {
  localStorage.clear();
  location.reload();
});

function selectGame(gameId) {
  document
    .getElementById("game-speed-test")
    .classList.toggle("hidden", gameId !== "speed-test");
  document
    .getElementById("game-word-blaster")
    .classList.toggle("hidden", gameId !== "word-blaster");
  document
    .getElementById("game-tic-tac-toe")
    .classList.toggle("hidden", gameId !== "tic-tac-toe");
  document
    .getElementById("game-chess")
    .classList.toggle("hidden", gameId !== "chess");

  document.querySelectorAll(".game-card").forEach((card) => {
    card.classList.toggle("active-card", card.dataset.game === gameId);
  });

  if (gameId === "tic-tac-toe") initTicTacToe();
  if (gameId === "chess") renderChessBoard();

  document
    .getElementById(`game-${gameId}`)
    .scrollIntoView({ behavior: "smooth" });
}

// --- Game 1: Speed Test ---
const sentences = [
  "the quick brown fox jumps over the lazy dog",
  "javascript and sql server power this arcade",
  "practice every day to boost your typing speed",
  "neon lights glow bright in the midnight city",
  "coding full stack apps is fun once it clicks",
];

const typingInput = document.getElementById("typing-input");
const targetEl = document.getElementById("target-sentence");
let currentSentence = "";

function loadNewSentence() {
  currentSentence = sentences[Math.floor(Math.random() * sentences.length)];
  targetEl.innerHTML = currentSentence
    .split("")
    .map(
      (char, i) => `<span class="${i === 0 ? "current" : ""}">${char}</span>`,
    )
    .join("");
  typingInput.value = "";
  startTime = null;
}

typingInput.addEventListener("input", async () => {
  if (!startTime) startTime = Date.now();
  const typed = typingInput.value;
  const spans = targetEl.querySelectorAll("span");

  spans.forEach((span, i) => {
    span.className = "";
    if (i < typed.length) {
      span.className =
        typed[i] === currentSentence[i] ? "correct" : "incorrect";
    } else if (i === typed.length) {
      span.className = "current";
    }
  });

  if (typed === currentSentence) {
    const minutes = (Date.now() - startTime) / 60000;
    const wpm = Math.round(currentSentence.split(" ").length / minutes);
    const pointsEarned = wpm * 2;

    document.getElementById("result-text").textContent =
      `Finished! ${wpm} WPM (+${pointsEarned} pts)`;
    loadNewSentence();
    await saveScore("Speed Test", wpm, 100, pointsEarned);
  }
});

// --- Game 2: Word Blaster ---
const blasterWords = [
  "arcade",
  "rocket",
  "server",
  "pixel",
  "turbo",
  "matrix",
  "keyboard",
  "laser",
  "syntax",
  "combo",
  "cyber",
  "sprint",
  "database",
  "victory",
  "blitz",
];
let wbTimer = null;
let wbTimeLeft = 30;
let wbWordsCleared = 0;
let wbCurrentWord = "";

const wbWordEl = document.getElementById("wb-word-display");
const wbInput = document.getElementById("wb-input");
const wbTimeEl = document.getElementById("wb-time");
const wbScoreEl = document.getElementById("wb-score");
const wbResultEl = document.getElementById("wb-result");

document.getElementById("wb-start-btn").addEventListener("click", () => {
  clearInterval(wbTimer);
  wbTimeLeft = 30;
  wbWordsCleared = 0;
  wbTimeEl.textContent = wbTimeLeft;
  wbScoreEl.textContent = 0;
  wbResultEl.textContent = "";
  wbInput.disabled = false;
  wbInput.value = "";
  wbInput.focus();
  nextBlasterWord();

  wbTimer = setInterval(async () => {
    wbTimeLeft--;
    wbTimeEl.textContent = wbTimeLeft;
    if (wbTimeLeft <= 0) {
      clearInterval(wbTimer);
      wbInput.disabled = true;
      wbWordEl.textContent = "Time's Up!";
      const wpm = wbWordsCleared * 2;
      const pointsEarned = wbWordsCleared * 15;
      wbResultEl.textContent = `Blasted ${wbWordsCleared} words! (${wpm} WPM, +${pointsEarned} pts)`;
      if (wbWordsCleared > 0) {
        await saveScore("Word Blaster", wpm, 100, pointsEarned);
      }
    }
  }, 1000);
});

function nextBlasterWord() {
  wbCurrentWord = blasterWords[Math.floor(Math.random() * blasterWords.length)];
  wbWordEl.textContent = wbCurrentWord;
}

wbInput.addEventListener("input", () => {
  if (wbInput.value.trim().toLowerCase() === wbCurrentWord) {
    wbWordsCleared++;
    wbScoreEl.textContent = wbWordsCleared * 15;
    wbInput.value = "";
    nextBlasterWord();
  }
});

// --- Game 3: Tic Tac Toe (vs Smart AI) ---
const tttBoardEl = document.getElementById("ttt-board");
const tttStatusEl = document.getElementById("ttt-status");
const winCombos = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

let tttBoard = Array(9).fill("");
let tttGameOver = false;
let tttAiThinking = false;

function initTicTacToe() {
  tttBoard = Array(9).fill("");
  tttGameOver = false;
  tttAiThinking = false;
  tttStatusEl.textContent = "Your turn (X)";
  renderTicTacToe();
}

function renderTicTacToe(winningCombo = []) {
  tttBoardEl.innerHTML = tttBoard
    .map((cell, i) => {
      const markClass =
        cell === "X" ? "x-mark taken" : cell === "O" ? "o-mark taken" : "";
      const winClass = winningCombo.includes(i) ? "win-cell" : "";
      return `<div class="ttt-cell ${markClass} ${winClass}" data-index="${i}">${cell}</div>`;
    })
    .join("");

  tttBoardEl.querySelectorAll(".ttt-cell").forEach((cellEl) => {
    cellEl.addEventListener("click", () =>
      handlePlayerMove(Number(cellEl.dataset.index)),
    );
  });
}

function checkWinner(board) {
  for (const combo of winCombos) {
    const [a, b, c] = combo;
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return { winner: board[a], combo };
    }
  }
  if (board.every((cell) => cell !== "")) return { winner: "DRAW", combo: [] };
  return null;
}

async function handlePlayerMove(index) {
  if (tttBoard[index] || tttGameOver || tttAiThinking) return;

  tttBoard[index] = "X";
  const result = checkWinner(tttBoard);
  if (result) return finishTicTacToe(result);

  renderTicTacToe();
  tttAiThinking = true;
  tttStatusEl.textContent = "AI is thinking...";

  setTimeout(() => {
    const aiMove = getAiMove();
    if (aiMove !== null) tttBoard[aiMove] = "O";
    tttAiThinking = false;

    const aiResult = checkWinner(tttBoard);
    if (aiResult) return finishTicTacToe(aiResult);

    tttStatusEl.textContent = "Your turn (X)";
    renderTicTacToe();
  }, 400);
}

function getAiMove() {
  const empty = tttBoard
    .map((v, i) => (v === "" ? i : null))
    .filter((i) => i !== null);
  if (!empty.length) return null;

  for (const mark of ["O", "X"]) {
    for (const idx of empty) {
      tttBoard[idx] = mark;
      const win = checkWinner(tttBoard);
      tttBoard[idx] = "";
      if (win && win.winner === mark) return idx;
    }
  }

  if (tttBoard[4] === "") return 4;
  return empty[Math.floor(Math.random() * empty.length)];
}

async function finishTicTacToe(result) {
  tttGameOver = true;
  renderTicTacToe(result.combo);

  if (result.winner === "X") {
    tttStatusEl.textContent = "You Win! (+50 pts)";
    await saveScore("Tic Tac Toe", 0, 100, 50);
  } else if (result.winner === "O") {
    tttStatusEl.textContent = "AI Wins! Try again.";
  } else {
    tttStatusEl.textContent = "It's a Draw! (+15 pts)";
    await saveScore("Tic Tac Toe", 0, 100, 15);
  }
}

document
  .getElementById("ttt-restart-btn")
  .addEventListener("click", initTicTacToe);

// --- Game 4: Chess (Bold Outlined SVG Pieces + vs AI / 2-Player) ---
const chessBoardEl = document.getElementById("chess-board");
const chessStatusEl = document.getElementById("chess-status");
const chessModeBtn = document.getElementById("chess-mode-btn");
const PIECE_VALUES = { p: 10, n: 30, b: 30, r: 50, q: 90, k: 900 };

function getPieceSvg(color, type) {
  const fill = color === "w" ? "#ffffff" : "#3a3f4b";
  const stroke = "#111111";
  const detail = color === "w" ? "#111111" : "#111111";

  const shapes = {
    p: `
      <circle cx="22.5" cy="14" r="6.5" fill="${fill}" stroke="${stroke}" stroke-width="2.6"/>
      <path d="M16 20 C14 27 12 31 10 36 L35 36 C33 31 31 27 29 20 Z" fill="${fill}" stroke="${stroke}" stroke-width="2.6" stroke-linejoin="round"/>
      <rect x="8.5" y="35.5" width="28" height="4.5" rx="2" fill="${fill}" stroke="${stroke}" stroke-width="2.6"/>
    `,
    r: `
      <path d="M10 10 H15 V14 H19.5 V10 H25.5 V14 H30 V10 H35 V18 L31 21 V33 L35 36 H10 L14 33 V21 L10 18 Z" fill="${fill}" stroke="${stroke}" stroke-width="2.6" stroke-linejoin="round"/>
      <rect x="8.5" y="35.5" width="28" height="4.5" rx="2" fill="${fill}" stroke="${stroke}" stroke-width="2.6"/>
      <line x1="14" y1="21" x2="31" y2="21" stroke="${detail}" stroke-width="2"/>
    `,
    n: `
      <path d="M13 36 C13 28 17 25 19 22 C15 22 11 22 10 18 C9 15 13 11 19 9 L21 6 L25 9 C31 11 35 17 34 27 L34 36 Z" fill="${fill}" stroke="${stroke}" stroke-width="2.6" stroke-linejoin="round"/>
      <circle cx="19" cy="14.5" r="1.6" fill="${detail}"/>
      <rect x="9" y="35.5" width="27" height="4.5" rx="2" fill="${fill}" stroke="${stroke}" stroke-width="2.6"/>
    `,
    b: `
      <circle cx="22.5" cy="8.5" r="3" fill="${fill}" stroke="${stroke}" stroke-width="2.4"/>
      <path d="M22.5 11.5 C15 16 14 24 16 30 L12 36 H33 L29 30 C31 24 30 16 22.5 11.5 Z" fill="${fill}" stroke="${stroke}" stroke-width="2.6" stroke-linejoin="round"/>
      <line x1="22.5" y1="17" x2="22.5" y2="24" stroke="${detail}" stroke-width="2.4" stroke-linecap="round"/>
      <line x1="19" y1="20.5" x2="26" y2="20.5" stroke="${detail}" stroke-width="2.4" stroke-linecap="round"/>
      <rect x="9" y="35.5" width="27" height="4.5" rx="2" fill="${fill}" stroke="${stroke}" stroke-width="2.6"/>
    `,
    q: `
      <circle cx="8" cy="14" r="3" fill="${fill}" stroke="${stroke}" stroke-width="2.4"/>
      <circle cx="17.5" cy="10" r="3" fill="${fill}" stroke="${stroke}" stroke-width="2.4"/>
      <circle cx="27.5" cy="10" r="3" fill="${fill}" stroke="${stroke}" stroke-width="2.4"/>
      <circle cx="37" cy="14" r="3" fill="${fill}" stroke="${stroke}" stroke-width="2.4"/>
      <path d="M9 17 L13 34 H32 L36 17 L28 24 L27 13 L22.5 23 L18 13 L17 24 Z" fill="${fill}" stroke="${stroke}" stroke-width="2.6" stroke-linejoin="round"/>
      <rect x="9.5" y="34" width="26" height="5.5" rx="2.5" fill="${fill}" stroke="${stroke}" stroke-width="2.6"/>
    `,
    k: `
      <line x1="22.5" y1="6" x2="22.5" y2="14" stroke="${stroke}" stroke-width="3.2" stroke-linecap="round"/>
      <line x1="18.5" y1="9.5" x2="26.5" y2="9.5" stroke="${stroke}" stroke-width="3.2" stroke-linecap="round"/>
      <path d="M22.5 15 C16 14 9 18 10 25 C11 30 14 33 14 34 H31 C31 33 34 30 35 25 C36 18 29 14 22.5 15 Z" fill="${fill}" stroke="${stroke}" stroke-width="2.6" stroke-linejoin="round"/>
      <path d="M22.5 15 V30" stroke="${detail}" stroke-width="2.2" stroke-linecap="round"/>
      <rect x="9.5" y="34" width="26" height="5.5" rx="2.5" fill="${fill}" stroke="${stroke}" stroke-width="2.6"/>
    `,
  };

  return `<svg viewBox="0 0 45 45" xmlns="http://www.w3.org/2000/svg">${shapes[type]}</svg>`;
}

let chessGame = typeof Chess !== "undefined" ? new Chess() : null;
let selectedSquare = null;
let chessVsAI = true;
let chessAiThinking = false;
let chessScoreSaved = false;

function renderChessBoard() {
  if (!chessGame) return;
  const board = chessGame.board();
  const files = ["a", "b", "c", "d", "e", "f", "g", "h"];
  const legalMoves = selectedSquare
    ? chessGame.moves({ square: selectedSquare, verbose: true })
    : [];

  let html = "";
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const squareName = files[c] + (8 - r);
      const piece = board[r][c];
      const isLight = (r + c) % 2 === 0;
      const isSelected = squareName === selectedSquare;
      const moveOption = legalMoves.find((m) => m.to === squareName);

      let classes = `chess-square ${isLight ? "light" : "dark"}`;
      if (isSelected) classes += " selected";
      if (moveOption) classes += piece ? " legal-capture" : " legal-move";

      const pieceHtml = piece
        ? `<span class="chess-piece">${getPieceSvg(piece.color, piece.type)}</span>`
        : "";

      html += `<div class="${classes}" data-square="${squareName}">${pieceHtml}</div>`;
    }
  }

  chessBoardEl.innerHTML = html;
  chessBoardEl.querySelectorAll(".chess-square").forEach((sq) => {
    sq.addEventListener("click", () => handleChessClick(sq.dataset.square));
  });

  updateChessStatus();
}

function handleChessClick(square) {
  if (!chessGame || chessGame.game_over() || chessAiThinking) return;

  if (selectedSquare) {
    const move = chessGame.move({
      from: selectedSquare,
      to: square,
      promotion: "q",
    });
    if (move) {
      selectedSquare = null;
      renderChessBoard();
      if (chessVsAI && !chessGame.game_over() && chessGame.turn() === "b") {
        chessAiThinking = true;
        chessStatusEl.textContent = "AI is thinking...";
        setTimeout(makeChessAiMove, 380);
      }
      return;
    }
  }

  const piece = chessGame.get(square);
  if (piece && piece.color === chessGame.turn()) {
    selectedSquare = square === selectedSquare ? null : square;
  } else {
    selectedSquare = null;
  }
  renderChessBoard();
}

function makeChessAiMove() {
  const moves = chessGame.moves({ verbose: true });
  if (!moves.length) {
    chessAiThinking = false;
    return;
  }

  let bestScore = -9999;
  let bestMoves = [];

  for (const move of moves) {
    chessGame.move(move);
    let score = evaluateChessBoard();
    chessGame.undo();

    if (score > bestScore) {
      bestScore = score;
      bestMoves = [move];
    } else if (score === bestScore) {
      bestMoves.push(move);
    }
  }

  const chosen = bestMoves[Math.floor(Math.random() * bestMoves.length)];
  chessGame.move(chosen);
  chessAiThinking = false;
  renderChessBoard();
}

function evaluateChessBoard() {
  if (chessGame.in_checkmate()) return chessGame.turn() === "w" ? 9999 : -9999;
  let total = 0;
  for (const row of chessGame.board()) {
    for (const piece of row) {
      if (!piece) continue;
      const val = PIECE_VALUES[piece.type] || 0;
      total += piece.color === "b" ? val : -val;
    }
  }
  return total;
}

async function updateChessStatus() {
  if (!chessGame) return;

  if (chessGame.in_checkmate()) {
    const winner = chessGame.turn() === "w" ? "Black" : "White";
    if (chessVsAI && winner === "White") {
      chessStatusEl.textContent = "Checkmate! You Win! (+100 pts)";
      if (!chessScoreSaved) {
        chessScoreSaved = true;
        await saveScore("Chess", 0, 100, 100);
      }
    } else {
      chessStatusEl.textContent = `Checkmate! ${winner} Wins!`;
    }
  } else if (chessGame.in_draw()) {
    chessStatusEl.textContent = "Draw! (+25 pts)";
    if (!chessScoreSaved) {
      chessScoreSaved = true;
      await saveScore("Chess", 0, 100, 25);
    }
  } else {
    const turnText = chessGame.turn() === "w" ? "White" : "Black";
    chessStatusEl.textContent = `${turnText} to move${chessGame.in_check() ? " (Check!)" : ""}`;
  }
}

document.getElementById("chess-restart-btn").addEventListener("click", () => {
  if (!chessGame) return;
  chessGame.reset();
  selectedSquare = null;
  chessAiThinking = false;
  chessScoreSaved = false;
  renderChessBoard();
});

document.getElementById("chess-undo-btn").addEventListener("click", () => {
  if (!chessGame || chessAiThinking) return;
  chessGame.undo();
  if (chessVsAI && chessGame.turn() === "b") chessGame.undo();
  selectedSquare = null;
  chessScoreSaved = false;
  renderChessBoard();
});

chessModeBtn.addEventListener("click", () => {
  chessVsAI = !chessVsAI;
  chessModeBtn.textContent = chessVsAI ? "Mode: vs AI" : "Mode: 2-Player";
  chessGame.reset();
  selectedSquare = null;
  chessAiThinking = false;
  chessScoreSaved = false;
  renderChessBoard();
});

// --- 60 Built-In Avatars & Profile Modal ---
const avatarStyles = [
  "bottts-neutral",
  "adventurer",
  "fun-emoji",
  "pixel-art",
  "avataaars",
  "thumbs",
];
const avatarSeeds = [
  "Nova",
  "Riku",
  "Pixel",
  "Turbo",
  "Blaze",
  "Echo",
  "Cyber",
  "Kairo",
  "Luna",
  "Vex",
];
const AVATAR_LIST = avatarStyles.flatMap((style) =>
  avatarSeeds.map(
    (seed) => `https://api.dicebear.com/9.x/${style}/svg?seed=${style}-${seed}`,
  ),
);

let currentProfile = null;
let selectedAvatarUrl = AVATAR_LIST[0];

const profileModal = document.getElementById("profile-modal");
const editUsernameInput = document.getElementById("edit-username-input");
const bioInput = document.getElementById("bio-input");
const avatarGrid = document.getElementById("avatar-grid");
const profileModalError = document.getElementById("profile-modal-error");

function getPlayerRank(bestWpm) {
  if (bestWpm >= 90) return "🔥 Typing Legend";
  if (bestWpm >= 65) return "⚡ Speed Demon";
  if (bestWpm >= 40) return "⌨️ Keyboard Pro";
  if (bestWpm >= 20) return "🎯 Rising Typist";
  return "🌱 Rookie";
}

function openProfileModal() {
  editUsernameInput.value = currentProfile?.Username || currentUsername || "";
  bioInput.value = currentProfile?.Bio || "";
  selectedAvatarUrl = currentProfile?.AvatarUrl || AVATAR_LIST[0];
  profileModalError.textContent = "";

  avatarGrid.innerHTML = AVATAR_LIST.map(
    (url) => `
      <div class="avatar-option ${url === selectedAvatarUrl ? "selected" : ""}" data-url="${url}">
        <img src="${url}" alt="avatar" loading="lazy" />
      </div>`,
  ).join("");

  avatarGrid.querySelectorAll(".avatar-option").forEach((el) => {
    el.addEventListener("click", () => {
      selectedAvatarUrl = el.dataset.url;
      avatarGrid
        .querySelectorAll(".avatar-option")
        .forEach((o) => o.classList.remove("selected"));
      el.classList.add("selected");
    });
  });

  profileModal.classList.remove("hidden");
}

document
  .getElementById("edit-profile-btn")
  .addEventListener("click", openProfileModal);
document
  .getElementById("profile-avatar")
  .addEventListener("click", openProfileModal);
document
  .getElementById("close-modal-btn")
  .addEventListener("click", () => profileModal.classList.add("hidden"));
document
  .getElementById("cancel-profile-btn")
  .addEventListener("click", () => profileModal.classList.add("hidden"));

document
  .getElementById("save-profile-btn")
  .addEventListener("click", async () => {
    profileModalError.textContent = "";
    const res = await fetch("/api/profile", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        username: editUsernameInput.value,
        bio: bioInput.value,
        avatarUrl: selectedAvatarUrl,
      }),
    });
    const data = await res.json();

    if (!res.ok) {
      profileModalError.textContent = data.error || "Could not update profile.";
      return;
    }

    if (data.token) {
      token = data.token;
      localStorage.setItem("token", token);
    }
    if (data.username) {
      currentUsername = data.username;
      localStorage.setItem("username", currentUsername);
      document.getElementById("welcome-text").textContent =
        `Hi, ${currentUsername}`;
    }

    profileModal.classList.add("hidden");
    loadDashboard();
  });

// --- API Helpers & Dashboard ---
async function saveScore(gameMode, wpm, accuracy, pointsEarned) {
  await fetch("/api/scores", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ gameMode, wpm, accuracy, pointsEarned }),
  });
  loadDashboard();
}

async function loadDashboard() {
  const res = await fetch("/api/dashboard", {
    headers: { Authorization: `Bearer ${token}` },
  });
  const { profile, leaderboard, history } = await res.json();

  if (profile) {
    currentProfile = profile;
    const avatarUrl = profile.AvatarUrl || AVATAR_LIST[0];
    document.getElementById("profile-avatar").innerHTML =
      `<img src="${avatarUrl}" alt="${profile.Username}" />`;
    document.getElementById("profile-username").textContent = profile.Username;
    document.getElementById("profile-rank").textContent = getPlayerRank(
      profile.BestWPM,
    );
    document.getElementById("profile-bio").textContent =
      profile.Bio || "No bio yet — click Edit Profile to add one!";
    document.getElementById("stat-points").textContent = profile.TotalPoints;
    document.getElementById("stat-wpm").textContent = profile.BestWPM;
    document.getElementById("stat-games").textContent = profile.GamesPlayed;
  }

  document.getElementById("leaderboard-list").innerHTML = leaderboard
    .map(
      (p) =>
        `<li><strong>${p.Username}</strong> — ${p.TotalPoints} pts (Best: ${p.BestWPM} WPM)</li>`,
    )
    .join("");

  document.getElementById("history-list").innerHTML = history.length
    ? history
        .map((h) =>
          h.WPM > 0
            ? `<li>${h.GameMode}: ${h.WPM} WPM (+${h.PointsEarned} pts)</li>`
            : `<li>${h.GameMode}: Victory/Draw (+${h.PointsEarned} pts)</li>`,
        )
        .join("")
    : `<li class="muted">No games played yet — scroll down to start!</li>`;
}

function showApp() {
  authSection.classList.add("hidden");
  appSection.classList.remove("hidden");
  userBar.classList.remove("hidden");
  document.getElementById("welcome-text").textContent =
    `Hi, ${currentUsername}`;
  loadNewSentence();
  initTicTacToe();
  renderChessBoard();
  loadDashboard();
}

if (token) showApp();
