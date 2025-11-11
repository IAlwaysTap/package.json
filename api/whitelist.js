const { Octokit } = require("@octokit/core");

module.exports = async (req, res) => {
  const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
  const owner = process.env.REPO_OWNER;
  const repo = process.env.REPO_NAME;
  const path = "whitelist.json";

  async function load() {
    try {
      const { data } = await octokit.request('GET /repos/{owner}/{repo}/contents/{path}', { owner, repo, path });
      const content = Buffer.from(data.content, 'base64').toString();
      return { json: JSON.parse(content), sha: data.sha };
    } catch (e) {
      if (e.status === 404) return { json: {}, sha: null };
      throw e;
    }
  }

  async function save(data, sha) {
    const content = Buffer.from(JSON.stringify(data, null, 2)).toString('base64');
    await octokit.request('PUT /repos/{owner}/{repo}/contents/{path}', {
      owner, repo, path,
      message: "Update whitelist",
      content,
      sha
    });
  }

  try {
    const { json: data, sha } = await load();

    if (req.method === "GET") {
      const { action, discord_id, hwid } = req.query;

      if (action === "check") {
        return res.json({ whitelisted: Object.values(data).includes(hwid) });
      }
      if (action === "get_hwid") {
        return res.json({ hwid: data[discord_id] || null });
      }
      if (action === "hwid_exists") {
        return res.json({ exists: Object.values(data).includes(hwid) });
      }
      return res.status(400).json({ error: "Invalid action" });
    }

    if (req.method === "POST") {
      const body = req.body;
      const action = body.action;
      const discord_id = body.discord_id?.toString();

      if (action === "add") {
        if (data[discord_id]) return res.status(400).json({ error: "Already whitelisted" });
        if (Object.values(data).includes(body.hwid)) return res.status(400).json({ error: "HWID used" });
        data[discord_id] = body.hwid;
      }

      else if (action === "reset") {
        if (!data[discord_id]) return res.status(400).json({ error: "Not whitelisted" });
        const old = data[discord_id];
        if (Object.values(data).includes(body.new_hwid) && body.new_hwid !== old)
          return res.status(400).json({ error: "New HWID already used" });
        data[discord_id] = body.new_hwid;
      }

      else if (action === "remove") {
        if (!data[discord_id]) return res.status(400).json({ error: "Not found" });
        delete data[discord_id];
      }

      else {
        return res.status(400).json({ error: "Invalid action" });
      }

      await save(data, sha);
      return res.json({ success: true });
    }

    res.status(405).json({ error: "Method not allowed" });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
};
