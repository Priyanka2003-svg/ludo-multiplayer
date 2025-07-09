// Enhanced server/index.js
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const {
  createOrJoinRoom,
  getCurrentTurnPlayer,
  nextTurn,
  removePlayer,
  getRoomPlayers,
  moveToken,
  getRoomState,
  canMoveToken,
  getValidMoves
} = require("./rooms");

const app = express();
app.use(cors());
app.use(express.static('public')); // Serve static files

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.on("joinRoom", (roomId) => {
    console.log(`Player ${socket.id} joining room ${roomId}`);
    const roomData = createOrJoinRoom(roomId, socket.id);
    socket.join(roomId);
    
    // Send updated room state to all players
    io.to(roomId).emit("roomUpdate", roomData);
    
    // Send room info to the joining player
    socket.emit("roomJoined", {
      roomId: roomId,
      playerId: socket.id,
      ...roomData
    });

    // Start game if 2+ players joined
    if (roomData.players.length >= 2) {
      const currentPlayer = getCurrentTurnPlayer(roomId);
      console.log(`Starting game in room ${roomId} with ${roomData.players.length} players`);
      io.to(roomId).emit("gameStarted", {
        currentPlayer: currentPlayer,
        gameState: getRoomState(roomId)
      });
      io.to(currentPlayer).emit("yourTurn");
    }
  });

  socket.on("rollDice", ({ roomId }) => {
    const dice = Math.floor(Math.random() * 6) + 1;
    const currentPlayer = getCurrentTurnPlayer(roomId);

    if (socket.id !== currentPlayer) {
      socket.emit("error", { message: "It's not your turn!" });
      return;
    }

    console.log(`Player ${socket.id} rolled dice: ${dice} in room ${roomId}`);

    // Get valid moves for this player
    const validMoves = getValidMoves(roomId, socket.id, dice);
    
    io.to(roomId).emit("diceRolled", {
      player: socket.id,
      dice: dice,
      validMoves: validMoves
    });

    // If no valid moves, automatically pass turn
    if (validMoves.length === 0) {
      setTimeout(() => {
        const nextPlayer = nextTurn(roomId);
        io.to(roomId).emit("turnChanged", { 
          currentPlayer: nextPlayer,
          message: "No valid moves available"
        });
        if (nextPlayer) {
          io.to(nextPlayer).emit("yourTurn");
        }
      }, 2000);
    }
  });

  socket.on("moveToken", ({ roomId, tokenId, steps }) => {
    const currentPlayer = getCurrentTurnPlayer(roomId);
    
    if (socket.id !== currentPlayer) {
      socket.emit("error", { message: "It's not your turn!" });
      return;
    }

    const moveResult = moveToken(roomId, socket.id, tokenId, steps);
    
    if (moveResult.success) {
      // Broadcast the move to all players
      io.to(roomId).emit("tokenMoved", {
        player: socket.id,
        tokenId: tokenId,
        newPosition: moveResult.newPosition,
        capturedToken: moveResult.capturedToken,
        reachedHome: moveResult.reachedHome
      });

      // Check if player gets another turn (rolled 6 or captured token)
      const getAnotherTurn = steps === 6 || moveResult.capturedToken;
      
      if (!getAnotherTurn) {
        // Move to next turn
        setTimeout(() => {
          const nextPlayer = nextTurn(roomId);
          io.to(roomId).emit("turnChanged", { currentPlayer: nextPlayer });
          if (nextPlayer) {
            io.to(nextPlayer).emit("yourTurn");
          }
        }, 1000);
      } else {
        // Same player gets another turn
        socket.emit("yourTurn");
      }
    } else {
      socket.emit("error", { message: moveResult.error });
    }
  });

  socket.on("disconnect", () => {
    console.log("Disconnected:", socket.id);
    removePlayer(socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Ludo Server running on port ${PORT}`);
  console.log(`📍 Local: http://localhost:${PORT}`);
  console.log(`🌐 Network: http://[your-ip]:${PORT}`);
});

// Enhanced rooms.js with token movement logic
const rooms = {};

// Ludo board configuration
const BOARD_SIZE = 15;
const TOTAL_STEPS = 56; // Total steps to complete the game

// Define the path for each color
const PATHS = {
  red: generatePath('red'),
  green: generatePath('green'),
  blue: generatePath('blue'),
  yellow: generatePath('yellow')
};

function generatePath(color) {
  // This is a simplified path generation
  // In a real implementation, you'd define the exact path coordinates
  const path = [];
  
  // Starting positions for each color
  const startPositions = {
    red: [6, 1],
    green: [1, 8],
    blue: [8, 13],
    yellow: [13, 6]
  };
  
  // Add path coordinates (simplified for demo)
  const start = startPositions[color];
  for (let i = 0; i < TOTAL_STEPS; i++) {
    // This is a placeholder - you'd implement actual path coordinates
    path.push([start[0] + (i % 15), start[1] + Math.floor(i / 15)]);
  }
  
  return path;
}

function createOrJoinRoom(roomId, socketId) {
  if (!rooms[roomId]) {
    rooms[roomId] = {
      players: [],
      turnIndex: 0,
      gameStarted: false,
      createdAt: new Date(),
      tokens: initializeTokens(),
      lastDiceRoll: null
    };
  }

  const room = rooms[roomId];
  
  if (room.players.includes(socketId)) {
    return {
      players: room.players,
      playerCount: room.players.length,
      tokens: room.tokens,
      gameStarted: room.gameStarted
    };
  }
  
  if (room.players.length < 4) {
    room.players.push(socketId);
    console.log(`Player ${socketId} joined room ${roomId}. Total players: ${room.players.length}`);
  }

  return {
    players: room.players,
    playerCount: room.players.length,
    tokens: room.tokens,
    gameStarted: room.gameStarted
  };
}

function initializeTokens() {
  const colors = ['red', 'green', 'blue', 'yellow'];
  const tokens = {};
  
  colors.forEach(color => {
    tokens[color] = [];
    for (let i = 0; i < 4; i++) {
      tokens[color].push({
        id: i,
        position: -1, // -1 means in home base
        isInPlay: false,
        isHome: false // reached final destination
      });
    }
  });
  
  return tokens;
}

function getCurrentTurnPlayer(roomId) {
  const room = rooms[roomId];
  if (!room || room.players.length === 0) return null;
  return room.players[room.turnIndex];
}

function nextTurn(roomId) {
  const room = rooms[roomId];
  if (!room || room.players.length === 0) return null;
  
  room.turnIndex = (room.turnIndex + 1) % room.players.length;
  return getCurrentTurnPlayer(roomId);
}

function getPlayerColor(roomId, playerId) {
  const room = rooms[roomId];
  if (!room) return null;
  
  const playerIndex = room.players.indexOf(playerId);
  const colors = ['red', 'green', 'blue', 'yellow'];
  return colors[playerIndex] || null;
}

function getValidMoves(roomId, playerId, diceValue) {
  const room = rooms[roomId];
  if (!room) return [];
  
  const playerColor = getPlayerColor(roomId, playerId);
  if (!playerColor) return [];
  
  const validMoves = [];
  const playerTokens = room.tokens[playerColor];
  
  playerTokens.forEach((token, index) => {
    if (canMoveToken(roomId, playerId, index, diceValue)) {
      validMoves.push({
        tokenId: index,
        currentPosition: token.position,
        newPosition: token.position + diceValue
      });
    }
  });
  
  return validMoves;
}

function canMoveToken(roomId, playerId, tokenId, steps) {
  const room = rooms[roomId];
  if (!room) return false;
  
  const playerColor = getPlayerColor(roomId, playerId);
  if (!playerColor) return false;
  
  const token = room.tokens[playerColor][tokenId];
  if (!token) return false;
  
  // Token is in home base
  if (token.position === -1) {
    return steps === 6; // Can only move out with a 6
  }
  
  // Token is already home
  if (token.isHome) return false;
  
  // Check if move would go beyond home
  const newPosition = token.position + steps;
  if (newPosition > TOTAL_STEPS) return false;
  
  return true;
}

function moveToken(roomId, playerId, tokenId, steps) {
  const room = rooms[roomId];
  if (!room) return { success: false, error: "Room not found" };
  
  const playerColor = getPlayerColor(roomId, playerId);
  if (!playerColor) return { success: false, error: "Player not found" };
  
  if (!canMoveToken(roomId, playerId, tokenId, steps)) {
    return { success: false, error: "Invalid move" };
  }
  
  const token = room.tokens[playerColor][tokenId];
  let capturedToken = null;
  let reachedHome = false;
  
  // Move token out of home base
  if (token.position === -1) {
    token.position = 0;
    token.isInPlay = true;
  } else {
    token.position += steps;
  }
  
  // Check if token reached home
  if (token.position >= TOTAL_STEPS) {
    token.position = TOTAL_STEPS;
    token.isHome = true;
    reachedHome = true;
  }
  
  // Check for captures (simplified logic)
  if (token.isInPlay && !reachedHome) {
    // Check if any opponent token is at the same position
    Object.keys(room.tokens).forEach(color => {
      if (color !== playerColor) {
        room.tokens[color].forEach((opponentToken, index) => {
          if (opponentToken.position === token.position && opponentToken.isInPlay) {
            // Capture the opponent token
            opponentToken.position = -1;
            opponentToken.isInPlay = false;
            capturedToken = { color, tokenId: index };
          }
        });
      }
    });
  }
  
  return {
    success: true,
    newPosition: token.position,
    capturedToken,
    reachedHome
  };
}

function getRoomPlayers(roomId) {
  const room = rooms[roomId];
  return room ? room.players : [];
}

function getRoomState(roomId) {
  const room = rooms[roomId];
  if (!room) return null;
  
  return {
    players: room.players,
    currentPlayer: getCurrentTurnPlayer(roomId),
    tokens: room.tokens,
    gameStarted: room.gameStarted
  };
}

function removePlayer(socketId) {
  for (const roomId in rooms) {
    const room = rooms[roomId];
    const index = room.players.indexOf(socketId);
    
    if (index !== -1) {
      room.players.splice(index, 1);
      console.log(`Player ${socketId} removed from room ${roomId}`);
      
      if (room.turnIndex >= room.players.length) {
        room.turnIndex = 0;
      }
      
      if (room.players.length === 0) {
        delete rooms[roomId];
        console.log(`Room ${roomId} deleted (empty)`);
      }
      
      break;
    }
  }
}

module.exports = {
  createOrJoinRoom,
  getCurrentTurnPlayer,
  nextTurn,
  removePlayer,
  getRoomPlayers,
  getRoomState,
  moveToken,
  canMoveToken,
  getValidMoves
};

// Enhanced client script.js
const getServerUrl = () => {
  const hostname = window.location.hostname;
  const port = 3000; // Make sure this matches your server port
  
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return `http://localhost:${port}`;
  }
  
  return `http://${hostname}:${port}`;
};

