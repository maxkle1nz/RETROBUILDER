#!/usr/bin/env tsx
import { extractJSON } from '../src/server/ai-helpers.ts';
import { SystemStateSchema, validateAIResponse } from '../src/server/validation.ts';

function expect(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

function parseExtracted(input: string) {
  return JSON.parse(extractJSON(input));
}

function test_extracts_graph_json_after_prose_braces() {
  const parsed = parseExtracted(`
    08
    I will use contracts like Input: {...} -> Output: {...}.
    {
      "manifesto": "Build the thing",
      "architecture": "Modular",
      "graph": {
        "nodes": [
          {
            "id": "api",
            "label": "API",
            "description": "API module",
            "status": "pending",
            "type": "backend",
            "group": 1
          }
        ],
        "links": []
      },
      "explanation": "Created a minimal graph."
    }
    Next: continue
  `);

  expect(parsed.graph.nodes[0].id === 'api', 'Expected graph JSON to be extracted instead of prose braces.');
}

function test_extracts_fenced_json_with_trailing_text() {
  const parsed = parseExtracted(`
    \`\`\`json
    {
      "graph": {
        "nodes": [],
        "links": []
      }
    }
    \`\`\`
    Next: none
  `);

  expect(Array.isArray(parsed.graph.nodes), 'Expected fenced JSON to be extracted.');
}

function test_preserves_braces_inside_strings() {
  const parsed = parseExtracted(`{
    "data_contract": "Input: {\\"id\\": \\"x\\"} -> Output: {\\"ok\\": true}",
    "graph": {
      "nodes": [],
      "links": []
    }
  }`);

  expect(parsed.data_contract.includes('Input:'), 'Expected braces inside strings to remain intact.');
}

function test_extracts_json_after_bridge_fallback_preface() {
  const parsed = parseExtracted(`
    THEBRIDGE returned a resilient fallback summary before local Codex completed.
    Notes: examples may look like Input: {...} -> Output: {...}.
    {
      "manifesto": "Compact manifesto",
      "architecture": "Compact architecture",
      "graph": {
        "nodes": [
          {
            "id": "whatsapp",
            "label": "WhatsApp Intake",
            "description": "Receives bakery orders. Normalizes customer messages.",
            "status": "pending",
            "type": "backend"
          }
        ],
        "links": []
      },
      "explanation": "Extracted after fallback prose."
    }
  `);

  expect(parsed.graph.nodes[0].id === 'whatsapp', 'Expected graph JSON after fallback prose to be extracted.');
}

function test_extracts_fenced_json_with_bridge_fallback_footer() {
  const parsed = parseExtracted(`
    \`\`\`json
    {
      "graph": {
        "nodes": [
          { "id": "mobile", "label": "Mobile Web", "description": "Mobile-first ordering.", "status": "pending", "type": "frontend" }
        ],
        "links": []
      }
    }
    \`\`\`
    THEBRIDGE fallback footer: completed locally.
  `);

  expect(parsed.graph.nodes[0].id === 'mobile', 'Expected fenced JSON before fallback footer to be extracted.');
}

function test_validate_ai_response_selects_valid_schema_candidate() {
  const validated = validateAIResponse(`
    Planner note: a tiny example object may appear first.
    {"example": true}

    {
      "manifesto": "CasaCare brings concierge home maintenance to mobile customers.",
      "architecture": "Line one
Line two",
      "graph": {
        "nodes": [
          { "id": "mobile", "label": "Mobile Web", "type": "frontend", "status": "pending" }
        ],
        "links": [],
      },
      "explanation": "Valid graph follows a non-schema example."
    }
  `, SystemStateSchema, 'jsonExtractionRegression');

  expect(validated.graph.nodes[0].id === 'mobile', 'Expected validator to skip non-schema JSON and accept the graph candidate.');
  expect(validated.architecture.includes('Line two'), 'Expected raw newlines inside JSON strings to be sanitized.');
}

function run() {
  const tests = [
    test_extracts_graph_json_after_prose_braces,
    test_extracts_fenced_json_with_trailing_text,
    test_preserves_braces_inside_strings,
    test_extracts_json_after_bridge_fallback_preface,
    test_extracts_fenced_json_with_bridge_fallback_footer,
    test_validate_ai_response_selects_valid_schema_candidate,
  ];

  for (const test of tests) {
    test();
    console.log(`PASS ${test.name}`);
  }

  console.log(`\n${tests.length}/${tests.length} tests passed`);
}

run();
