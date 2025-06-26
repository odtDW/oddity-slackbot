// 📁 index.js - 오디티 운영 매뉴얼 오픈북 챗봇 (Slack + 문서검색 + 로그 저장)
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { App } = require('@slack/bolt');
const { ChatOpenAI } = require('langchain/chat_models/openai');
const { RecursiveCharacterTextSplitter } = require('langchain/text_splitter');
const { OpenAIEmbeddings } = require('langchain/embeddings/openai');
const { MemoryVectorStore } = require('langchain/vectorstores/memory');
const { RetrievalQAChain } = require('langchain/chains');
const { PDFLoader } = require('langchain/document_loaders/fs/pdf');
const { TextLoader } = require('langchain/document_loaders/fs/text');
const { DocxLoader } = require('langchain/document_loaders/fs/docx');

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
});

const LOG_PATH = path.join(__dirname, 'logs');
if (!fs.existsSync(LOG_PATH)) fs.mkdirSync(LOG_PATH);

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

  app.message(async ({ message, say }) => {
    if (!message.text || message.subtype === 'bot_message') return;

    const response = await qaChain.call({ query: message.text });
    const reply = `📘 *운영 매뉴얼 답변:*
${response.text}`;

    await say(reply);

    // 로그 저장
    const today = new Date().toISOString().split('T')[0];
    const logFile = path.join(LOG_PATH, `chatlog-${today}.txt`);
    const logEntry = `\n[${new Date().toLocaleString()}]\nQ: ${message.text}\nA: ${response.text}\n`;
    fs.appendFileSync(logFile, logEntry);
  });

  await app.start(process.env.PORT || 3000);
  console.log('✅ 오디티 슬랙봇이 실행 중입니다');
}

initBot();

