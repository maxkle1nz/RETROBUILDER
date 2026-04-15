import dotenv from 'dotenv';
dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local', override: true });
import express from "express";
import rateLimit from "express-rate-limit";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import { createProvider, type AIProvider, type ChatMessage } from "./src/server/providers/index.js";
import { validateAIResponse, SystemStateSchema, GraphDataSchema, AnalysisResultSchema } from "./src/server/validation.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── SSOT Provider Initialization ────────────────────────────────────
const provider: AIProvider = createProvider();

function extractJSON(text: string): string {
  const match = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  return match ? match[1] : text;
}

// ─── Rate Limiting ───────────────────────────────────────────────────
const aiLimiter = rateLimit({
  windowMs: 60 * 1000,      // 1 minute window
  max: 20,                   // 20 requests per minute per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Rate limit exceeded. Try again in a moment." },
});

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '50mb' }));

  // --- API Routes ---
  app.get("/api/health", (req, res) => {
    res.json({
      status: "ok",
      provider: provider.name,
      label: provider.label,
    });
  });

  // Apply rate limiting to all AI endpoints
  app.use("/api/ai", aiLimiter);

  app.post("/api/ai/generateGraphStructure", async (req, res) => {
    const { prompt, currentGraph, currentManifesto } = req.body;

    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({ error: "Missing or invalid 'prompt' field." });
    }

    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: `You are an expert system architect and mind-map generator (m1nd).
Your task is to break down a user's project request into a detailed DAG (Directed Acyclic Graph) structure AND generate project artifacts.
If a current graph or manifesto is provided, modify or expand them based on the user's prompt.
Return the result as a JSON object with 'manifesto', 'architecture', and 'graph' (containing 'nodes' and 'links').

Artifacts:
- manifesto: A high-level project manifesto, core objectives, and business rules (Markdown).
- architecture: Technical architecture decisions, patterns, and stack rationale (Markdown).

Nodes must have: 
- id (string)
- label (string)
- description (string)
- status (pending|in-progress|completed)
- type (frontend|backend|database|external|security)
- data_contract (string, optional: what inputs it receives and outputs it returns)
- decision_rationale (string, optional: why this architectural choice was made)
- group (number for clustering)

Links must have: source (node id), target (node id), label (optional string describing the data flow).
Ensure the graph has a clear hierarchy and Single Source of Truth (SSOT). Avoid circular dependencies.

CRITICAL: You must return ONLY valid JSON.`
      },
      {
        role: 'user',
        content: `User Prompt: ${prompt}\n\nCurrent Manifesto: ${currentManifesto || 'None'}\nCurrent Graph: ${currentGraph ? JSON.stringify(currentGraph) : 'None'}`
      }
    ];

    try {
      const rawContent = await provider.chatCompletion(messages, { jsonMode: true });
      const validated = validateAIResponse(extractJSON(rawContent), SystemStateSchema, 'generateGraphStructure');
      res.json(validated);
    } catch (e: any) {
      console.error("[SSOT] Failed to generate graph structure:", e.message);
      res.status(500).json({ error: e.message || "Failed to generate graph structure" });
    }
  });

  app.post("/api/ai/generateProposal", async (req, res) => {
    const { prompt, currentGraph, manifesto } = req.body;

    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({ error: "Missing or invalid 'prompt' field." });
    }

    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: `You are the KREATOR, an advanced AI system architect.
The user wants to modify the existing system architecture.
Analyze their prompt against the current graph and manifesto.
Respond with a concise, highly technical, cyberpunk-flavored confirmation of what exactly you are going to change (e.g., "Injecting Redis cache node to offload DB overhead", "Rewiring Auth flow for strict RBAC").
Keep it under 3 sentences. Be direct, authoritative, and analytical. Do not use markdown formatting, just plain text.`
      },
      {
        role: 'user',
        content: `Manifesto: ${manifesto}\nCurrent Graph Nodes: ${currentGraph?.nodes?.length || 0}\nUser Prompt: ${prompt}\n\nWhat is your modification plan?`
      }
    ];

    try {
      const result = await provider.chatCompletion(messages);
      res.json({ proposal: result || "Awaiting confirmation to modify system topology." });
    } catch (e: any) {
      console.error("[SSOT] Failed to generate proposal:", e.message);
      res.status(500).json({ error: e.message || "Failed to generate proposal" });
    }
  });

  app.post("/api/ai/applyProposal", async (req, res) => {
    const { prompt, manifesto, currentGraph, proposal } = req.body;

    if (!prompt || !proposal) {
      return res.status(400).json({ error: "Missing 'prompt' or 'proposal' field." });
    }

    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: `You are a master system architect.
You are given the current system graph, a user prompt, and a proposal that was agreed upon.
Your task is to output the NEW updated graph structure in JSON format.
The output MUST be a valid JSON object with 'nodes' and 'links' arrays.
Nodes must have: id, label, group, description, data_contract, status, type.
Links must have: source, target, label.
CRITICAL: Return ONLY valid JSON.`
      },
      {
        role: 'user',
        content: `Current Graph: ${JSON.stringify(currentGraph)}\n\nUser Prompt: ${prompt}\n\nAgreed Proposal: ${proposal}\n\nGenerate the new graph JSON.`
      }
    ];

    try {
      const rawContent = await provider.chatCompletion(messages, { jsonMode: true });
      const validated = validateAIResponse(extractJSON(rawContent), GraphDataSchema, 'applyProposal');
      res.json(validated);
    } catch (e: any) {
      console.error("[SSOT] Failed to apply proposal:", e.message);
      res.status(500).json({ error: e.message || "Failed to apply proposal" });
    }
  });

  app.post("/api/ai/analyzeArchitecture", async (req, res) => {
    const { graph, manifesto } = req.body;

    if (!graph || !graph.nodes) {
      return res.status(400).json({ error: "Missing or invalid 'graph' field." });
    }

    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: `You are the "Critic", a senior software architect auditor.
Your job is to analyze the provided system graph and manifesto for flaws, security risks, missing components (like missing databases or auth), and circular dependencies.
If the architecture is solid, set isGood to true and provide a brief positive critique.
If it has flaws, set isGood to false, provide a harsh but constructive critique, and provide an 'optimizedGraph' with the necessary fixes (adding missing nodes, fixing links, updating data contracts).

CRITICAL: You must return ONLY valid JSON.`
      },
      {
        role: 'user',
        content: `Manifesto: ${manifesto}\n\nCurrent Graph: ${JSON.stringify(graph)}\n\nAnalyze this architecture.`
      }
    ];

    try {
      const rawContent = await provider.chatCompletion(messages, { jsonMode: true });
      const validated = validateAIResponse(extractJSON(rawContent), AnalysisResultSchema, 'analyzeArchitecture');
      res.json(validated);
    } catch (e: any) {
      console.error("[SSOT] Failed to analyze architecture:", e.message);
      res.status(500).json({ error: e.message || "Failed to analyze architecture" });
    }
  });

  app.post("/api/ai/performDeepResearch", async (req, res) => {
    const { node, projectContext } = req.body;

    if (!node || !node.label) {
      return res.status(400).json({ error: "Missing or invalid 'node' field." });
    }

    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: `You are an advanced AI research assistant for the 'm1nd' system.
Your task is to perform deep research and grounding for a specific system module.
You must synthesize information regarding:
1. Emerging technological trends (5-year forecast).
2. Promising GitHub repositories or open-source donors.
3. Scientific articles or technical documentation.
4. Suggestions to improve the design or implementation of this module.

Format your response in clean Markdown.`
      },
      {
        role: 'user',
        content: `Project Context: ${projectContext}\n\nModule to Research:\nName: ${node.label}\nDescription: ${node.description}\nData Contract: ${node.data_contract || 'None'}\n\nPlease provide a deep research report for this module.`
      }
    ];

    try {
      const result = await provider.chatCompletion(messages);
      res.json({ research: result || "Research failed." });
    } catch (e: any) {
      console.error("[SSOT] Failed to perform deep research:", e.message);
      res.status(500).json({ error: e.message || "Failed to perform deep research" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`\n╔══════════════════════════════════════════════╗`);
    console.log(`║    M1ND // RETROBUILDER                      ║`);
    console.log(`║    Server: http://localhost:${PORT}              ║`);
    console.log(`║    Provider: ${provider.label.padEnd(32)}║`);
    console.log(`║    Rate Limit: 20 req/min per IP             ║`);
    console.log(`╚══════════════════════════════════════════════╝\n`);
  });
}

startServer();
