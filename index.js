// 📁 index.js - 오디티 운영 매뉴얼 오픈북 챗봇 (Slack + 문서검색 + 로그 저장 + URL 검증 대응)
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const express = require('express');
const bodyParser = require('body-parser');
const { App } = require('@slack/bolt');
const { ChatOpenAI } = require('langchain/chat_models/openai');
const { RecursiveCharacterTextSplitter } = require('langchain/text_splitter');
const { OpenAIEmbeddings } = require('langchain/embeddings/openai');
const { MemoryVectorStore } = require('langchain/vectorstores/memory');
const { RetrievalQAChain } = require('langchain/chains');
const { PDFLoader } = require('langchain/document_loaders/fs/pdf');
const { TextLoader } = require('langchain/document_loaders/fs/text');
const { DocxLoader } = require('langchain/document_loaders/fs/docx');

// 🔧 Express 서버 생성 (Slack challenge 인증 대응용)
const expressApp = express();
expressApp.use(bodyParser.json());

// ✅ Slack challenge 인증 처리 라우터
expressApp.post('/', (req, res) => {
  if (req.body.type === 'url_verification') {
    return res.status(200).send(req.body.challenge);
  }
  return res.status(200).send('OK');
});

// ✅ Slack Bolt App
const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  socketMode: false,
  appToken: process.env.SLACK_APP_TOKEN, // optional for socket mode
});

// 📁 로그 디렉토리
const LOG_PATH = path.join(__dirname, 'logs');
if (!fs.existsSync(LOG_PATH)) fs.mkdirSync(LOG_PATH);

// 📄 문서 로딩
async function loadAllDocs() {
  const dirPath = path.join(__dirname, 'docs');
  const files = fs.readdirSync(dirPath);
  const loaders = [];

  for (const file of files) {
    const ext = path.extname(file).toLowerCase();
    const fullPath = path.join(dirPath, file);
    if (ext === '.pdf') loaders.push(new PDFLoader(fullPath));
    else if (ext === '.txt') loaders.push(new TextLoader(fullPath));
    else if (ext === '.docx') loaders.push(new DocxLoader(fullPath));
  }

  const docs = [];
  for (const loader of loaders) {
    const loaded = await loader.load();
    docs.push(...loaded);
  }

  const splitter = new RecursiveCharacterTextSplitter({ chunkSize: 1000, chunkOverlap: 200 });
  return await splitter.splitDocuments(docs);
}

// ✅ 질문 핸들러
async function handleQuestion(text, say, source = "event") {
  try {
    const response = await qaChain.call({ query: text });
    const reply = `📘 *운영 매뉴얼 답변:*\n${response.text}`;
    await say(reply);

    // 로그 저장
    const today = new Date().toISOString().split('T')[0];
    const logFile = path.join(LOG_PATH, `chatlog-${today}.txt`);
    const logEntry = `\n[${new Date().toLocaleString()}] (${source})\nQ: ${text}\nA: ${response.text}\n`;
    fs.appendFileSync(logFile, logEntry);
  } catch (err) {
    await say("⚠️ 죄송합니다. 답변 중 오류가 발생했습니다.");
    console.error("❌ GPT 응답 에러:", err);
  }
}

// ✅ 초기화 및 실행
let qaChain;

(async () => {
  const splitDocs = await loadAllDocs();
  const vectorStore = await MemoryVectorStore.fromDocuments(splitDocs, new OpenAIEmbeddings());
  const retriever = vectorStore.asRetriever();
  const model = new ChatOpenAI({ modelName: 'gpt-4o', temperature: 0 });
  qaChain = RetrievalQAChain.fromLLM(model, retriever, { returnSourceDocuments: true });

  // 📩 일반 메시지 응답 (DM 포함)
  app.message(async ({ message, say }) => {
    if (!message.text || message.subtype === 'bot_message') return;
    await handleQuestion(message.text, say, "message");
  });

  // 🙋 멘션(@odditybot) 응답
  app.event("app_mention", async ({ event, say }) => {
    const userQuestion = event.text.replace(/<@[^>]+>\s*/g, "").trim();
    await handleQuestion(userQuestion, say, "mention");
  });

  // 💬 Slack Bolt App 실행
  await app.start();

  // 🚀 Express 서버로 포트 연결
  const PORT = process.env.PORT || 3000;
  expressApp.listen(PORT, () => {
    console.log(`✅ 오디티 슬랙봇 & URL 검증 서버가 포트 ${PORT}에서 실행 중입니다`);
  });
})();
