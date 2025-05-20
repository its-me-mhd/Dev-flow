import { Webhook } from "svix";
import { headers } from "next/headers";
import { WebhookEvent } from "@clerk/nextjs/server";
import { createUser, deleteUser, updateUser } from "@/lib/actions/user.action";
import { connectToDatabase } from "@/lib/moongoose";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;
  if (!WEBHOOK_SECRET) {
    return new Response("Missing Clerk webhook secret", { status: 500 });
  }

  const headerPayload = headers();
  const svix_id = headerPayload.get("svix-id");
  const svix_timestamp = headerPayload.get("svix-timestamp");
  const svix_signature = headerPayload.get("svix-signature");

  if (!svix_id || !svix_timestamp || !svix_signature) {
    return new Response("Missing Svix headers", { status: 400 });
  }

  const payload = await req.text();
  const wh = new Webhook(WEBHOOK_SECRET);

  let evt: WebhookEvent;
  let eventType: string;

  try {
    evt = wh.verify(payload, {
      "svix-id": svix_id,
      "svix-timestamp": svix_timestamp,
      "svix-signature": svix_signature,
    }) as WebhookEvent;

    eventType = evt.type;
  } catch {
    return new Response("Invalid webhook signature", { status: 400 });
  }

  await connectToDatabase();

  const data = evt.data as Record<string, any>;

  const id = data?.id;
  const email = data?.email_addresses?.[0]?.email_address || "unknown@example.com";
  const image_url = data?.image_url || "";
  const first_name = data?.first_name || "";
  const last_name = data?.last_name || "";
  const usernameFromClerk = data?.username;

  const fallbackUsername =
    usernameFromClerk?.trim() ||
    `${first_name}${last_name}`.trim().toLowerCase() ||
    `user${Math.floor(Math.random() * 100000)}`;

  if (!id || !fallbackUsername) {
    return new Response("Missing required user data", { status: 400 });
  }

  if (eventType === "user.created") {
    try {
      await createUser({
        clerkId: id,
        email,
        username: fallbackUsername,
        name: `${first_name} ${last_name}`.trim(),
        picture: image_url,
      });


      return new Response("User created successfully", { status: 200 });
    } catch (err) {
      console.error("Error creating user:", err);
      return new Response("Failed to create user", { status: 500 });
    }
  }

  return new Response("Event type not handled", { status: 200 });
}
