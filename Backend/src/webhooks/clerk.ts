import type { Request, Response } from "express";
import { getEnv } from "../lib/env";
import { verifyWebhook } from "@clerk/backend/webhooks";
import { parseRole } from "../lib/role";
import { db } from "../db";
import { users } from "../db/schema";
import { eq } from "drizzle-orm";

export async function clerkWebhookHandler(req: Request, res: Response,) {

    const env = getEnv()

    try {
        if (!env.CLERK_WEBHOOK_SECRET_KEY) {
            res.status(503).send("Webhooks are not provided")
            return
        }

        const payload = req.body instanceof Buffer ? req.body.toString("utf8") : String(req.body)

        const request = new Request("http://internal/webhook/clerk", {
            method: "POST",
            headers: new Headers(req.headers as HeadersInit),
            body: payload
        })

        const evt = await verifyWebhook(request, { signingSecret: env.CLERK_WEBHOOK_SECRET_KEY });

        if (evt.type === "user.created" || evt.type === "user.updated") {
            const user = evt.data

            const email = user.email_addresses?.find((e) => e.id === user.primary_email_address_id)?.email_address ?? user.email_addresses?.[0]?.email_address;

            const displayName = [user.first_name, user.last_name].filter(Boolean).join("") || user.username || null

            const role = parseRole(user.public_metadata?.role)

            await db
                .insert(users)
                .values({
                    clerkUserId: user.id,
                    email,
                    displayName,
                    role,
                })
                .onConflictDoUpdate({
                    target: users.clerkUserId,
                    set: { email, displayName, role, updatedAt: new Date() },
                });
        }

        if (evt.type === "user.deleted") {
            const id = evt.data.id;
            if (id) {
                await db.delete(users).where(eq(users.clerkUserId, id));
            }
        }

        res.json({ ok: true });

    } catch (err) {
        console.error("Clerk webhook error", err);
        res.status(400).json({ error: "Invalid webhook" });
    }
}