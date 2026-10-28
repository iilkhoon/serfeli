type Rule = { allow: boolean; path: string };
export function robotsAllowed(text: string, path: string, agent = "QepikBot") {
  const groups: { agents: string[]; rules: Rule[] }[] = [];
  let current: { agents: string[]; rules: Rule[] } | undefined;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.split("#")[0].trim();
    const at = line.indexOf(":");
    if (at < 0) continue;
    const field = line.slice(0, at).toLowerCase(),
      value = line.slice(at + 1).trim();
    if (field === "user-agent") {
      if (!current || current.rules.length) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
    } else if (current && (field === "allow" || field === "disallow") && value)
      current.rules.push({ allow: field === "allow", path: value });
  }
  const token = agent.toLowerCase();
  let priority = -1;
  let rules: Rule[] = [];
  for (const group of groups) {
    const specificity = Math.max(
      -1,
      ...group.agents.map((a) => (a === "*" ? 0 : token.includes(a) ? a.length : -1)),
    );
    if (specificity > priority) {
      priority = specificity;
      rules = [...group.rules];
    } else if (specificity === priority && specificity >= 0) rules.push(...group.rules);
  }
  let decision = true,
    length = -1;
  for (const rule of rules) {
    const end = rule.path.endsWith("$");
    const value = end ? rule.path.slice(0, -1) : rule.path;
    const pattern = value
      .split("*")
      .map((p) => p.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
      .join(".*");
    if (!new RegExp("^" + pattern + (end ? "$" : "")).test(path)) continue;
    const size = value.replace(/\*/g, "").length;
    if (size > length || (size === length && rule.allow)) {
      length = size;
      decision = rule.allow;
    }
  }
  return decision;
}