const socket = io(getServerUrl());

let roomId = "";
let myId = "";
let myColor = "";
let currentPlayer = "";
let isMyTurn = false;
let gameStarted = false;
let lastDiceRoll = null;
let validMoves = [];

// Connection events
socket.on("connect", () => {
  myId = socket.id;
  console.log("✅ Connected to server:", myId);
  updateStatus("Connected to server");
});

socket.on("disconnect", () => {
  console.log("❌ Disconnected from server");
  updateStatus("Disconnected from server");
});

socket.on("connect_error", (error) => {
  console.error("❌ Connection error:", error);
  updateStatus("Connection failed - check server");
});

// Game events
socket.on("roomJoined", (data) => {
  roomId = data.roomId;
  myId = data.playerId;
  
  // Determine player color based on position
  const colors = ['red', 'green', 'blue', 'yellow'];
  const playerIndex = data.players.indexOf(myId);
  myColor = colors[playerIndex];
  
  updateStatus(`Joined room ${roomId} as ${myColor} player`);
  updateGameBoard(data.tokens);
});

socket.on("roomUpdate", (data) => {
  updateStatus(`Players: ${data.playerCount}/4`);
  updateGameBoard(data.tokens);
});

socket.on("gameStarted", (data) => {
  gameStarted = true;
  currentPlayer = data.currentPlayer;
  updateStatus("Game started!");
  updateGameBoard(data.gameState.tokens);
  updateCurrentPlayer(currentPlayer);
});

