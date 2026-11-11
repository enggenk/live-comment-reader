
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

const PORT = process.env.PORT || 10000;
const USERNAME = (
  process.env.TIKTOK_USERNAME || "mini.ev.makassar"
).replace(/^@/, "");

app.use(express.static("public"));

let connection;
let live = false;
let connecting = false;
let checking = false;

function broadcast(data) {
  const msg = JSON.stringify(data);

  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(msg);
    }
  });
}

function status() {
  broadcast({
    type: "status",
    live,
    username: USERNAME
  });
}

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

function setupConnection() {
  if (connection) return;

  connection = new TikTokLiveConnection(USERNAME);

  connection.on(ControlEvent.CONNECTED, () => {
    live = true;
    console.log("LIVE terhubung");
    status();
  });

  connection.on(ControlEvent.DISCONNECTED, () => {
    live = false;
    console.log("LIVE terputus");
    status();
  });

  connection.on(ControlEvent.ERROR, error => {
    console.error("TikTok:", error);
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
      console.log(comment.username, comment.text);
    }
  });
}

async function checkLive() {
  if (checking) return;
  checking = true;

  try {
    setupConnection();

    const isLive = await connection.fetchIsLive();

    if (isLive && !connection.isConnected && !connecting) {
      connecting = true;

      try {
        await connection.connect();
      } finally {
        connecting = false;
      }
    }

    if (!isLive && connection.isConnected) {
      await connection.disconnect();
    }

    if (!isLive && live) {
      live = false;
      status();
    }

  } catch (error) {
    console.error("Pengecekan LIVE:", error.message);
  } finally {
    checking = false;
  }
}

server.listen(PORT, "0.0.0.0", () => {
  console.log("Server berjalan di port", PORT);
  console.log("Memantau @" + USERNAME);

  checkLive();
  setInterval(checkLive, 45000);
});
