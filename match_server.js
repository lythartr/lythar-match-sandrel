
// Bu dosyanın adı: match_server.js
// SADECE RASTGELE SESLİ EŞLEŞME (lythar) SİSTEMİNİN SANTRALİ
// (Yeni Render.com hesabında çalışacak)

const { Server } = require("socket.io");
const http = require('http'); 

const httpServer = http.createServer((req, res) => {
  // Render.com sağlık kontrolü (health check)
  if (req.method === 'GET' && req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Rastgele Sesli Eşleşme Sunucusu Aktif.');
  } else {
    res.writeHead(404);
    res.end();
  }
});

const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0'; // Tüm IP adreslerini dinle

const io = new Server(httpServer, {
  cors: {
    origin: "*", // Buraya ana sitenin (lythar.42web.io) adresini yazmalısın
    methods: ["GET", "POST"]
  }
});

console.log(`🚀 Rastgele Sesli Sunucusu ${PORT} portunda dinlemeye hazır...`);

let kullaniciSoketleri = new Map(); // key: userId, value: socket.id
let waitingPool = []; // [{ userId: '123', socketId: 'abc' }, ...]

io.on("connection", (socket) => {
  console.log(`[BAĞLANTI] Bir kullanıcı bağlandı: ${socket.id}`);
  let currentUserId = null; 

  // 1. KULLANICI KİMLİĞİNİ KAYDETME
  socket.on("store_user_id", (userId) => {
    if (!userId) return;
    const userIdStr = userId.toString();
    currentUserId = userIdStr;
    console.log(`[KİMLİK] Kullanıcı ${userIdStr} soket ${socket.id} ile eşleşti.`);
    kullaniciSoketleri.set(userIdStr, socket.id);
  });

  // 2. EŞLEŞME HAVUZUNA KATIL
  socket.on("join_matchmaking_pool", () => {
    if (!currentUserId) {
        console.warn("[HATA] Kimliği belirsiz bir soket havuza girmeye çalıştı.");
        return;
    }
    if (waitingPool.find(user => user.userId === currentUserId)) {
        console.log(`[HAVUZ] Kullanıcı ${currentUserId} zaten havuzda.`);
        return;
    }
    
    console.log(`[HAVUZ] Kullanıcı ${currentUserId} (${socket.id}) havuza eklendi.`);
    waitingPool.push({ userId: currentUserId, socketId: socket.id });

    // EŞLEŞMEYİ KONTROL ET
    if (waitingPool.length >= 2) {
        console.log("[HAVUZ] Eşleşme bulundu! 2 kullanıcı çekiliyor...");
        
        const userA = waitingPool.shift(); // Havuza ilk giren (Arayan olacak)
        const userB = waitingPool.shift(); // Havuza ikinci giren (Aranan olacak)

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
    if (!currentUserId) return;
    waitingPool = waitingPool.filter(user => user.userId !== currentUserId);
    console.log(`[HAVUZ] Kullanıcı ${currentUserId} havuzdan ayrıldı.`);
  });

  // 4. WEBRTC SİNYAL İLETİMİ
  socket.on("send_signal", (data) => {
    const receiverSocketId = kullaniciSoketleri.get(data.receiver_id.toString());
    if (receiverSocketId) {
      console.log(`[SİNYAL] ${data.payload.type} sinyali ${data.receiver_id}'a iletiliyor.`);
      io.to(receiverSocketId).emit("incoming_signal", {
        payload: data.payload
      });
    }
  });

  // 5. ARAMA KAPATMA
  socket.on("send_hangup", (data) => {
    const receiverSocketId = kullaniciSoketleri.get(data.receiver_id.toString());
    if (receiverSocketId) {
      console.log(`[KAPAT] ${data.receiver_id}'a kapatma sinyali iletiliyor.`);
      io.to(receiverSocketId).emit("call_ended_by_peer");
    }
  });

  // 🔥 YENİ: 6. EMOJİ REAKSİYONU (20:09)
  socket.on("send_emoji_reaction", (data) => {
    const receiverSocketId = kullaniciSoketleri.get(data.receiver_id.toString());
    if (receiverSocketId) {
        console.log(`[EMOJI] ${currentUserId} -> ${data.receiver_id}'a emoji gönderdi: ${data.emoji}`);
        io.to(receiverSocketId).emit("emoji_reaction_received", {
            emoji: data.emoji
        });
    }
  });

  // 7. BAĞLANTI KOPMASI
  socket.on("disconnect", () => {
    console.log(`[BAĞLANTI KESİLDİ] Kullanıcı ayrıldı: ${socket.id}`);
    
    if (currentUserId) {
        kullaniciSoketleri.delete(currentUserId);
        console.log(`[KİMLİK] Kullanıcı ${currentUserId} eşleşmesi kaldırıldı.`);
        
        waitingPool = waitingPool.filter(user => user.userId !== currentUserId);
        console.log(`[HAVUZ] Kullanıcı ${currentUserId} (bağlantı koptu) havuzdan silindi.`);
    }
  });
});

httpServer.listen(PORT, HOST, () => {
  console.log(`Rastgele Sesli Sunucusu ${PORT} portunda ${HOST} hostunda başarıyla başlatıldı.`);
});
