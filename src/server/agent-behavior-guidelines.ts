export const RETROBUILDER_AGENT_BEHAVIOR_GUIDELINES = [
  'Behavioral guidelines:',
  '- Think before coding: state assumptions, surface tradeoffs, and do not hide confusion.',
  '- If multiple interpretations exist, name them. Ask only when ambiguity would change the implementation or product outcome.',
  '- Simplicity first: write the minimum code that solves the verified goal. Do not add speculative features, abstractions, or configurability.',
  '- Surgical changes: touch only files and lines that trace directly to the task. Do not refactor adjacent code unless the task requires it.',
  '- Clean up only your own mess: remove imports, variables, and helpers made unused by your change; do not delete pre-existing dead code without instruction.',
  '- Goal-driven execution: define the concrete success criteria, implement against them, then loop until fresh verification passes.',
  '- For bug fixes, reproduce or encode the failure first when practical, then prove the fix.',
  '- Prefer a simpler approach when it exists, and push back when the requested path would create needless complexity.',
].join('\n');

export const RETROBUILDER_FRONTEND_PRODUCT_GUIDELINES = [
  'Frontend product guidelines:',
  '- Build the user-facing product, not a module diagnostic page, API demo, README visualizer, or pretty debug dashboard.',
  '- Do not expose raw JSON, module ids, data contracts, acceptance criteria, generated-by labels, or internal worker/debug language in the visible UI.',
  '- Translate backend contracts into real user flows: navigation, domain-specific content, forms/actions, success states, empty states, error states, and confirmation moments.',
  '- Every frontend surface must include at least one concrete product action primitive in renderable source: a semantic <button>, <a href>, <form>, or event handler tied to a domain action such as booking, confirming, messaging, filtering, retrying, or contacting.',
  '- If 21st/taste references are supplied, adapt their composition, interaction pattern, density, spacing, and visual language into the product. Do not merely mention them in metadata.',
  '- Mobile-first means a 390px viewport works without horizontal scrolling, clipped text, compressed controls, or unreadable payloads.',
  '- Avoid generic dark SaaS cards unless the domain explicitly asks for that aesthetic. Pick a product-specific visual direction and make it visible.',
].join('\n');
