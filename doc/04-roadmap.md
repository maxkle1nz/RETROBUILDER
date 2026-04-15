# Roadmap & Pending Tasks

While the core architecture and integrations are in place, several features and refinements are needed to complete the vision.

## 1. Global Search & Deep Querying (m1nd.activate)
**Objective:** Allow users to ask complex questions about the graph structure using the `m1nd` engine.
- **Implementation Options:**
  - *Option A (Global Search Bar):* Add a Spotlight-style search bar at the top of the UI dedicated to `m1nd.activate()` queries (e.g., "Find all nodes dependent on the Auth service").
  - *Option B (Chat Integration):* Modify the existing Chat Footer so that if the user is in M1ND mode, their prompt is sent to `m1nd.activate()` instead of the Gemini generation API.
- **Status:** Pending decision and implementation.

## 2. Graph Interaction Refinements
**Objective:** Improve the usability of the 3D graph.
- **Tasks:**
  - Implement visual highlighting for nodes returned by `m1nd` analysis (e.g., if "Blast Radius" returns 3 nodes, highlight them in red on the 3D canvas).
  - Add visual indicators for data flow direction (arrows on links).
  - Improve node clustering and physics stabilization.

## 3. AI Action Execution (KREATOR Mode)
**Objective:** Currently, the KREATOR mode generates a *proposal* for modifying the graph. It needs the ability to actually *apply* those modifications.
- **Tasks:**
  - Create an endpoint/function that takes the accepted proposal and the current graph, and returns an updated graph structure.
  - Add "Accept/Reject" UI for the pending proposal in the chat interface.

## 4. Error Handling & Edge Cases
**Objective:** Make the application robust against failures.
- **Tasks:**
  - Better UI feedback when the Gemini API fails or times out.
  - Graceful degradation if the local `m1nd` proxy disconnects unexpectedly.
  - Validation of AI-generated JSON to prevent frontend crashes if the LLM hallucinates malformed data.

## 5. Deployment Preparation
**Objective:** Prepare the app for production hosting.
- **Tasks:**
  - Ensure all environment variables (`GEMINI_API_KEY`) are properly documented in a `.env.example`.
  - Verify the Vite build process and Express static file serving work flawlessly in a containerized environment (like Google Cloud Run).
