# Studio Olive — AI Customer Support Agent

A terminal-based AI assistant for [shopstudioolive.com](https://shopstudioolive.com) powered by LangChain and the Shopify Storefront API. It answers customer questions about products, pricing, stock, shipping, returns, and store policies in real time.

## Prerequisites

- Node.js 20.6+ (uses built-in `--env-file` and `fetch`)
- An OpenAI API key
- A Shopify Storefront API access token

## Setup

**1. Install dependencies**
```bash
npm install
```

**2. Create your `.env` file**
```bash
cp .env.example .env
```
Then fill in the values in `.env` (see [Environment Variables](#environment-variables) below).

**3. Run the agent**
```bash
node --env-file=.env agent.js
```

## Environment Variables

| Variable | Description |
|---|---|
| `OPENAI_API_KEY` | Your OpenAI API key from [platform.openai.com/api-keys](https://platform.openai.com/api-keys) |
| `SHOPIFY_STOREFRONT_TOKEN` | Shopify Storefront API access token (see below) |

### Getting a Shopify Storefront Token

1. Go to **Shopify Admin → Apps → Develop apps**
2. Create or select an app
3. Go to **Configuration → Storefront API access scopes**
4. Enable:
   - `unauthenticated_read_product_listings`
   - `unauthenticated_read_content`
5. Save, then copy the **Storefront API access token**

## What the Agent Can Do

| Capability | Example questions |
|---|---|
| Search products | "Do you have any gift sets?" / "What olive oils do you sell?" |
| Pricing & stock | "How much is the extra virgin olive oil?" / "Is the large bottle in stock?" |
| Collections | "What categories do you carry?" |
| Shipping policy | "How long does shipping take?" / "Do you ship internationally?" |
| Returns & refunds | "What's your return policy?" |
| Store pages | "Tell me about the company" / "Where's your FAQ?" |

## Usage

Type any customer question at the prompt. Type `quit` to exit.

```
Studio Olive Assistant is ready. Type 'quit' to exit.

You: Do you have any gift sets?
Assistant: Yes! Here are the gift sets currently available...

You: quit
Goodbye!
```

## Project Structure

```
agent.js        — Main agent with all tools and chat loop
package.json    — Dependencies
.env            — Your local secrets (never commit this)
.env.example    — Template for required environment variables
```
