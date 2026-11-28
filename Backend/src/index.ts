import express from "express"
import cors from "cors"
import "dotenv/config"
import { clerkMiddleware } from '@clerk/express'
import { clerkWebhookHandler } from "./webhooks/clerk"
import { getEnv } from "./lib/env"
import job from "./lib/cron"

import path from "node:path"
import fs from "node:fs"

const env = getEnv()
const app = express()

// it's important that you don't parse the webhook event data, it should be in the raw format
const rawJson = express.raw({ type: "application/json", limit: "1mb" })

app.post("/webhook/clerk", rawJson, async (req, res, next) => {
    try {
        await clerkWebhookHandler(req, res)
    } catch (error) {
        next(error);
    }
})

app.use(express.json())
app.use(cors())
app.use(clerkMiddleware())

app.get("/health", (_req,res) => {
    res.send({ok: true})
})

const publicDir = path.join(process.cwd(), "public");
if (fs.existsSync(publicDir)) {
    app.use(express.static(publicDir));

    app.get("/{*any}", (req, res, next) => {
        if (req.method !== "GET" && req.method !== "HEAD") {
            next();
            return;
        }

        if (req.path.startsWith("/api") || req.path.startsWith("/webhooks")) {
            next();
            return;
        }

        res.sendFile(path.join(publicDir, "index.html"), (err) => next(err));
    });
}


app.listen(env.PORT, () => {
    console.log("listening on port:", env.PORT)

    // This will keep deployement alive by sending get request every 14 minutes.
    if (env.NODE_ENV === "production"){
        job.start()
    }

})
