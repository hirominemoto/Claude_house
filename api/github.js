const GH = "https://api.github.com";

const REPO_BY_MODEL = {
  "claude-sonnet-4-6": "Claude-chat",
  "claude-opus-4-7": "Opus4.7",
  "claude-opus-4-8": "light_opus4.8",
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { password, model, action } = req.body || {};

  if (password !== process.env.APP_PASSWORD) {
    return res.status(401).json({ error: "パスワードが違います" });
  }

  const token = process.env.GITHUB_TOKEN;
  const owner = process.env.GITHUB_OWNER;
  const branch = process.env.GITHUB_BRANCH || "main";
  const repo = REPO_BY_MODEL[model];

  if (!token || !owner) {
    return res.status(500).json({
      error: "GitHub の環境変数が設定されていません",
    });
  }

  if (!repo) {
    return res.status(400).json({
      error: `未対応のモデルです: ${model || "(未指定)"}`,
    });
  }

  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "Content-Type": "application/json",
  };

  const contentsUrl = (path = "") => {
    const encodedPath = String(path)
      .split("/")
      .filter(Boolean)
      .map(encodeURIComponent)
      .join("/");

    const base = `${GH}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents`;
    return encodedPath
      ? `${base}/${encodedPath}?ref=${encodeURIComponent(branch)}`
      : `${base}?ref=${encodeURIComponent(branch)}`;
  };

  try {
    if (action === "read") {
      const paths = Array.isArray(req.body.paths)
        ? req.body.paths.map((p) => String(p).trim()).filter(Boolean)
        : [];

      if (!paths.length) {
        return res.status(400).json({
          error: "読み込むGitHubパスがありません",
        });
      }

      const files = [];

      const readPath = async (path) => {
        const response = await fetch(contentsUrl(path), { headers });

        if (!response.ok) {
          if (response.status === 404) {
            throw new Error(`[${repo}] ファイルまたはフォルダが見つかりません: ${path}`);
          }

          const text = await response.text();
          throw new Error(
            `[${repo}] GitHub読込エラー (${response.status}): ${text}`
          );
        }

        const data = await response.json();

        if (Array.isArray(data)) {
          for (const item of data) {
            if (item.type === "dir") {
              await readPath(item.path);
            } else if (
              item.type === "file" &&
              /\.(md|txt)$/i.test(item.name || "")
            ) {
              await readPath(item.path);
            }
          }
          return;
        }

        if (data.type !== "file") return;
        if (!/\.(md|txt)$/i.test(data.name || "")) return;

        let content = "";

        if (data.content) {
          content = Buffer.from(
            String(data.content).replace(/\n/g, ""),
            "base64"
          ).toString("utf8");
        } else if (data.download_url) {
          const fileResponse = await fetch(data.download_url);
          if (!fileResponse.ok) {
            throw new Error(
              `[${repo}] ファイル本文を取得できません: ${data.path}`
            );
          }
          content = await fileResponse.text();
        }

        files.push({
          path: data.path,
          content,
        });
      };

      for (const path of paths) {
        await readPath(path);
      }

      return res.status(200).json({
        ok: true,
        repo,
        files,
      });
    }

    if (action === "write") {
      const path = String(req.body.path || "").trim();
      const content = String(req.body.content ?? "");

      if (!path) {
        return res.status(400).json({
          error: "保存先パスがありません",
        });
      }

      const url = contentsUrl(path);

      let sha;
      const existing = await fetch(url, { headers });

      if (existing.ok) {
        const data = await existing.json();
        if (!Array.isArray(data) && data.sha) {
          sha = data.sha;
        }
      } else if (existing.status !== 404) {
        const text = await existing.text();
        throw new Error(
          `[${repo}] 既存ファイル確認エラー (${existing.status}): ${text}`
        );
      }

      const body = {
        message: `Save conversation: ${path}`,
        content: Buffer.from(content, "utf8").toString("base64"),
        branch,
      };

      if (sha) body.sha = sha;

      const response = await fetch(url, {
        method: "PUT",
        headers,
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(
          `[${repo}] GitHub保存エラー (${response.status}): ${text}`
        );
      }

      return res.status(200).json({
        ok: true,
        repo,
        path,
      });
    }

    return res.status(400).json({
      error: `不明なactionです: ${action || "(未指定)"}`,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      error: error?.message || "GitHub APIでエラーが発生しました",
      repo,
    });
  }
}
