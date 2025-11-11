const { Octokit } = require("@octokit/core");

module.exports = async (req, res) => {
  const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
  const owner = process.env.REPO_OWNER;
  const repo = process.env.REPO_NAME;
  const path = process.env.FILE_PATH || 'whitelist.json';

  async function loadJson() {
    try {
      const response = await octokit.request('GET /repos/{owner}/{repo}/contents/{path}', {
        owner,
        repo,
        path,
      });
      const content = Buffer.from(response.data.content, 'base64').toString('utf8');
      return { data: JSON.parse(content), sha: response.data.sha };
    } catch (err) {
      if (err.status === 404) {
        return { data: {}, sha: null };
      }
      throw err;
    }
  }

  async function saveJson(jsonData, sha) {
    const content = Buffer.from(JSON.stringify(jsonData, null, 2)).toString('base64');
    const params = {
      owner,
      repo,
      path,
      message: 'Update whitelist',
      content,
    };
    if (sha) {
      params.sha = sha;
    }
    await octokit.request('PUT /repos/{owner}/{repo}/contents/{path}', params);
  }

  try {
    if (req.method === 'GET') {
      const { action, hwid, discord_id } = req.query;
      const { data } = await loadJson();
      if (action === 'check') {
        const whitelisted = Object.values(data).includes(hwid);
        return res.json({ whitelisted });
      } else if (action === 'get_hwid') {
        return res.json({ hwid: data[discord_id] || null });
      } else if (action === 'hwid_exists') {
        const exists = Object.values(data).includes(hwid);
        return res.json({ exists });
      }
      return res.status(400).json({ error: 'Invalid action' });
    } else if (req.method === 'POST') {
      const { action, discord_id, hwid, new_hwid } = req.body;
      let { data, sha } = await loadJson();
      if (action === 'add') {
        if (data[discord_id]) return res.status(400).json({ error: 'Already whitelisted' });
        if (Object.values(data).includes(hwid)) return res.status(400).json({ error: 'HWID already used' });
        data[discord_id] = hwid;
      } else if (action === 'reset') {
        if (!data[discord_id]) return res.status(400).json({ error: 'Not whitelisted' });
        const old_hwid = data[discord_id];
        if (Object.values(data).includes(new_hwid) && new_hwid !== old_hwid) return res.status(400).json({ error: 'New HWID already used' });
        data[discord_id] = new_hwid;
      } else if (action === 'remove') {
        if (!data[discord_id]) return res.status(400).json({ error: 'Not whitelisted' });
        delete data[discord_id];
      } else {
        return res.status(400).json({ error: 'Invalid action' });
      }
      await saveJson(data, sha);
      return res.json({ success: true });
    }
    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};
