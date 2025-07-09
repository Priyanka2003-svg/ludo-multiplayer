// server/rooms.js

const rooms = {};

function createOrJoinRoom(roomId, socketId) {
  if (!rooms[roomId]) {
    rooms[roomId] = {
      players: [],
      turnIndex: 0,
      gameStarted: false,
      createdAt: new Date()
    };
  }

  const room = rooms[roomId];
  
  // Check if player is already in room
  if (room.players.includes(socketId)) {
    return room.players;
  }
  
  // Add player if room has space
  if (room.players.length < 4) {
    room.players.push(socketId);
    console.log(`Player ${socketId} joined room ${roomId}. Total players: ${room.players.length}`);
  }

  return room.players;
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

function getRoomPlayers(roomId) {
  const room = rooms[roomId];
  return room ? room.players : [];
}

function removePlayer(socketId) {
  for (const roomId in rooms) {
    const room = rooms[roomId];
    const index = room.players.indexOf(socketId);
    
    if (index !== -1) {
      room.players.splice(index, 1);
      console.log(`Player ${socketId} removed from room ${roomId}`);
      
      // Adjust turn index if necessary
      if (room.turnIndex >= room.players.length) {
        room.turnIndex = 0;
      }
      
      // Delete room if empty
      if (room.players.length === 0) {
        delete rooms[roomId];
        console.log(`Room ${roomId} deleted (empty)`);
      }
      
      break;
    }
  }
}

function getRoomInfo(roomId) {
  return rooms[roomId] || null;
}

function getAllRooms() {
  return Object.keys(rooms).map(roomId => ({
    id: roomId,
    players: rooms[roomId].players.length,
    gameStarted: rooms[roomId].gameStarted,
    createdAt: rooms[roomId].createdAt
  }));
}

// Clean up old empty rooms (optional)
function cleanupRooms() {
  const now = new Date();
  const maxAge = 24 * 60 * 60 * 1000; // 24 hours
  
  for (const roomId in rooms) {
    const room = rooms[roomId];
    if (room.players.length === 0 && (now - room.createdAt) > maxAge) {
      delete rooms[roomId];
      console.log(`Cleaned up old room: ${roomId}`);
    }
  }
}

// Run cleanup every hour
setInterval(cleanupRooms, 60 * 60 * 1000);

module.exports = {
  createOrJoinRoom,
  getCurrentTurnPlayer,
  nextTurn,
  removePlayer,
  getRoomPlayers,
  getRoomInfo,
  getAllRooms
};