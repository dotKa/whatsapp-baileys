import express from "express";
import makeWASocket, {
  AnyMessageContent,
  delay,
  DisconnectReason,
  fetchLatestBaileysVersion,
  useSingleFileAuthState,
} from "@adiwajshing/baileys";
import { Boom } from "@hapi/boom";
import MAIN_LOGGER from "@adiwajshing/baileys/lib/Utils/logger";
const fs = require('fs')

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 4000;

const logger = MAIN_LOGGER.child({});
logger.level = "trace";

let whatsappSocks = [];

async function connectToWhatsApp(client) {
  // fetch latest version of WA Web
  const { version, isLatest } = await fetchLatestBaileysVersion();
  console.log(`using WA v${version.join(".")}, isLatest: ${isLatest}`);
  const { state, saveState } = useSingleFileAuthState(`./auth_data/auth_info_multi-${client}.json`);

  const sock = makeWASocket({
    version,
    logger,
    printQRInTerminal: true,
    auth: state,
    // implement to handle retries
    getMessage: async (key) => {
      return {
        conversation: "hello",
      };
    },
  });


  sock.ev.on("chats.set", (item) =>
    console.log(`recv ${item.chats.length} chats (is latest: ${item.isLatest})`)
  );
  sock.ev.on("messages.set", (item) =>
    console.log(
      `recv ${item.messages.length} messages (is latest: ${item.isLatest})`
    )
  );
  sock.ev.on("contacts.set", (item) =>
    console.log(`recv ${item.contacts.length} contacts`)
  );

  sock.ev.on("messages.upsert", async (m) => {
    console.log(JSON.stringify(m, undefined, 2));
  });

  sock.ev.on("messages.update", (m) => console.log(m));
  sock.ev.on("message-receipt.update", (m) => console.log(m));
  sock.ev.on("presence.update", (m) => console.log(m));
  sock.ev.on("chats.update", (m) => console.log(m));
  sock.ev.on("contacts.upsert", (m) => console.log(m));

  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect } = update;
    if (connection === "close") {
      // reconnect if not logged out
      if (
        (lastDisconnect.error as Boom)?.output?.statusCode !==
        DisconnectReason.loggedOut
      ) {
        connectToWhatsApp(client);
      } else {
        console.log("Connection closed. You are logged out.");
      }
    }

    console.log("connection update", update);
  });

  // listen for when the auth credentials is updated
  sock.ev.on("creds.update", saveState);

  let obj = {
    sock: sock,
    client: client
  }
  whatsappSocks.push(obj);
  return sock;
}

app.get("/", (req, res) => {
  res.send("Hello from server!");
});

app.get("/up/:client", (req, res) => {
  connectToWhatsApp(req.params.client);
  let response;
  try {
    if(fs.existsSync(`./auth_data/auth_info_multi-${req.params.client}.json`)){
      response = {
        msg: 'Client exist, trying exist auth data',
        client: req.params.client
      }
    }
  } catch (err) {
    response = {
      msg: 'New Client',
      client: req.params.client
    }
  }
  res.send(response);
});


app.post("/send/:client/:number", (req, res) => {
  let response;
  console.log(req)
  const text = req.body.text;
  let client = whatsappSocks.find(o => o.client === req.params.client)
  client.sock.sendMessage(`${req.params.number}@s.whatsapp.net`, {
    text: text,
  });


  response = {
    msg: 'Message sent',
    to: req.params.number,
    content: text,
    client: req.params.client
  }
  res.send(response);
});

app.listen(PORT, () =>
  console.log(`⚡Server is running here 👉 https://localhost:${PORT}`)
);
