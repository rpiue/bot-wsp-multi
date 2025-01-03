const { Client, MessageMedia } = require("whatsapp-web.js");
const axios = require("axios");
const express = require("express");
const router = express.Router();

const {
  fetchEmailsFromFirestore,
  findEmailInCache,
} = require("./datos-firebase");

let isActive = false;
let currentQr = "";
let qrGenerationCount = 0;
const ultimosMensajes = {};
let mensajesEnviados = [];
let client;

const botIzagiData = (io) => {
  client = new Client();

  const stopClient = () => {
    client.destroy();
    isActive = false;
    currentQr = "";
    qrGenerationCount = 0;
    io.emit("botCodexPEStatus", isActive);
    console.log("Client stopped.");
  };

  const restartClient = () => {
    if (!isActive) {
      qrGenerationCount = 0;
      client.initialize();
      console.log("Client restarted to generate a new QR.");
    }
  };

  client.on("qr", (qr) => {
    if (qrGenerationCount < 2 && !isActive) {
      currentQr = qr;
      qrGenerationCount++;
      io.emit("qrIzagiData", qr);
      console.log(`QR Code emitted (${qrGenerationCount}/2): ${qr}`);
    } else if (!isActive) {
      stopClient(); // Stop the client if the limit is reached
      io.emit("qrGenerationLimitReached", true);
      console.log("QR generation limit reached and client stopped.");
    }
  });

  client.on("ready", async () => {
    console.log("Client is ready!");
    isActive = true;
    qrGenerationCount = 0; // Reset QR generation count
    io.emit("botIzagiDataStatus", isActive);
    await fetchEmailsFromFirestore();
  });

  client.on("disconnected", () => {
    console.log("Client disconnected!");
    stopClient();
    restartClient(); // Automatically restart the client
  });

  let imageUrl;
  client.on("message", async (msg) => {
    const chat = await msg.getChat();
    const userNumber1 = msg.from.includes("@")
      ? msg.from.split("@")[0]
      : msg.from;

    const userNumber = msg.from; // Número de usuario
    const ahora = Date.now();

    const mensajeActual = msg.body;

    // Si ya hay un mensaje anterior de este usuario
    if (ultimosMensajes[userNumber1]) {
      const { mensajeAnterior, fechaHoraAnterior } =
        ultimosMensajes[userNumber1];

      // Calcula la diferencia en horas entre el mensaje anterior y el actual
      const diferenciaHoras =
        (ahora - new Date(fechaHoraAnterior)) / (1000 * 60 * 60);

      // Si el mensaje es el mismo y ha pasado menos de 1 hora, no respondas
      if (mensajeAnterior === mensajeActual && diferenciaHoras < 1) {
        console.log(
          `El usuario ${userNumber1} ya envió el mismo mensaje recientemente.`
        );
        return;
      }
    }

    // Actualizar el último mensaje y la hora en que fue enviado por el usuario
    ultimosMensajes[userNumber1] = {
      mensajeAnterior: mensajeActual,
      fechaHoraAnterior: ahora,
    };

    const planRegex = /Plan\s+.*?- IzagiData/i;
    if (planRegex.test(msg.body) && !chat.isGroup) {
      if (!msg.body.includes("Mi correo:")) return;
      const lines = msg.body.split("\n");
      const nameLine = lines.find((line) => line.startsWith("Mi nombre es:"));
      const planLine = lines.find((line) => line.startsWith("El Plan:"));
      const emailLine = lines.find((line) => line.startsWith("Mi correo:"));
      const email = emailLine ? emailLine.split(": ")[1].trim() : null;
      if (!email) {
        await msg.reply("No se detectó un correo válido en tu mensaje.");
        return;
      }
      console.log(`Verificando el correo: ${email}`);

      const exists = findEmailInCache(email);
      if (exists) {
        const name = nameLine ? nameLine.split(": ")[1] : "Usuario";
        const plan = planLine
          ? planLine.split(":").slice(1).join(":").trim()
          : "Plan Basico";
        console.log(lines);
        console.log(planLine);
        console.log(name);
        console.log(plan);
        const fechaHora = new Date().toLocaleString();
        mensajesEnviados.push({
          name,
          userNumber1,
          fechaHora,
        });

        io.emit("messageSent", name, userNumber1);

        let planDetails = "";

        try {
          // Suponiendo que imageUrl es la URL de la imagen que deseas enviar

          const customMessage = `
Hola ${name}, ¡gracias por elegir el ${plan}!

Nos complace informarte que has seleccionado *${plan}*.
A continuación, encontrarás los detalles de este plan y lo que incluye:
`;

          const pasos = `
**Pasos a seguir:**
1. *Realiza el pago:* Escanea el QR que te hemos enviado y efectúa el pago correspondiente a tu plan y *en la descripcion agrega tu correo.*
2. *Confirma el pago:* Una vez que hayas realizado el pago, por favor envíame una captura de pantalla del comprobante para activar tu suscripción.
3. *Disfruta del servicio:* Una vez confirmado el pago, tendrás acceso inmediato a las funcionalidades del ${plan} y podrás disfrutar de todos sus beneficios.

Si tienes alguna duda o necesitas asistencia, no dudes en comunicarte conmigo. Estamos aquí para ayudarte a sacar el máximo provecho de tu plan.

_¡Gracias por confiar en nosotros!_`;

          await chat.sendMessage(customMessage);
          //await new Promise(resolve => setTimeout(resolve, 3000));
          setTimeout(async () => {
            await chat.sendMessage(pasos);
          }, 3000);

          if (imageUrl) {
            const response = await axios.get(imageUrl, {
              responseType: "arraybuffer",
            });
            const imageBase64 = Buffer.from(response.data, "binary").toString(
              "base64"
            );
            const media = new MessageMedia("image/jpeg", imageBase64);

            await chat.sendMessage(media);
          } else {
            console.log("no hay nada en img", imageUrl);
          }
        } catch (error) {
          console.error("Error al enviar la imagen:", error);
        }
      } else {
        const responseMessage =
          "Por favor, envíanos un audio para más información.";
        await msg.reply(responseMessage);
      }
    }
    // Check if the message is not from a group and contains "hola"
    if (!msg.isGroup && msg.body.toLowerCase().includes() === "hola") {
      // Respond to the message
      client.sendMessage(msg.from, "¡Hola! ¿En qué puedo ayudarte?");
      console.log(
        `Responded to ${msg.from} with: ¡Hola! ¿En qué puedo ayudarte?`
      );
    }
  });

  return {
    isActive: () => isActive,
    getCurrentQr: () => currentQr,
    toggle: () => {
      if (isActive) {
        stopClient();
      } else {
        restartClient();
      }
    },

    codigoPago: (img) => {
      imageUrl = img;
      console.log("Se asigno la Imagen al Bot", imageUrl);
    },
    generateNewQr: () => {
      if (!isActive) {
        restartClient();
      } else {
        console.log("Cannot generate QR while client is active.");
      }
      return currentQr;
    },
  };
};
router.use(express.json());
router.post("/verificar", async (req, res) => {
  const { codigo, numero, nombre } = req.body;

  try {
    if (!codigo || !numero) {
      return res.status(400).send("Faltan parámetros: código o número.");
    }

    const mensaje = `Hola ${nombre}, tu código es *${codigo}*.`;
    const mensaje2 = `Recuerda que la aplicación es *GRATIS*. No pagues a nadie.`;
    const mensaje3 = `El link de la aplicación está en el perfil y puedes descargarla gratuitamente.`;
    const mensaje4 = `https://izagidata.onrender.com`;
    const chatId = `51${numero}@c.us`;

    await client.sendMessage(chatId, mensaje);
    await client.sendMessage(chatId, mensaje2);
    await client.sendMessage(chatId, mensaje3);
    await client.sendMessage(chatId, mensaje4);

    console.log("Mensaje enviado correctamente por Codexpe");
    res.status(200).send("Mensaje enviado por Codexpe.");
  } catch (error) {
    console.error("Error al enviar el mensaje:", error);
    res.status(500).send("Error al enviar el mensaje por Codexpe.");
  }
});

module.exports = { botIzagiData, router };
