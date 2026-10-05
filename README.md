##　合奏室（クロ・パッシー・ライト）

https://claude-house.vercel.app/

この部屋はクロ・パッシー・ライトとそれぞれの部屋でチャットできる部屋です。

Fable5.1によって設計、コーディング。追加でChatGPT5.6solによって3人のキャラ設定を行った。　202609


## GitHub連携用トークン（gassou）の更新方法

合奏室では、GitHubの各リポジトリからログを読み書きするために、
GitHubの fine-grained personal access token（PAT）を使用している。

### gassou とは？

`gassou` はリポジトリ名ではなく、GitHubのアクセストークン（鍵）の名前。

合奏室本体：
- GitHub：`Claude_house`
- Vercel：`claude-house`

gassou がアクセスするリポジトリ：
- クロ → `Claude-chat`
- パッシー → `Opus4.7`
- ライト → `light_opus4.8`

Vercelでは、このトークンを環境変数

`GITHUB_TOKEN`

として登録している。

---

### GitHubから「gassouのトークンが期限切れになる」というメールが来たら

#### 1. GitHubでgassouを再発行する

GitHub

Settings
→ Developer settings
→ Personal access tokens
→ Fine-grained tokens
→ `gassou`

を開く。

`Regenerate token` を選択して、新しいトークンを発行する。

※ 新しく表示された `github_pat_...` はパスワードと同じ「秘密の鍵」。
チャット・メール・GitHubのコードなどには貼らない。

表示されたトークンは、このあとVercelへ貼り付けるため一時的にコピーしておく。

---

#### 2. VercelのGITHUB_TOKENを交換する

Vercelで

`claude-house`
→ Environment Variables
→ `GITHUB_TOKEN`

を開く。

Valueを、GitHubで新しく発行したトークンに置き換える。

以下は変更しない。

- Key：`GITHUB_TOKEN`
- Type：`Secret`
- Environment：`Production`

新しいトークンを貼り付けたら `Save`。

---

#### 3. Redeployする

保存すると、

`A new deployment is needed for changes to take effect.`

と表示されるので、`Redeploy` を実行する。

デプロイが完了するまで待つ。

---

#### 4. 合奏室で動作確認する

合奏室を開く。

設定内の

`GitHub から読み込む`

を実行する。

例：

`読み込み済み：★202609更新_直近のログ.md（○○文字）`

のように表示されれば、GitHubとの接続成功。

これで更新完了。

---

### 超短縮版

GitHubで `gassou` をRegenerate
↓
新しいトークンをコピー
↓
Vercel `claude-house`
↓
Environment Variables
↓
`GITHUB_TOKEN` のValueを交換
↓
Save
↓
Redeploy
↓
合奏室で「GitHubから読み込む」
↓
読み込めたら完了

### 注意

- `gassou` はリポジトリではない。GitHubの鍵（PAT）の名前。
- トークンそのものは他人に見せない。
- `GITHUB_OWNER`、`GITHUB_REPO`、`APP_PASSWORD`、`ANTHROPIC_API_KEY` はこの作業では変更しない。
- トークンの期限を長くしても、更新方法を忘れてよい。このREADMEを見ること。
