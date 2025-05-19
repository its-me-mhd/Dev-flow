import { Webhook } from "svix";
import { headers } from "next/headers";
import { WebhookEvent } from "@clerk/nextjs/server";
import { createUser, deleteUser, updateUser } from "@/lib/actions/user.action";
import { connectToDatabase } from "@/lib/moongoose";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;

  if (!WEBHOOK_SECRET) {
    console.error("❌ WEBHOOK_SECRET missing in env");
    return new Response("Webhook secret missing", { status: 500 });
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
  } catch (err) {
    console.error("❌ Webhook signature verification failed:", err);
    return new Response("Invalid signature", { status: 400 });
  }

  console.log("📦 Webhook event received:", eventType);
  console.log("🔍 Payload:", evt.data);

  await connectToDatabase();

  const {
    id,
    email_addresses,
    image_url,
    first_name = "",
    last_name = "",
    username = "unknown"
  } = evt.data as Record<string, any>;

  if (eventType === "user.created") {
    try {
      const user = await createUser({
        clerkId: id,
        name: first_name && last_name ? `${first_name} ${last_name}` : username,
        email: email_addresses[0].email_address,
        username,
        picture: image_url
      });
      console.log("✅ User created in DB:", user);
      return NextResponse.json({ status: 200, user });
    } catch (err) {
      console.error("❌ Failed to create user:", err);
      return new Response("Failed to create user", { status: 500 });
    }
  }

  if (eventType === "user.updated") {
    try {
      const updated = await updateUser({
        clerkId: id,
        updateData: {
          name: first_name && last_name ? `${first_name} ${last_name}` : username,
          email: email_addresses[0].email_address,
          username,
          picture: image_url
        },
        path: `/profile/${id}`
      });
      console.log("✅ User updated in DB:", updated);
      return NextResponse.json({ status: 200, updated });
    } catch (err) {
      console.error("❌ Failed to update user:", err);
      return new Response("Failed to update user", { status: 500 });
    }
  }

  if (eventType === "user.deleted") {
    try {
      const deleted = await deleteUser({ clerkId: id });
      console.log("✅ User deleted from DB:", deleted);
      return NextResponse.json({ status: 200, deleted });
    } catch (err) {
      console.error("❌ Failed to delete user:", err);
      return new Response("Failed to delete user", { status: 500 });
    }
  }

  return new Response("Unhandled event", { status: 200 });
}
