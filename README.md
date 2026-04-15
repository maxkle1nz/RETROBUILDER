<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# M1ND // RETROBUILDER

AI-powered visual blueprint creator & system architecture analysis tool.

## Run Locally

**Prerequisites:** Node.js 18+

1. Install dependencies:
   ```bash
   npm install
   ```

2. Configure your AI provider in `.env.local`:
   ```bash
   AI_PROVIDER="xai"
   XAI_API_KEY="your-xai-api-key"
   ```

   **Supported providers:**
   - `xai` — xAI Grok (requires `XAI_API_KEY`)
   - `bridge` — [THE BRIDGE](https://github.com/maxkle1nz/thebridge) local proxy (no key needed)

3. Run the app:
   ```bash
   npm run dev
   ```

## Architecture

```
Frontend (React/Vite) → Express API Gateway → SSOT Provider Layer
                                                  ├── xAI Grok
                                                  └── THE BRIDGE (local)
```

The provider layer is a SSOT (Single Source of Truth) abstraction. All AI backends implement the same `chatCompletion(messages, config)` contract. Switch providers with a single env var.

## M1ND Mode

For deep structural analysis, run the m1nd MCP proxy:
```bash
npx @modelcontextprotocol/websockets-stdio m1nd-mcp
```
Then switch to M1ND mode in the app to access blast radius, co-change prediction, and hypothesis testing.
