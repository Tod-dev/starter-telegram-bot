"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const grammy_1 = require("grammy");
const express_1 = __importDefault(require("express"));
const duck_timer_1 = __importDefault(require("duck-timer"));
const axios_1 = __importDefault(require("axios"));
require('dotenv').config();
/* BOT */
// Create a bot using the Telegram token
const bot = new grammy_1.Bot(process.env.TELEGRAM_TOKEN || "");
// Suggest commands in the menu
bot.api.setMyCommands([
    { command: "yo", description: "Be greeted by the bot" },
    { command: "now", description: "per ricevere dati attuali" },
]);
/* HANDLE MESSAGES */
bot.command("yo", (ctx) => { var _a; return ctx.reply(`Yo ${(_a = ctx.from) === null || _a === void 0 ? void 0 : _a.username}`); });
bot.command("now", async (ctx) => {
    const msg = await getDataFromSolarEdge(true);
    if (msg && msg != "KO") {
        ctx.reply(msg, {
            parse_mode: "HTML",
        });
    }
});
const introductionMessage = `/now per ricevere dati attuali\nLe notifiche imporanti te le mando io!\nOgni ora se mandi in rete più di 0.3kW\n(con warning se > 0.5kW; con alert se > 2kW)`;
const replyWithIntro = (ctx) => ctx.reply(introductionMessage, { parse_mode: "HTML" });
bot.command("start", replyWithIntro);
bot.on("message", replyWithIntro);
bot.catch((err) => {
    console.log(err);
    const chat = err.ctx.chat.id;
    console.log(`Error for User <code>${chat}</code>: ${err.message}`);
});
/* API FETCH */
const getDataFromSolarEdge = async (forcePrint = false) => {
    try {
        console.log(`[${new Date(Date.now()).toDateString()}]Solar edge update execution... [forcePrint: ${forcePrint}]`);
        const url = `https://monitoringapi.solaredge.com/site/${process.env.MY_SOLAR_EDGE_SITE}/currentPowerFlow?api_key=${process.env.API_KEY}`;
        const response = await axios_1.default.get(url);
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
        console.log(`CHECK: isEnd==true?:${isTimerElapsedFromlastUpdate}, sendingToGrid: ${sendingToGrid} , gridValue>0.3? : ${gridValue}`);
        if ((isTimerElapsedFromlastUpdate && sendingToGrid && gridValue > 0.3) ||
            forcePrint) {
            start();
        }
        else {
            console.log("NO UPDATE TO DO: return");
            return "KO";
        }
        /* SEND UPDATE */
        console.log("\x1b[33m SENDING UPDATE! \x1b[0m");
        const statusKey = "status";
        const sunText = `Sun Power 🌤️: <b>${sunValue}kW</b>, stato: ${sun[statusKey]}`;
        const batteryText = `Battery% 🔋: <b>${batteryPerc}%</b>, stato: ${battery[statusKey]}`;
        const loadText = `Consumi 🏠: <b>${loadValue}kW</b>, stato: ${load[statusKey]}`;
        const message = [sunText, batteryText, loadText];
        let messageTxt = "";
        if (sendingToGrid && gridValue > 2) {
            messageTxt += `🚨🚨🚨Troppa energia in rete: <b>${gridValue}kW</b> USALA!!🚨🚨🚨\n`;
        }
        else if (sendingToGrid && gridValue > 0.5) {
            messageTxt += `⚠️Attenzione stai mandando energia in rete, <b>${gridValue}kW</b>! Sfruttala ORA⚠️\n`;
        }
        messageTxt += "STATO ATTUALE:\n";
        messageTxt += message.join("\n");
        return messageTxt;
    }
    catch (error) {
        console.error(error);
    }
};
/* TIMER PER POLLING A SOLAR EDGE */
const pollingRateSec = process.env.NODE_ENV === "production" ? process.env.POLLING_RATE_SEC : process.env.POLLING_RATE_SEC_DEV;
const timer = new duck_timer_1.default({ interval: pollingRateSec * 1000 }); // interval time in ms
timer
    .onInterval(async (res) => {
    const msg = await getDataFromSolarEdge();
    if (msg && msg != "KO") {
        bot.api.sendMessage(process.env.chatID + "", msg, { parse_mode: "HTML" });
    }
})
    .start();
var startTime, endTime;
const start = () => {
    startTime = new Date();
};
const isEnd = () => {
    /* RETURN TIME ELAPSED SINCE LAST PERIODIC UPDATE */
    if (!startTime)
        return true; // TAKE ACTION [is the first time]
    endTime = new Date();
    var timeDiff = endTime - startTime; //in ms
    // strip the ms -> seconds
    var timeDiffSeconds = Math.round(timeDiff / 1000);
    //hours
    var timeDiffMinutes = Math.round(timeDiffSeconds / 60);
    if (process.env.NODE_ENV === "production") {
        const mustBe = parseInt(process.env.MINUTES_BEFORE_UPDATE + "");
        //every hour
        console.log("time elapsed: " +
            timeDiffMinutes +
            "min." +
            `[MUST BE >= : : ${mustBe}]`);
        if (timeDiffMinutes >= mustBe) {
            return true;
        }
    }
    else {
        //every 5 seconds
        const mustBe = parseInt(process.env.SECONDS_BEFORE_UPDATE_DEV + "");
        console.log("time elapsed: " +
            timeDiffSeconds +
            "sec." +
            `[MUST BE >= : ${mustBe}`);
        if (timeDiffSeconds >= mustBe) {
            return true;
        }
    }
    return false; //NO ACTION
};
/* SERVER START */
if (process.env.NODE_ENV === "production") {
    // Use Webhooks for the production server
    const app = (0, express_1.default)();
    app.use(express_1.default.json());
    app.use((0, grammy_1.webhookCallback)(bot, "express"));
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
        console.log(`Bot listening on port ${PORT}`);
    });
}
else {
    // Use Long Polling for development
    bot.start();
}
