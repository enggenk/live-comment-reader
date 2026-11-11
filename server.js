
import express from "express";
import { createServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import {
  TikTokLiveConnection,
  WebcastEvent,
  ControlEvent
} from "tiktok-live-connector";

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

const PORT = process.env.PORT || 3000;
const USERNAME = (
  process.env.TIKTOK_USERNAME || "mini.ev.makassar"
).replace("@", "");

let connection = null;
let live = false;
let checking = false;
let connecting = false;

function broadcast(data) {
  const message = JSON.stringify(data);

  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

app.get("/", (req, res) => {
  res.send("LIVE Comment Reader Server is running");
});

app.get("/status", (req, res) => {
  res.json({
    username: USERNAME,
    live,
    connected: connection?.isConnected || false
  });
});

wss.on("connection", socket => {
  socket.send(JSON.stringify({
    type: "status",
    live,
    username: USERNAME
  }));
});

async function connectToLive() {
  if (connecting || connection?.isConnected) return;

  connecting = true;

  try {
    connection = new TikTokLiveConnection(USERNAME);

    connection.on(ControlEvent.CONNECTED, () => {
      live = true;
      broadcast({ type: "status", live: true });
      console.log("TikTok LIVE terhubung");
    });

    connection.on(WebcastEvent.CHAT, data => {
      const comment = {
        type: "comment",
        username:
          data.user?.nickname ||
          data.user?.uniqueId ||
          "Penonton",
        text: data.comment || ""
      };

      if (comment.text.trim()) {
        broadcast(comment);
        console.log(comment.username + ": " + comment.text);
      }
    });

    connection.on(ControlEvent.DISCONNECTED, () => {
      console.log("Koneksi LIVE terputus");
    });

    connection.on(ControlEvent.ERROR, error => {
      console.error("TikTok error:", error);
    });

    await connection.connect();

  } catch (error) {
    console.error("Gagal menghubungkan:", error.message);
    live = false;
    broadcast({ type: "status", live: false });
    connection = null;
  } finally {
    connecting = false;
  }
}

async function checkLive() {
  if (checking) return;
  checking = true;

  try {
    if (!connection) {
      connection = new TikTokLiveConnection(USERNAME);
    }

    const isLive = await connection.fetchIsLive();

    if (isLive && !connection.isConnected) {
      await connectToLive();
    }

    if (!isLive && connection.isConnected) {
      await connection.disconnect();
      live = false;
      broadcast({ type: "status", live: false });
    }

    if (!isLive) {
      live = false;
    }

  } catch (error) {
    console.error("Pengecekan LIVE gagal:", error.message);
  } finally {
    checking = false;
  }
}

server.listen(PORT, () => {
  console.log("Server berjalan pada port " + PORT);
  console.log("Memantau @" + USERNAME);

  checkLive();
  setInterval(checkLive, 45000);
});
