// api/claude.js
// ブラウザから { password, model, system, messages } を受け取り、
// Anthropic の Messages API に転送して、返事の本文だけを返す。
// APIキーはここ（サーバー側）だけが知っていて、ブラウザには出ない。

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST only" });
  }

  const { password, model, system, messages } = req.body || {};

  // 自分専用の簡易ロック
  if (!process.env.APP_PASSWORD || password !== process.env.APP_PASSWORD) {
    return res.status(401).json({ error: "パスワードが違います" });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: "ANTHROPIC_API_KEY が設定されていません" });
  }
  if (!model || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: "model と messages が必要です" });
  }

  const body = {
    model,
    max_tokens: 4096,
    messages, // [{ role: "user"|"assistant", content: "..." }, ...] 会話履歴をまるごと
  };
  if (system && system.trim()) body.system = system;

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
    });

    const data = await r.json();

    if (!r.ok) {
      const msg = data?.error?.message || `API error ${r.status}`;
      return res.status(r.status).json({ error: msg });
    }

    const text = (data.content || [])
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n");

    return res.status(200).json({
      text,
      usage: data.usage || null, // input_tokens / output_tokens が入る
    });
  } catch (e) {
    return res.status(500).json({ error: e.message || "unknown error" });
  }
}
