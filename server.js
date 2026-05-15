import { Hono } from "hono";
import { cors } from "hono/cors";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { streamText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";

// ---------------------------------------------------------------------------
// System prompt — edit this to update the chatbot's knowledge
// ---------------------------------------------------------------------------
const SYSTEM_PROMPT = `You are Olive, the friendly assistant for Studio Olive (shopstudioolive.com) — a cute, magical accessories boutique inspired by Disney and pop culture.

Your personality: warm, enthusiastic, and fun. Use a conversational tone. Keep answers concise but helpful. You can use the occasional emoji 🛍️✨.

---

## PRODUCTS & PRICES

**Bags**
- Belt Bags — ~$40 (standard size)
- XL Belt Bags — ~$45 (larger size, great for parks and travel)
- Backpacks — ~$45
- Tote Bags — various styles

**Accessories**
- Acrylic Bag Charms & Keychains — $8–$22 (exclusive designs, lobster clasp fits any bag)
- Neoprene Cup Sleeves — $8–$10 (keep drinks hot or cold, custom designs)

Products often come in **matching themed sets** — same design across bags, charms, and sleeves. If a customer likes one item, suggest checking if there's a matching set.

---

## SHIPPING & RETURNS

- **US orders** → shopstudioolive.com
- **International orders** → Etsy shop at https://www.etsy.com/shop/ShopStudioOlive
- For return/exchange questions, direct customers to contact the team at @ShopStudioOlive on Instagram or via the website

---

## FREQUENTLY ASKED QUESTIONS

**Do you do custom orders or personalised designs?**
No, we don't offer custom or personalised orders at this time. All designs are limited edition — follow @ShopStudioOlive on Instagram to be the first to know about new drops!

**When do you restock?**
Many designs are limited edition and may not restock. Follow @ShopStudioOlive on Instagram or sign up on the website to get notified.

**Are products limited edition?**
Yes! Most designs are limited edition and sell out fast. If something is out of stock, it may not come back — grab it while you can!

**Do bag charms fit all bags?**
Yes — our charms have a lobster clasp that clips onto any bag with a D-ring or zipper pull, including all Studio Olive bags.

**How do I care for my bag?**
Spot clean with a damp cloth. Avoid machine washing to keep the design looking its best.

**I have a preorder in my order — will my other items ship first? Will preorders ship separately?**
Great question! If your order includes a preorder item, everything in that order will be shipped together once the preorder is ready. So your in-stock items will wait until the preorder ships. If you'd like your in-stock items sooner, we'd recommend placing them in a separate order! 🛍️

**Where is my order? / When will my order ship? / Order tracking questions**
We can't look up individual orders in this chat. Respond warmly and ask the customer for their email address AND any helpful order details (order number, full name, or the email used at checkout) so the team can look it up quickly. Example: "That's a great question! To help our team look up your order as quickly as possible, could you share your email address and order number (or the name used at checkout)? We'll follow up with you directly! 💕" Then add <<ESCALATE:NO_EMAIL>> at the very end. Once they provide their email, follow Rule 2.

**Do you ship internationally / to Canada / outside the US?**
Our Shopify store (shopstudioolive.com) ships within the US, but we ship internationally through our Etsy shop! You can order from anywhere in the world here: https://www.etsy.com/shop/ShopStudioOlive

**What payment methods do you accept?**
All major credit cards, PayPal, Shop Pay, Apple Pay, and Google Pay are accepted at checkout.

---

## RULES

1. If you don't know the answer, respond warmly and ask for their email so the team can follow up personally. Example: "That's a great question and I want to make sure you get the right answer! Could you share your email address and I'll make sure our team gets back to you personally? 💕" Then add <<ESCALATE:NO_EMAIL>> on a new line at the very end (hidden system tag — never explain it to the customer).
2. If the customer has just provided their email address (in response to being asked), acknowledge it warmly, e.g. "Perfect, thank you! Our team will be in touch at [their email] shortly 🛍️✨" Then add <<ESCALATE:their@email.com>> on a new line at the very end, replacing "their@email.com" with the actual email they gave.
3. Never make up prices, stock levels, or shipping times you don't have above.
4. Always be warm and encouraging — we want customers to feel excited about the brand.
5. If someone asks about a specific product you don't have info on, suggest they browse shopstudioolive.com or DM on Instagram, and add <<ESCALATE:NO_EMAIL>> at the end.`;

// ---------------------------------------------------------------------------
// Rate limiting — max 20 requests per IP per minute
// ---------------------------------------------------------------------------
const rateLimitMap = new Map();
const RATE_LIMIT = 20;
const RATE_WINDOW_MS = 60_000;

function isRateLimited(ip) {
  const now = Date.now();
  const entry = rateLimitMap.get(ip) || { count: 0, windowStart: now };

  if (now - entry.windowStart > RATE_WINDOW_MS) {
    entry.count = 1;
    entry.windowStart = now;
  } else {
    entry.count += 1;
  }

  rateLimitMap.set(ip, entry);
  return entry.count > RATE_LIMIT;
}

// Purge stale IPs every 5 minutes to prevent memory leak
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateLimitMap.entries()) {
    if (now - entry.windowStart > RATE_WINDOW_MS) rateLimitMap.delete(ip);
  }
}, 5 * 60_000);

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------
const openai = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  compatibility: "strict",
});

