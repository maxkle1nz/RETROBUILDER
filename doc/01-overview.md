# System Overview

## Project Vision
The project is an advanced, cyberpunk-themed visual blueprint creator and system architecture analysis tool. It allows users to design, visualize, and analyze complex system architectures using a node-based graph interface.

## Core Objectives
1. **Visual Architecture Design:** Provide a 3D interactive graph interface to map out system components (nodes) and their relationships (links).
2. **AI-Assisted Generation:** Utilize advanced LLMs via a SSOT provider architecture (xAI Grok, THE BRIDGE) to automatically generate system architectures, manifestos, and technical proposals based on natural language prompts.
3. **Deep Graph Analysis (m1nd Integration):** Integrate with a specialized graph analysis engine (`m1nd`) to perform deep structural analysis, such as calculating the "blast radius" of a failing component or predicting co-changes when a component is modified.
4. **Secure Architecture:** Maintain a secure backend to handle sensitive API keys and AI requests, keeping the frontend lightweight and secure.
5. **Dual Operational Modes:** Offer distinct user experiences for different tasks:
   - **ARCHITECT Mode:** Focused on building, editing, and defining the data contracts of the system blueprint.
   - **M1ND Mode:** Focused on deep analysis, impact prediction, and querying the graph structure via the `m1nd` engine.

## High-Level Architecture
- **Frontend:** React, Vite, Tailwind CSS, Zustand (state management), `react-force-graph-3d` (3D visualization), Framer Motion (animations).
- **Backend:** Express.js server acting as an API gateway for AI requests and serving the static frontend in production.
- **AI Integration:** SSOT Provider Layer — supports xAI Grok (`openai` SDK → `api.x.ai/v1`) and THE BRIDGE (local proxy → `127.0.0.1:7788/v1`).
- **m1nd Engine:** A local MCP (Model Context Protocol) server accessed via a WebSocket proxy, providing advanced graph algorithms.