socket.on("yourTurn", () => {
  isMyTurn = true;
  updateStatus("Your turn! Roll the dice!");
  document.getElementById("rollButton").disabled = false;
  clearValidMoves();
});

socket.on("diceRolled", (data) => {
  lastDiceRoll = data.dice;
  validMoves = data.validMoves;
  
  updateDiceDisplay(data.dice);
  updateStatus(`Rolled ${data.dice}. ${validMoves.length > 0 ? 'Select a token to move' : 'No valid moves'}`);
  
  if (data.player === myId) {
    highlightValidMoves();
  }
});

socket.on("tokenMoved", (data) => {
  updateStatus(`Token moved to position ${data.newPosition}`);
  
  if (data.capturedToken) {
    updateStatus(`Captured ${data.capturedToken.color} token!`);
  }
  
  if (data.reachedHome) {
    updateStatus("Token reached home!");
  }
  
  // Update board with new token positions
  // This would be implemented based on your board structure
});

socket.on("turnChanged", (data) => {
  currentPlayer = data.currentPlayer;
  isMyTurn = (currentPlayer === myId);
  updateCurrentPlayer(currentPlayer);
  clearValidMoves();
  
  if (!isMyTurn) {
    document.getElementById("rollButton").disabled = true;
    updateStatus("Waiting for other player's turn...");
  }
});

