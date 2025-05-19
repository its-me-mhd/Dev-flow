import { Webhook } from "svix";
import { headers } from "next/headers";
import { WebhookEvent } from "@clerk/nextjs/server";
import { createUser, deleteUser, updateUser } from "@/lib/actions/user.action";
import { connectToDatabase } from "@/lib/moongoose";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;
  if (!WEBHOOK_SECRET) return new Response("Missing webhook secret", { status: 500 });

  const headerPayload = headers();
  const svix_id = headerPayload.get("svix-id");
  const svix_timestamp = headerPayload.get("svix-timestamp");
  const svix_signature = headerPayload.get("svix-signature");

  if (!svix_id || !svix_timestamp || !svix_signature) {
    return new Response("Missing svix headers", { status: 400 });
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
    console.error("❌ Webhook verification failed:", err);
    return new Response("Invalid signature", { status: 400 });
  }

  console.log("📦 Webhook Event:", eventType);
  console.log("🧠 Payload:", evt.data);

  await connectToDatabase();

  const data = evt.data as Record<string, any>;
  const {
    id,
    email_addresses,
    image_url,
    first_name = "",
    last_name = "",
    username = null
  } = data;

  // 👇 Prevent crashing on null values
  const fallbackUsername = username ?? `${first_name}${last_name}`.toLowerCase() || `user${Math.floor(Math.random() * 10000)}`;
  const email = email_addresses?.[0]?.email_address || "unknown@example.com";

  if (eventType === "user.created") {
    console.log("🚀 Creating user in Mongo...");
    try {
      const user = await createUser({
        clerkId: id,
        name: `${first_name} ${last_name}`.trim() || fallbackUsername,
        email,
        username: fallbackUsername,
        picture: image_url || "",
      });

      console.log("✅ User saved:", user);
      return NextResponse.json({ message: "User created", user });
    } catch (err) {
      console.error("❌ Error saving user:", err);
      return new Response("Error creating user", { status: 500 });
    }
  }

  if (eventType === "user.updated") {
    console.log("✏️ Updating user...");
    try {
      const updated = await updateUser({
        clerkId: id,
        updateData: {
          name: `${first_name} ${last_name}`.trim() || fallbackUsername,
          email,
          username: fallbackUsername,
          picture: image_url,
        },
        path: `/profile/${id}`,
      });

      console.log("✅ User updated:", updated);
      return NextResponse.json({ message: "User updated", updated });
    } catch (err) {
      console.error("❌ Error updating user:", err);
      return new Response("Error updating user", { status: 500 });
    }
  }

  if (eventType === "user.deleted") {
    console.log("🗑️ Deleting user...");
    try {
      const deleted = await deleteUser({ clerkId: id });
      console.log("✅ User deleted:", deleted);
      return NextResponse.json({ message: "User deleted", deleted });
    } catch (err) {
      console.error("❌ Error deleting user:", err);
      return new Response("Error deleting user", { status: 500 });
    }
  }

  return new Response("Event handled", { status: 200 });
}
