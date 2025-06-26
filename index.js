require('dotenv').config();
const fs = require('fs');
const path = require('path');
const express = require('express');
const { ExpressReceiver } = require('@slack/bolt');
const { App } = require('@slack/bolt');
const { ChatOpenAI } = require('langchain/chat_models/openai');
const { RecursiveCharacterTextSplitter } = require('langchain/text_splitter');
const { OpenAIEmbeddings } = require('langchain/embeddings/openai');
const { MemoryVectorStore } = require('langchain/vectorstores/memory');
const { RetrievalQAChain } = require('langchain/chains');
const { PDFLoader } = require('langchain/document_loaders/fs/pdf');
const { TextLoader } = require('langchain/document_loaders/fs/text');
const { DocxLoader } = require('langchain/document_loaders/fs/docx');

// ✅ ExpressReceiver를 먼저 생성합니다
const receiver = new ExpressReceiver({
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  endpoints: '/', // Slack Events API용 기본 엔드포인트
});

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  receiver,
});

const LOG_PATH = path.join(__dirname, 'logs');
if (!fs.existsSync(LOG_PATH)) fs.mkdirSync(LOG_PATH);

// ✅ Slack URL 검증을 위해 Express 직접 라우팅
receiver.app.post('/', (req, res) => {
  if (req.body.type === 'url_verification') {
    return res.status(200).send(req.body.challenge);
  }
  return res.status(200).send('OK');
});

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

async function initBot() {
  const splitDocs = await loadAllDocs();
  const vectorStore = await MemoryVectorStore.fromDocuments(splitDocs, new OpenAIEmbeddings());
  const retriever = vectorStore.asRetriever();
  const model = new ChatOpenAI({ modelName: 'gpt-4o', temperature: 0 });
  const qaChain = RetrievalQAChain.fromLLM(model, retriever, { returnSourceDocuments: true });

  async function handleQuestion(text, say, source = "event") {
    try {
      const response = await qaChain.call({ query: text });
      const reply = `📘 *운영 매뉴얼 답변:*\n${response.text}`;
      await say(reply);

      const today = new Date().toISOString().split('T')[0];
      const logFile = path.join(LOG_PATH, `chatlog-${today}.txt`);
      const logEntry = `\n[${new Date().toLocaleString()}] (${source})\nQ: ${text}\nA: ${response.text}\n`;
      fs.appendFileSync(logFile, logEntry);
    } catch (err) {
      await say("⚠️ 죄송합니다. 답변 중 오류가 발생했습니다.");
      console.error("❌ GPT 응답 에러:", err);
    }
  }

  app.message(async ({ message, say }) => {
    if (!message.text || message.subtype === 'bot_message') return;
    await handleQuestion(message.text, say, "message");
  });

  app.event("app_mention", async ({ event, say }) => {
    const userQuestion = event.text.replace(/<@[^>]+>\s*/g, "").trim();
    await handleQuestion(userQuestion, say, "mention");
  });

  const PORT = process.env.PORT || 3000;
  await app.start(PORT);
  console.log(`✅ 오디티 슬랙봇이 포트 ${PORT}에서 실행 중입니다`);
}

initBot();
