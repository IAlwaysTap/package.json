const { Octokit } = require("@octokit/core");

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
  const owner = process.env.REPO_OWNER;
  const repo = process.env.REPO_NAME;
  const path = "whitelist.json";

  const load = async () => {
    try {
      const { data } = await octokit.request("GET /repos/{owner}/{repo}/contents/{path}", { owner, repo, path });
      const content = Buffer.from(data.content, "base64").toString();
      return { data: JSON.parse(content), sha: data.sha };
    } catch (e) {
      if (e.status === 404) return { data: {}, sha: null };
      console.error(e);
      return { data: {}, sha: null };
    }
  };

  const save = async (json, sha) => {
    const content = Buffer.from(JSON.stringify(json, null, 2)).toString("base64");
    await octokit.request("PUT /repos/{owner}/{repo}/contents/{path}", {
      owner, repo, path,
      message: "Update whitelist",
      content,
      sha: sha || undefined
    });
  };

  try {
    const { data, sha } = await load();

    if (req.method === "GET") {
      const { action, discord_id, hwid } = req.query;
      if (action === "check") return res.json({ whitelisted: Object.values(data).includes(hwid) });
      if (action === "get_hwid") return res.json({ hwid: data[discord_id] || null });
      if (action === "hwid_exists") return res.json({ exists: Object.values(data).includes(hwid) });
      return res.status(400).json({ error: "Invalid action" });
    }

    if (req.method === "POST") {
      const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
      const { action, discord_id, hwid, new_hwid } = body;

      if (action === "add") {
        if (data[discord_id]) return res.status(400).json({ error: "Already exists" });
        if (Object.values(data).includes(hwid)) return res.status(400).json({ error: "HWID used" });
        data[discord_id] = hwid;
      } else if (action === "reset") {
        if (!data[discord_id]) return res.status(400).json({ error: "Not found" });
        delete Object.keys(data).find(key => data[key] === data[discord_id]);
        data[discord_id] = new_hwid;
      } else if (action === "remove") {
        if (!data[discord_id]) return res.status(400).json({ error: "Not found" });
        delete data[discord_id];
      } else {
        return res.status(400).json({ error: "Invalid action" });
      }

      await save(data, sha);
      return res.json({ success: true });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
};
