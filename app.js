const STAGES = [
  { id: "trigger", label: "1. Trigger", detail: "issues.labeled + OpenCode label (native listener)" },
  { id: "prepare", label: "2. Prepare", detail: "OIDC/user/request claim; freeze target_ref/target_sha" },
  { id: "build", label: "3. Build", detail: "OpenCode goal session builds browser project" },
  { id: "verify", label: "4. Verify", detail: "Forked session: entrypoint + browser tests + fixes" },
  { id: "expose", label: "5. Expose", detail: "npm start on :3000 + trycloudflare public URL" },
  { id: "screenshots", label: "6. Screenshots", detail: "screenshots/final-* real-browser evidence" },
  { id: "push", label: "7. Push", detail: "Commit + push opencode/<run-id> branch" },
  { id: "release", label: "8. Release", detail: "opencode-logs-<run-id> logs release" },
  { id: "report", label: "9. Report", detail: "Open Project tree URL + complete label" },
];

const DEFAULT_STATUS = { trigger: "pass", prepare: "pass", build: "active", verify: "pending", expose: "pending", screenshots: "pending", push: "pending", release: "pending", report: "pending" };

function render(statuses) {
  const root = document.getElementById("stages");
  root.innerHTML = "";
  for (const stage of STAGES) {
    const status = statuses[stage.id] || "pending";
    const card = document.createElement("article");
    card.className = "stage";
    card.dataset.stage = stage.id;
    card.dataset.status = status;
    const title = document.createElement("h3");
    const dot = document.createElement("span");
    dot.className = "dot";
    title.append(dot, stage.label);
    const detail = document.createElement("p");
    detail.textContent = stage.detail;
    card.append(title, detail);
    root.append(card);
  }
}

async function loadStatuses() {
  try {
    const response = await fetch("evidence.json", { cache: "no-store" });
    if (!response.ok) throw new Error("no evidence");
    const data = await response.json();
    if (data && data.stages) return data.stages;
  } catch {
    // fall through to defaults
  }
  return DEFAULT_STATUS;
}

async function checkHealth() {
  const target = document.getElementById("health");
  try {
    const response = await fetch("/health", { cache: "no-store" });
    const data = await response.json();
    target.textContent = data && data.ok ? "Health: ok (server reachable)" : "Health: unexpected response";
  } catch {
    target.textContent = "Health: unreachable";
  }
}

render(DEFAULT_STATUS);
loadStatuses().then(render);
document.getElementById("verify-btn").addEventListener("click", async () => {
  render(await loadStatuses());
  await checkHealth();
});
checkHealth();