socket.on("error", (data) => {
  alert(data.message);
});

// Game functions
function joinRoom() {
  const roomInput = document.getElementById("roomInput");
  const enteredRoomId = roomInput.value.trim();
  
  if (!enteredRoomId) {
    alert('Please enter a room ID');
    return;
  }
  
  socket.emit("joinRoom", enteredRoomId);
  
  document.getElementById("gameArea").style.display = "block";
  document.querySelector('.lobby').style.display = "none";
}

function rollDice() {
  if (!gameStarted || !isMyTurn) {
    alert("It's not your turn!");
    return;
  }
  
  socket.emit("rollDice", { roomId });
  document.getElementById("rollButton").disabled = true;
}

function moveToken(tokenId) {
  if (!isMyTurn || !lastDiceRoll) {
    alert("Roll the dice first!");
    return;
  }
  
  // Check if this is a valid move
  const validMove = validMoves.find(move => move.tokenId === tokenId);
  if (!validMove) {
    alert("Invalid move!");
    return;
  }
  
  socket.emit("moveToken", {
    roomId,
    tokenId,
    steps: lastDiceRoll
  });
  
  clearValidMoves();
}

function highlightValidMoves() {
  clearValidMoves();
  
  validMoves.forEach(move => {
    const token = document.querySelector(`[data-token-id="${move.tokenId}"][data-color="${myColor}"]`);
    if (token) {
      token.classList.add('valid-move');
      token.onclick = () => moveToken(move.tokenId);
    }
  });
}

function clearValidMoves() {
  document.querySelectorAll('.valid-move').forEach(token => {
    token.classList.remove('valid-move');
    token.onclick = null;
  });
}

function updateStatus(message) {
  document.getElementById("status").textContent = message;
}

function updateCurrentPlayer(playerId) {
  const colors = ['red', 'green', 'blue', 'yellow'];
  const playerIndex = getRoomPlayers().indexOf(playerId);
  const playerColor = colors[playerIndex];
  
  document.getElementById("currentTurn").textContent = playerColor || "Unknown";
}

function updateGameBoard(tokens) {
  // Update token positions on the board
  // This depends on your board implementation
  console.log("Updating board with tokens:", tokens);
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

  const face = diceFaces[value];
  for (let i = 0; i < 9; i++) {
    const dot = document.createElement('div');
    dot.className = face[i] ? 'dice-dot' : 'dice-dot hidden';
    dice.appendChild(dot);
  }
}

// Initialize when page loads
window.addEventListener('DOMContentLoaded', () => {
  console.log("🎮 Initializing Enhanced Ludo game...");
  createLudoBoard();
  updateDiceDisplay(1);
});

// Add CSS for valid moves
const style = document.createElement('style');
style.textContent = `
  .valid-move {
    border: 3px solid #FFD700 !important;
    box-shadow: 0 0 10px #FFD700;
    cursor: pointer;
    animation: pulse 1s infinite;
  }
  
  @keyframes pulse {
    0% { box-shadow: 0 0 10px #FFD700; }
    50% { box-shadow: 0 0 20px #FFD700; }
    100% { box-shadow: 0 0 10px #FFD700; }
  }
`;
document.head.appendChild(style);