// client/script.js

// Get the current host and determine the server URL
const getServerUrl = () => {
  const hostname = window.location.hostname;
  
  // If running on localhost, use localhost for server
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return "http://localhost:3001";
  }
  
  // If running on network IP, use the same IP for server
  return `http://${hostname}:3001`;
};

const socket = io(getServerUrl());

let roomId = "";
let myId = "";
let currentPlayer = "";
let isMyTurn = false;
let gameStarted = false;

console.log("Connecting to server:", getServerUrl());

// Socket connection events
socket.on("connect", () => {
  myId = socket.id;
  console.log("✅ Connected to server:", myId);
  updateConnectionStatus("Connected", true);
});

socket.on("disconnect", () => {
  console.log("❌ Disconnected from server");
  updateConnectionStatus("Disconnected", false);
  gameStarted = false;
  isMyTurn = false;
});

socket.on("connect_error", (error) => {
  console.error("❌ Connection error:", error);
  updateConnectionStatus("Connection Failed", false);
  alert("Failed to connect to server. Please check if the server is running.");
});

socket.on("reconnect", () => {
  console.log("🔄 Reconnected to server");
  updateConnectionStatus("Reconnected", true);
});

// Game events
socket.on("roomJoined", (data) => {
  console.log("🚪 Joined room:", data);
  roomId = data.roomId;
  myId = data.playerId;
  updateGameStatus(`Joined room ${roomId}. Players: ${data.playerCount}`);
});

socket.on("playerJoined", (players) => {
  console.log("👥 Players in room:", players);
  updateGameStatus(`Players in Room: ${players.length}/4`);
  updatePlayerList(players);
});

socket.on("startGame", (data) => {
  console.log("🎮 Game started:", data);
  gameStarted = true;
  currentPlayer = data.currentPlayer;
  updateGameStatus("🎮 Game Started!");
  updateCurrentPlayer(data.currentPlayer);
  enableGameControls();
});

socket.on("yourTurn", () => {
  console.log("🎯 It's my turn!");
  isMyTurn = true;
  updateGameStatus("🎯 It's your turn! Roll the dice!");
  enableRollButton();
});

socket.on("nextTurn", (playerId) => {
  console.log("⏭️ Next turn:", playerId);
  currentPlayer = playerId;
  updateCurrentPlayer(playerId);
  
  if (playerId !== myId) {
    isMyTurn = false;
    updateGameStatus("⏳ Waiting for other player's turn...");
    disableRollButton();
  }
});

socket.on("diceRolled", ({ player, dice, roomId: diceRoomId }) => {
  console.log("🎲 Dice rolled:", { player, dice, room: diceRoomId });
  
  const playerName = player === myId ? "You" : "Opponent";
  updateDiceDisplay(dice);
  updateGameStatus(`🎲 ${playerName} rolled a ${dice}`);
  
  // Update dice result with image if available
  const diceResult = document.getElementById("diceResult");
  if (diceResult) {
    // Try to load dice image, fallback to text
    const diceImg = `<img src="assets/dice/dice-${dice}.png" width="60" height="60" alt="Dice ${dice}" onerror="this.style.display='none'" />`;
    diceResult.innerHTML = `🎲 ${playerName} rolled a ${dice}<br>${diceImg}`;
  }
});

socket.on("notYourTurn", (data) => {
  console.log("⚠️ Not your turn:", data);
  alert(data.message || "It's not your turn!");
});

// Game functions
function joinRoom() {
  const roomInput = document.getElementById("roomInput");
  const enteredRoomId = roomInput.value.trim();
  
  if (!enteredRoomId) {
    alert('Please enter a room ID');
    return;
  }
  
  roomId = enteredRoomId;
  console.log("🚪 Joining room:", roomId);
  socket.emit("joinRoom", roomId);
  
  // Show game area and hide lobby
  document.getElementById("gameArea").style.display = "block";
  document.querySelector('.lobby').style.display = "none";
  
  // Update UI
  updateGameStatus("Joining room...");
  disableRollButton();
}

