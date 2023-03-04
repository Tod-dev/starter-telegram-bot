import { Bot, InlineKeyboard, webhookCallback } from "grammy";
import { chunk } from "lodash";
import express from "express";
import DuckTimer from "duck-timer";
import axios from "axios";

/* BOT */
// Create a bot using the Telegram token
const bot = new Bot(process.env.TELEGRAM_TOKEN || "");
// Suggest commands in the menu
bot.api.setMyCommands([
  { command: "yo", description: "Be greeted by the bot" },
  { command: "now", description: "per ricevere dati attuali" },
]);

/* HANDLE MESSAGES */
bot.command("yo", (ctx) => ctx.reply(`Yo ${ctx.from?.username}`));
bot.command("now", async (ctx) => {
  const msg = await getDataFromSolarEdge(true);
  if (msg && msg != "KO") {
    ctx.reply(msg, {
      parse_mode: "HTML",
    });
  }
});
const introductionMessage = `/now per ricevere dati attuali\nLe notifiche imporanti te le mando io!\nOgni ora se mandi in rete più di 0.3kW\n(con warning se > 0.5kW; con alert se > 2kW)`;
const replyWithIntro = (ctx: any) =>
  ctx.reply(introductionMessage, { parse_mode: "HTML" });
bot.command("start", replyWithIntro);
bot.on("message", replyWithIntro);
bot.catch((err: any) => {
  console.log(err);
  const chat = err.ctx.chat.id;
  console.log(`Error for User <code>${chat}</code>: ${err.message}`);
});

/* API FETCH */
const getDataFromSolarEdge = async (forcePrint = false) => {
  try {
    console.log(
      `[${Date.now().toString()}]Solar edge update execution... [forcePrint: ${forcePrint}]`
    );
    const url = `https://monitoringapi.solaredge.com/site/${process.env.MY_SOLAR_EDGE_SITE}/currentPowerFlow?api_key=${process.env.API_KEY}`;
    const response = await axios.get(url);
    let json = await response.data;
    json = json["siteCurrentPowerFlow"];
    // console.log(json);
    const sun = json["PV"];
    const battery = json["STORAGE"];
    const load = json["LOAD"];
    const grid = json["GRID"];

    const sunValue = sun["currentPower"];
    const batteryPerc = battery["chargeLevel"];
    const loadValue = load["currentPower"];
    const gridValue = grid["currentPower"];

    const connections = json["connections"];

    let sendingToGrid = false;
    for (let i = 0; i < connections.length; i++) {
      const c = connections[i];
      console.log("connection found:", c);
      if (c["to"].toUpperCase() == "GRID") {
        sendingToGrid = true;
        break;
      }
    }

    const isTimerElapsedFromlastUpdate = isEnd();
    console.log(
      `CHECK: isEnd==true?:${isTimerElapsedFromlastUpdate}, sendingToGrid: ${sendingToGrid} , gridValue>0.3? : ${gridValue}`
    );
    if (
      (isTimerElapsedFromlastUpdate && sendingToGrid && gridValue > 0.3) ||
      forcePrint
    ) {
      start();
    } else {
      console.log("NO UPDATE TO DO: return");
      return "KO";
    }

    /* SEND UPDATE */

    const statusKey = "status";

    const sunText = `Sun Power 🌤️: <b>${sunValue}kW</b>, stato: ${sun[statusKey]}`;
    const batteryText = `Battery% 🔋: <b>${batteryPerc}%</b>, stato: ${battery[statusKey]}`;
    const loadText = `Consumi 🏠: <b>${loadValue}kW</b>, stato: ${load[statusKey]}`;

    const message = [sunText, batteryText, loadText];
    let messageTxt = "";

    if (sendingToGrid && gridValue > 2) {
      messageTxt += `🚨🚨🚨Troppa energia in rete: <b>${gridValue}kW</b> USALA!!🚨🚨🚨\n`;
    } else if (sendingToGrid && gridValue > 0.5) {
      messageTxt += `⚠️Attenzione stai mandando energia in rete, <b>${gridValue}kW</b>! Sfruttala ORA⚠️\n`;
    }
    messageTxt += "STATO ATTUALE:\n";
    messageTxt += message.join("\n");

    return messageTxt;
  } catch (error) {
    console.error(error);
  }
};

/* TIMER PER POLLING A SOLAR EDGE */
// const pollingRateSec: any = process.env.POLLING_RATE_SEC;
const pollingRateSec: any = 5;
const timer = new DuckTimer({ interval: pollingRateSec * 1000 }); // interval time: 100ms = 0.1sec.
timer
  .onInterval(async (res: any) => {
    const msg = await getDataFromSolarEdge();
    if (msg && msg != "KO") {
      bot.api.sendMessage(process.env.chatID + "", msg);
    }
  })
  .start();
var startTime: any, endTime: any;

const start = () => {
  startTime = new Date();
};

const isEnd = () => {
  /* RETURN TIME ELAPSED SINCE LAST PERIODIC UPDATE */

  if (!startTime) return true; // TAKE ACTION [is the first time]

  endTime = new Date();
  var timeDiff = endTime - startTime; //in ms

  // strip the ms -> seconds
  var timeDiffSeconds = Math.round(timeDiff / 1000);

  //hours
  var timeDiffHours = Math.round(timeDiffSeconds / 60 / 60);

  console.log(
    "time elapsed: " +
      timeDiffHours +
      "hours" +
      `(seconds : ${timeDiffSeconds})`
  );

  if (process.env.NODE_ENV === "production") {
    //every hour
    if (timeDiffHours >= 1) {
      return true;
    }
  } else {
    //every 5 seconds
    if (timeDiffSeconds >= 5) {
      return true;
    }
  }
  return false; //NO ACTION
};

/* SERVER START */
if (process.env.NODE_ENV === "production") {
  // Use Webhooks for the production server
  const app = express();
  app.use(express.json());
  app.use(webhookCallback(bot, "express"));

  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Bot listening on port ${PORT}`);
  });
} else {
  // Use Long Polling for development
  bot.start();
}
