import { Webhook } from "svix";
import { headers } from "next/headers";
import { WebhookEvent } from "@clerk/nextjs/server";
import { createUser, deleteUser, updateUser } from "@/lib/actions/user.action";
import { connectToDatabase } from "@/lib/moongoose";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;
  if (!WEBHOOK_SECRET) {
    throw new Error("Missing WEBHOOK_SECRET from Clerk Dashboard");
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
    console.error("Webhook verification failed:", err);
    return new Response("Invalid webhook signature", { status: 400 });
  }

  const data = evt.data as Record<string, any>;

  const {
    id,
    email_addresses,
    image_url,
    first_name = "",
    last_name = "",
    username = "unknown",
  } = data;

  await connectToDatabase();

  if (eventType === "user.created") {
    const mongoUser = await createUser({
      clerkId: id,
      name: first_name && last_name ? `${first_name} ${last_name}` : username,
      email: email_addresses[0].email_address,
      username,
      picture: image_url,
    });

    return NextResponse.json({ message: "User created", user: mongoUser });
  }

  if (eventType === "user.updated") {
    const mongoUser = await updateUser({
      clerkId: id,
      updateData: {
        name: first_name && last_name ? `${first_name} ${last_name}` : username,
        email: email_addresses[0].email_address,
        username,
        picture: image_url,
      },
      path: `/profile/${id}`,
    });

    return NextResponse.json({ message: "User updated", user: mongoUser });
  }

  if (eventType === "user.deleted") {
    const deletedUser = await deleteUser({ clerkId: id! });
    return NextResponse.json({ message: "User deleted", user: deletedUser });
  }

  return new Response("Unhandled event type", { status: 200 });
}
