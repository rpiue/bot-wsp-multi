const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const botCodexPE = require("./botCodexPE");

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.static("public"));

const clientCodexPE = botCodexPE(io);

// Activar cliente automáticamente al iniciar el servidor
if (!clientCodexPE.isActive()) {
  console.log("Iniciando cliente automáticamente...");
  clientCodexPE.toggle();
}

app.get("/", (req, res) => {
  res.sendFile(__dirname + "/public/index.html");
});

app.get("/codexpe", (req, res) => {
  res.sendFile(__dirname + "/public/codexpe.html");
});

// Rest of the setup remains the same
io.on("connection", (socket) => {
  console.log("Cliente conectado vía WebSocket.");

  socket.on("requestData", () => {
    socket.emit("initialData", {
      botCodexPEActive: clientCodexPE.isActive(),
      qrCodexPE: clientCodexPE.getCurrentQr(),
    });
  });

  socket.on("toggleBotCodexPE", () => {
    clientCodexPE.toggle();
    io.emit("botCodexPEStatus", clientCodexPE.isActive());
  });

  socket.on("requestQRCodeCodex", () => {
    const qr = clientCodexPE.generateNewQr();
    io.emit("qrCodexPE", qr);
  });

  socket.on("disconnect", () => {
    console.log("Cliente desconectado vía WebSocket.");
  });

  socket.on("setImageUrl", (url) => {
    imageUrl = url; // Establecer la URL de la imagen
    console.log(`URL de la imagen establecida: ${imageUrl}`);
    io.emit("setImageUrl", clientCodexPE.codigoPago(imageUrl));
    // obtenerGrupos();
  });
});

// Configuración del servidor
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
