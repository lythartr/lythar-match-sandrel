
// Bu dosyanın adı: match_server.js
// SADECE RASTGELE EŞLEŞME (AZAR) SİSTEMİNİN SANTRALİ
// 🔥 GÜNCELLEME: "Yarış Durumu" (Race Condition) hatası çözüldü.

const { Server } = require("socket.io");
const http = require('http'); 

const httpServer = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Rastgele Sesli Eşleşme Sunucusu Aktif.');
  } else {
    res.writeHead(404);
    res.end();
  }
});

const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0'; 

const io = new Server(httpServer, {
  cors: {
    origin: "*", 
    methods: ["GET", "POST"]
  }
});

console.log(`🚀 Rastgele Sesli Sunucusu ${PORT} portunda dinlemeye hazır...`);

// 🔥 GÜNCELLEME: Map'i (Soket -> UserID) ve (UserID -> Soket) olarak iki yönlü tutacağız
let socketToUser = new Map(); // key: socket.id, value: userId
let userToSocket = new Map(); // key: userId, value: socket.id
let waitingPool = []; // [{ userId: '123', socketId: 'abc' }, ...]

io.on("connection", (socket) => {
  console.log(`[BAĞLANTI] Bir kullanıcı bağlandı: ${socket.id}`);

  // 1. KULLANICI KİMLİĞİNİ KAYDETME
  socket.on("store_user_id", (userId) => {
    if (!userId) return;
    const userIdStr = userId.toString();
    
    console.log(`[KİMLİK] Kullanıcı ${userIdStr} soket ${socket.id} ile eşleşti.`);
    socketToUser.set(socket.id, userIdStr);
    userToSocket.set(userIdStr, socket.id);
  });

  // 2. EŞLEŞME HAVUZUNA KATIL
  socket.on("join_matchmaking_pool", () => {
    // 🔥 DÜZELTME: 'currentUserId' yerine 'socketToUser' map'ini kullan
    const userId = socketToUser.get(socket.id);
    
    if (!userId) {
        console.warn(`[HATA] ${socket.id} kimliği belirsiz bir soket havuza girmeye çalıştı. (store_user_id bekleniyor)`);
        // İsteği reddet (veya 1 saniye sonra tekrar denemesini iste)
        return;
    }
    
    if (waitingPool.find(user => user.userId === userId)) {
        console.log(`[HAVUZ] Kullanıcı ${userId} zaten havuzda.`);
        return;
    }
    
    console.log(`[HAVUZ] Kullanıcı ${userId} (${socket.id}) havuza eklendi.`);
    waitingPool.push({ userId: userId, socketId: socket.id });

    // EŞLEŞMEYİ KONTROL ET
    if (waitingPool.length >= 2) {
        console.log("[HAVUZ] Eşleşme bulundu! 2 kullanıcı çekiliyor...");
        
        const userA = waitingPool.shift(); 
        const userB = waitingPool.shift(); 

        // Arayan (isCaller=true)
        io.to(userA.socketId).emit("match_found", { 
            peerId: userB.userId,
            isCaller: true 
        });
        
        // Aranan (isCaller=false)
        io.to(userB.socketId).emit("match_found", { 
            peerId: userA.userId,
            isCaller: false 
        });
        
        console.log(`[HAVUZ] ${userA.userId} (Arayan) ve ${userB.userId} (Aranan) eşleştirildi.`);
    }
  });

  // 3. EŞLEŞME HAVUZUNDAN AYRIL
  socket.on("leave_matchmaking_pool", () => {
    const userId = socketToUser.get(socket.id);
    if (!userId) return;
    
    waitingPool = waitingPool.filter(user => user.userId !== userId);
    console.log(`[HAVUZ] Kullanıcı ${userId} havuzdan ayrıldı.`);
  });

  // 4. WEBRTC SİNYAL İLETİMİ
  socket.on("send_signal", (data) => {
    const receiverSocketId = userToSocket.get(data.receiver_id.toString());
    if (receiverSocketId) {
      console.log(`[SİNYAL] ${data.payload.type} sinyali ${data.receiver_id}'a iletiliyor.`);
      io.to(receiverSocketId).emit("incoming_signal", {
        payload: data.payload
      });
    }
  });

  // 5. ARAMA KAPATMA
  socket.on("send_hangup", (data) => {
    const receiverSocketId = userToSocket.get(data.receiver_id.toString());
    if (receiverSocketId) {
      console.log(`[KAPAT] ${data.receiver_id}'a kapatma sinyali iletiliyor.`);
      io.to(receiverSocketId).emit("call_ended_by_peer");
    }
  });

  // 6. BAĞLANTI KOPMASI
  socket.on("disconnect", () => {
    console.log(`[BAĞLANTI KESİLDİ] Kullanıcı ayrıldı: ${socket.id}`);
    
    const userId = socketToUser.get(socket.id);
    
    if (userId) {
        socketToUser.delete(socket.id);
        userToSocket.delete(userId);
        console.log(`[KİMLİK] Kullanıcı ${userId} eşleşmesi kaldırıldı.`);
        
        waitingPool = waitingPool.filter(user => user.userId !== userId);
        console.log(`[HAVUZ] Kullanıcı ${userId} (bağlantı koptu) havuzdan silindi.`);
    }
  });
});

httpServer.listen(PORT, HOST, () => {
  console.log(`Rastgele Sesli Sunucusu ${PORT} portunda ${HOST} hostunda başarıyla başlatıldı.`);
});
