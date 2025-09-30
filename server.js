const express = require('express');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// --- 初期設定 ---
const app = express();
const PORT = process.env.PORT || 3000;

// Gemini APIクライアントの初期化
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_API_KEY) {
  console.error("エラー: 環境変数 GEMINI_API_KEY が設定されていません。");
  process.exit(1);
}
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

// --- ミドルウェア設定 ---
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- APIエンドポイント ---
app.post('/ask', async (req, res) => {
  const userQuestion = req.body.question;
  if (!userQuestion) {
    return res.status(400).json({ error: '質問が入力されていません。' });
  }

  // ★★★ 変更点(1) ★★★
  // RAG用のデータ読み込み処理を、APIリクエストの内部に移動しました。
  let ragContent = '';
  try {
    const dataDir = path.join(__dirname, 'data');
    const files = fs.readdirSync(dataDir).sort();
    files.forEach(file => {
      if (path.extname(file) === '.txt') {
        ragContent += `--- ${file}からの情報 ---\n`;
        ragContent += fs.readFileSync(path.join(dataDir, file), 'utf-8');
        ragContent += '\n\n';
      }
    });
  } catch (error) {
    console.error('RAG用のデータファイル読み込み中にエラーが発生しました:', error);
    // ファイルが読み込めなかった場合は、その旨をAIの応答とする
    return res.status(500).json({ answer: '申し訳ありません。内部情報の読み込みに失敗しました。' });
  }

  // Geminiに渡すシステムプロンプト（ペルソナ設定）
  const systemPrompt = `
    あなたは、株式会社コトブキソリューションの総務担当のチャットボットです。
    従業員からの問い合わせに、親切かつ簡潔・丁寧な言葉遣いで回答してください。
    これから渡す「社内情報」のテキストだけを情報源としてください。
    「社内情報」に記載されていない質問については、「申し訳ありませんが、その件については分かりかねます。」とだけ回答してください。
    一般的な知識や、あなたの意見、推測を答えてはいけません。
    情報の出所や、あなたがAIであることを明かす必要はありません。
  `;

  try {
    const promptParts = [
      systemPrompt,
      "--- 以下は回答の根拠となる社内情報です ---",
      ragContent,
      "--- 従業員からの質問 ---",
      `質問: "${userQuestion}"`
    ];
    
    const result = await model.generateContent(promptParts);
    const response = await result.response;
    const text = response.text();

    res.json({ answer: text });

  } catch (error) {
    console.error('Gemini APIとの通信中にエラーが発生しました:', error);
    res.status(500).json({ error: 'AIとの通信中にエラーが発生しました。' });
  }
});

// --- サーバー起動 ---
app.listen(PORT, () => {
  console.log(`サーバーがポート ${PORT} で起動しました。`);
});
