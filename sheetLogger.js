// 📁 sheetLogger.js - 구글 스프레드시트 로그 저장기
const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

// 🔑 credentials.json 로드
const credentials = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'credentials.json'), 'utf-8')
);

// 🔐 인증 생성
const auth = new google.auth.GoogleAuth({
  credentials,
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

// 📊 Google Sheets API 클라이언트 생성
const sheets = google.sheets({ version: 'v4', auth });

// ✅ 여기에 스프레드시트 ID 입력 (URL에서 복사한 ID)
const SPREADSHEET_ID = '1j-Jr9pjMqH6E6xDWlq6ZJW8SiQf4vU0g_PoX277gcEA';

// 📦 로그 저장 함수
async function appendLogRow({ dateTime, question, answer, source, user }) {
  try {
    const values = [[dateTime, user, question, answer, source]];
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Sheet1!A:E',
      valueInputOption: 'USER_ENTERED',
      requestBody: { values },
    });
    console.log('✅ Log appended to Google Sheet.');
  } catch (error) {
    console.error('❌ Failed to log to Google Sheet:', error.message);
  }
}

module.exports = { appendLogRow };
