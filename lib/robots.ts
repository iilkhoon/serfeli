type Rule = { allow: boolean; path: string };
type Group = { agents: string[]; rules: Rule[]; crawlDelay?: number };
// RFC 9309 groups: consecutive User-agent lines share the rules that follow. A group ends at the
// first User-agent line after any other directive, including an empty "Disallow:" (allow all).
function parseRobots(text: string) {
  const groups: Group[] = [];
  const sitemaps: string[] = [];
  let current: Group | undefined;
  let inAgents = false;
  for (const raw of text.replace(/^﻿/, "").split(/\r?\n|\r/)) {
    const line = raw.split("#")[0].trim();
    const at = line.indexOf(":");
    if (at < 0) continue;
    const field = line.slice(0, at).trim().toLowerCase(),
      value = line.slice(at + 1).trim();
    if (field === "sitemap") {
      if (value) sitemaps.push(value);
      continue;
    }
    if (field === "user-agent") {
      if (!current || !inAgents) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      inAgents = true;
      continue;
    }
    if (!current) continue;
    inAgents = false;
    if ((field === "allow" || field === "disallow") && value)
      current.rules.push({ allow: field === "allow", path: value });
    else if (field === "crawl-delay") {
      const delay = Number(value.replace(",", "."));
      if (Number.isFinite(delay) && delay >= 0) current.crawlDelay = delay;
    }
  }
  return { groups, sitemaps };
}
function groupsFor(text: string, agent: string) {
  const token = agent.toLowerCase();
  let priority = -1;
  let chosen: Group[] = [];
  for (const group of parseRobots(text).groups) {
    const specificity = Math.max(
      -1,
      ...group.agents.map((a) => (a === "*" ? 0 : a && token.includes(a) ? a.length : -1)),
    );
    if (specificity > priority) {
      priority = specificity;
      chosen = [group];
    } else if (specificity === priority && specificity >= 0) chosen.push(group);
  }
  return chosen;
}
export function robotsAllowed(text: string, path: string, agent = "QepikBot") {
  const rules = groupsFor(text, agent).flatMap((g) => g.rules);
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
// Crawl-delay in milliseconds for the group that applies to the agent (0 when none is given).
export function robotsCrawlDelayMs(text: string, agent = "QepikBot") {
  const delays = groupsFor(text, agent)
    .map((g) => g.crawlDelay)
    .filter((d): d is number => d !== undefined);
  return delays.length ? Math.round(Math.max(...delays) * 1000) : 0;
}
// Sitemap URLs the site owner advertises in robots.txt.
export function robotsSitemaps(text: string) {
  return parseRobots(text).sitemaps;
}