function rollDice() {
  if (!gameStarted) {
    alert("Game hasn't started yet!");
    return;
  }
  
  if (!isMyTurn) {
    alert("It's not your turn!");
    return;
  }
  
  if (!roomId) {
    alert("Not in a room!");
    return;
  }
  
  console.log("🎲 Rolling dice for room:", roomId);
  socket.emit("rollDice", { roomId });
  
  // Disable button temporarily
  disableRollButton();
  updateGameStatus("🎲 Rolling dice...");
  
  // Re-enable after delay (will be disabled again if not player's turn)
  setTimeout(() => {
    if (isMyTurn) {
      enableRollButton();
    }
  }, 2000);
}

// UI helper functions
function updateConnectionStatus(status, isConnected) {
  const statusElement = document.getElementById("connectionStatus");
  if (statusElement) {
    statusElement.textContent = status;
    statusElement.className = isConnected ? "connected" : "disconnected";
  }
}

function updateGameStatus(message) {
  const statusElement = document.getElementById("status");
  if (statusElement) {
    statusElement.textContent = message;
  }
}

function updateCurrentPlayer(playerId) {
  const currentTurnElement = document.getElementById("currentTurn");
  if (currentTurnElement) {
    const playerName = playerId === myId ? "You" : "Opponent";
    currentTurnElement.textContent = playerName;
  }
  
  // Update player cards
  updatePlayerCards(playerId);
}

function updatePlayerCards(activePlayerId) {
  const playerCards = document.querySelectorAll('.player-card');
  playerCards.forEach(card => {
    card.classList.remove('active');
    if (card.dataset.playerId === activePlayerId) {
      card.classList.add('active');
    }
  });
}

function updatePlayerList(players) {
  const playerColors = ['red', 'green', 'blue', 'yellow'];
  const playerCards = document.querySelectorAll('.player-card');
  
  playerCards.forEach((card, index) => {
    const playerId = players[index];
    card.dataset.playerId = playerId || '';
    
    if (playerId) {
      const playerName = playerId === myId ? 'You' : `Player ${index + 1}`;
      card.children[1].textContent = playerName;
      card.style.opacity = '1';
    } else {
      card.children[1].textContent = 'Waiting...';
      card.style.opacity = '0.5';
    }
  });
}

function enableRollButton() {
  const rollButton = document.getElementById("rollButton");
  if (rollButton) {
    rollButton.disabled = false;
    rollButton.textContent = "🎲 Roll Dice";
  }
}

function disableRollButton() {
  const rollButton = document.getElementById("rollButton");
  if (rollButton) {
    rollButton.disabled = true;
    rollButton.textContent = "⏳ Wait...";
  }
}

function enableGameControls() {
  // Enable game-specific controls when game starts
  const gameControls = document.querySelectorAll('.game-control');
  gameControls.forEach(control => {
    control.disabled = false;
  });
}

function updateDiceDisplay(value) {
  const dice = document.getElementById('dice');
  if (!dice) return;
  
  dice.innerHTML = '';
  
  const diceFaces = {
    1: [0, 0, 0, 0, 1, 0, 0, 0, 0],
    2: [1, 0, 0, 0, 0, 0, 0, 0, 1],
    3: [1, 0, 0, 0, 1, 0, 0, 0, 1],
    4: [1, 0, 1, 0, 0, 0, 1, 0, 1],
    5: [1, 0, 1, 0, 1, 0, 1, 0, 1],
    6: [1, 0, 1, 1, 0, 1, 1, 0, 1]
  };

  const face = diceFaces[value] || diceFaces[1];
  for (let i = 0; i < 9; i++) {
    const dot = document.createElement('div');
    dot.className = face[i] ? 'dice-dot' : 'dice-dot hidden';
    dice.appendChild(dot);
  }
}