const app = new Hono();

// CORS — allow requests from the Shopify store and localhost for dev
app.use("/chat", cors({
  origin: [
    "https://shopstudioolive.com",
    "https://www.shopstudioolive.com",
    "http://localhost:3000",
  ],
  allowMethods: ["POST", "OPTIONS"],
  allowHeaders: ["Content-Type"],
}));

app.use("/", serveStatic({ path: "./public/index.html" }));
app.use("/public/*", serveStatic({ root: "./" }));

async function sendEscalationEmail(customerQuestion, customerEmail) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return;

  const hasEmail = customerEmail && customerEmail !== "NO_EMAIL";
  const subject  = hasEmail ? `💬 Customer needs help — reply to ${customerEmail}` : "💬 Customer needs your help!";
  const emailLine = hasEmail
    ? `Customer email: ${customerEmail}`
    : `The customer did not provide an email.`;

  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from: "Studio Olive Bot <onboarding@resend.dev>",
        to: process.env.NOTIFY_EMAIL,
        subject,
        text: `A customer needs your help!\n\nWhat they asked:\n"${customerQuestion}"\n\n${emailLine}\n\nCheck the chat for any order number or name they provided.`,
      }),
    });
    console.log("📧 Escalation email sent — customer email:", customerEmail || "not provided");
  } catch (err) {
    console.error("❌ Failed to send escalation email:", err.message);
  }
}

app.post("/chat", async (c) => {
  const ip = c.req.header("x-forwarded-for")?.split(",")[0].trim() || "unknown";
  if (isRateLimited(ip)) {
    return c.text("Too many requests — please slow down and try again shortly.", 429);
  }

  try {
    const body = await c.req.json();
    const messages = body?.messages;

    // Input validation
    if (!Array.isArray(messages) || messages.length === 0) {
      return c.text("Invalid request.", 400);
    }
    if (messages.length > 40) {
      return c.text("Conversation too long.", 400);
    }
    if (!messages.every(m => typeof m.role === "string" && typeof m.content === "string")) {
      return c.text("Invalid message format.", 400);
    }

    // Find the real question — skip messages that look like just an email address
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const userMessages = messages.filter(m => m.role === "user");
    const customerQuestion = [...userMessages].reverse()
      .find(m => !emailPattern.test(m.content.trim()))?.content
      || userMessages[userMessages.length - 1]?.content || "";

    const result = streamText({
      model: openai.chat("gpt-4o-mini"),
      system: SYSTEM_PROMPT,
      messages,
      maxTokens: 400,
      onFinish: ({ text }) => {
        const match = text.match(/<<ESCALATE:([^>]*)>>/);
        if (match) {
          const customerEmail = match[1].trim();
          sendEscalationEmail(customerQuestion, customerEmail);
        }
      },
    });

    // Stream response to client, stripping the hidden <<ESCALATE>> tag.
    // We buffer the tail so a tag split across chunks is always caught.
    const TAIL = 50; // longer than any possible <<ESCALATE:email@address.com>> tag
    const decoder = new TextDecoder();
    const encoder = new TextEncoder();
    const { readable, writable } = new TransformStream({
      start(ctrl) { this.buf = ""; },
      transform(chunk, ctrl) {
        this.buf += decoder.decode(chunk, { stream: true });
        // Strip any complete tags
        this.buf = this.buf.replace(/<<ESCALATE:[^>]*>>/g, "");
        // Flush everything except the last TAIL chars (may hold a partial tag)
        if (this.buf.length > TAIL) {
          ctrl.enqueue(encoder.encode(this.buf.slice(0, -TAIL)));
          this.buf = this.buf.slice(-TAIL);
        }
      },
      flush(ctrl) {
        // Strip any partial tag remnant before flushing the rest
        const remaining = this.buf.replace(/<<ESCALATE:[^>]*/g, "");
        if (remaining) ctrl.enqueue(encoder.encode(remaining));
      },
    });

    result.toTextStreamResponse().body.pipeTo(writable);

    return new Response(readable, {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  } catch (err) {
    console.error("❌ Chat error:", err.message);
    return c.text("Something went wrong. Please try again!", 500);
  }
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
const PORT = parseInt(process.env.PORT) || 3000;
serve({ fetch: app.fetch, port: PORT, hostname: "0.0.0.0" }, () => {
  console.log(`✅ Studio Olive chat server running at http://localhost:${PORT}`);
});
