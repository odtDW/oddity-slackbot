# 🧠 Oddity 운영 Slackbot

오디티매장 운영 매뉴얼 기반 질의응답용 슬랙봇입니다.  
PDF, DOCX, TXT 문서를 기반으로 GPT-4o가 응답하며,  
대화 기록은 `logs/` 폴더에 자동 저장됩니다.

## 실행 방법
1. `.env`에 Slack, OpenAI 키 설정
2. `docs/` 폴더에 운영매뉴얼 문서 넣기
3. `npm install`
4. `npm start`