function createLudoBoard() {
  const board = document.getElementById("board");
  if (!board) return;
  
  board.innerHTML = '';

  const colorMatrix = [
    [-1, -1, -1, -1, -1, -1, 0, 0, 0, -1, -1, -1, -1, -1, -1],
    [-1, -1, -1, -1, -1, -1, 0, 2, 2, -1, -1, -1, -1, -1, -1],
    [-1, -1, -1, -1, -1, -1, 2, 2, 0, -1, -1, -1, -1, -1, -1],
    [-1, -1, -1, -1, -1, -1, 0, 2, 0, -1, -1, -1, -1, -1, -1],
    [-1, -1, -1, -1, -1, -1, 0, 2, 0, -1, -1, -1, -1, -1, -1],
    [-1, -1, -1, -1, -1, -1, 0, 2, 0, -1, -1, -1, -1, -1, -1],
    [0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 4, 0, 0],
    [0, 1, 1, 1, 1, 1, 0, 5, 0, 4, 4, 4, 4, 4, 0],
    [0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 4, 0],
    [-1, -1, -1, -1, -1, -1, 0, 3, 0, -1, -1, -1, -1, -1, -1],
    [-1, -1, -1, -1, -1, -1, 0, 3, 0, -1, -1, -1, -1, -1, -1],
    [-1, -1, -1, -1, -1, -1, 0, 3, 0, -1, -1, -1, -1, -1, -1],
    [-1, -1, -1, -1, -1, -1, 0, 3, 3, -1, -1, -1, -1, -1, -1],
    [-1, -1, -1, -1, -1, -1, 3, 3, 0, -1, -1, -1, -1, -1, -1],
    [-1, -1, -1, -1, -1, -1, 0, 0, 0, -1, -1, -1, -1, -1, -1]
  ];

  const safeCells = [
    [6, 2], [8, 1], [12, 6], [13, 8],
    [8, 12], [6, 13], [2, 8], [1, 6]
  ];

  const initPos = {
    R: [[1, 1], [1, 4], [4, 1], [4, 4]],
    G: [[10, 1], [13, 1], [10, 4], [13, 4]],
    B: [[1, 10], [4, 10], [1, 13], [4, 13]],
    Y: [[10, 10], [10, 13], [13, 10], [13, 13]]
  };

  const tokenColors = {
    R: '#e74c3c',
    G: '#2ecc71',
    B: '#3498db',
    Y: '#f1c40f'
  };

  // Create board cells
  for (let row = 0; row < 15; row++) {
    for (let col = 0; col < 15; col++) {
      const cell = document.createElement("div");
      cell.classList.add("cell");
      cell.dataset.row = row;
      cell.dataset.col = col;

      const val = colorMatrix[row][col];

      if (val === 0) cell.classList.add("white");
      else if (val === 1) cell.classList.add("red-home");
      else if (val === 2) cell.classList.add("green-home");
      else if (val === 3) cell.classList.add("yellow-home");
      else if (val === 4) cell.classList.add("blue-home");
      else if (val === 5) cell.classList.add("center");
      else cell.classList.add("blank");

      // Check for safe cells
      for (let [sr, sc] of safeCells) {
        if (row === sr && col === sc) {
          cell.classList.add("safe");
        }
      }

      board.appendChild(cell);
    }
  }

  // Add tokens to their initial positions
  for (let player in initPos) {
    initPos[player].forEach(([r, c], i) => {
      const index = r * 15 + c;
      const token = document.createElement('div');
      token.classList.add('token');
      token.style.backgroundColor = tokenColors[player];
      token.title = `${player}${i + 1}`;
      token.dataset.player = player;
      token.dataset.id = i + 1;
      token.dataset.row = r;
      token.dataset.col = c;
      
      // Add click handler for token
      token.addEventListener('click', handleTokenClick);
      
      if (board.children[index]) {
        board.children[index].appendChild(token);
      }
    });
  }
}

function handleTokenClick(event) {
  const token = event.target;
  const player = token.dataset.player;
  const tokenId = token.dataset.id;
  
  console.log(`Clicked token: ${player}${tokenId}`);
  
  // Add token selection logic here
  // For now, just highlight the selected token
  document.querySelectorAll('.token').forEach(t => t.classList.remove('selected'));
  token.classList.add('selected');
}

// Keyboard shortcuts
document.addEventListener('keydown', (event) => {
  if (event.code === 'Space' && isMyTurn && gameStarted) {
    event.preventDefault();
    rollDice();
  }
});

// Initialize game when page loads
window.addEventListener('DOMContentLoaded', () => {
  console.log("🎮 Initializing Ludo game...");
  createLudoBoard();
  updateDiceDisplay(1);
  disableRollButton();
  updateGameStatus("Connect to server to start playing");
});

// Handle page visibility change
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    console.log("📱 Page hidden");
  } else {
    console.log("📱 Page visible");
    // Reconnect if needed
    if (!socket.connected) {
      socket.connect();
    }
  }
});

// Export for debugging
window.gameDebug = {
  socket,
  roomId: () => roomId,
  myId: () => myId,
  gameStarted: () => gameStarted,
  isMyTurn: () => isMyTurn,
  currentPlayer: () => currentPlayer
};