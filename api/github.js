// api/github.js
// ブラウザから { password, action, ... } を受け取り、GitHub のリポジトリを読み書きする。
// GitHub のトークンはここ（サーバー側）だけが知っていて、ブラウザには出ない。
//
// Vercel の環境変数に必要なもの：
//   GITHUB_TOKEN  … GitHub の Fine-grained personal access token（対象リポジトリの Contents: Read and write）
//   GITHUB_OWNER  … GitHub のユーザー名
//   GITHUB_REPO   … リポジトリ名（例：Claude-chat）
//   GITHUB_BRANCH … 省略可。省略時は main
//
// action:
//   "read"  { paths: ["★202609更新_直近のログ.md", "要約/"] }
//           → ファイルならその1本、フォルダなら中の .md を全部読んで返す
//   "write" { path: "ログ/20260912_1030_Sonnet4.6.md", content: "…", message: "…" }
//           → そのパスに保存（既にあれば上書き）

const GH = "https://api.github.com";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST only" });
  }

  const { password, action } = req.body || {};

  if (!process.env.APP_PASSWORD || password !== process.env.APP_PASSWORD) {
    return res.status(401).json({ error: "パスワードが違います" });
  }

  const token = process.env.GITHUB_TOKEN;
  const owner = process.env.GITHUB_OWNER;
  const repo = process.env.GITHUB_REPO;
  const branch = process.env.GITHUB_BRANCH || "main";
  if (!token || !owner || !repo) {
    return res.status(500).json({ error: "GITHUB_TOKEN / GITHUB_OWNER / GITHUB_REPO が設定されていません" });
  }

  const headers = {
    authorization: `Bearer ${token}`,
    accept: "application/vnd.github+json",
    "user-agent": "gassoushitsu",
    "content-type": "application/json",
  };
  const encPath = (p) => p.split("/").filter(Boolean).map(encodeURIComponent).join("/");
  const contentsUrl = (p) => `${GH}/repos/${owner}/${repo}/contents/${encPath(p)}?ref=${encodeURIComponent(branch)}`;

  // 1本のファイルの中身を取る。1MB を超えるものは blob 経由で取る
  async function readFile(p) {
    const r = await fetch(contentsUrl(p), { headers });
    if (!r.ok) throw new Error(`${p} を読めませんでした（${r.status}）`);
    const data = await r.json();
    if (Array.isArray(data)) throw new Error(`${p} はフォルダです`);
    if (data.content) {
      return Buffer.from(data.content, "base64").toString("utf8");
    }
    if (data.git_url) {
      const b = await fetch(data.git_url, { headers });
      if (!b.ok) throw new Error(`${p} の blob を読めませんでした（${b.status}）`);
      const blob = await b.json();
      return Buffer.from(blob.content, "base64").toString("utf8");
    }
    return "";
  }

  // パスがフォルダなら中の .md を列挙、ファイルならそれ1本
  async function expand(p) {
    const clean = p.trim().replace(/^\/+/, "");
    if (!clean) return [];
    const r = await fetch(contentsUrl(clean), { headers });
    if (r.status === 404) throw new Error(`${clean} が見つかりません（パスの綴りを確認して）`);
    if (!r.ok) throw new Error(`${clean} にアクセスできません（${r.status}）`);
    const data = await r.json();
    if (Array.isArray(data)) {
      return data
        .filter((it) => it.type === "file" && /\.(md|txt)$/i.test(it.name))
        .map((it) => it.path)
        .sort();
    }
    return [data.path];
  }

  try {
    if (action === "read") {
      const paths = Array.isArray(req.body.paths) ? req.body.paths : [];
      if (!paths.length) return res.status(400).json({ error: "paths が空です" });

      const files = [];
      for (const p of paths) {
        for (const fp of await expand(p)) {
          files.push({ path: fp, text: await readFile(fp) });
        }
      }
      return res.status(200).json({ files });
    }

    if (action === "write") {
      const { path, content, message } = req.body;
      if (!path || typeof content !== "string") {
        return res.status(400).json({ error: "path と content が必要です" });
      }
      const clean = path.replace(/^\/+/, "");

      // 既にあるなら sha が要る（上書きのため）
      let sha;
      const g = await fetch(contentsUrl(clean), { headers });
      if (g.ok) {
        const cur = await g.json();
        if (!Array.isArray(cur)) sha = cur.sha;
      }

      const body = {
        message: message || `合奏室: ${clean}`,
        content: Buffer.from(content, "utf8").toString("base64"),
        branch,
      };
      if (sha) body.sha = sha;

      const u = await fetch(`${GH}/repos/${owner}/${repo}/contents/${encPath(clean)}`, {
        method: "PUT",
        headers,
        body: JSON.stringify(body),
      });
      const data = await u.json();
      if (!u.ok) {
        return res.status(u.status).json({ error: data?.message || `GitHub error ${u.status}` });
      }
      return res.status(200).json({ path: clean, url: data?.content?.html_url || null });
    }

    return res.status(400).json({ error: "action は read か write" });
  } catch (e) {
    return res.status(500).json({ error: e.message || "unknown error" });
  }
}
