const { Client, GatewayIntentBits } = require('discord.js');
const fs = require('fs');
const cron = require('node-cron');
const express = require('express');

// --------------------
// Render용 웹서버
// --------------------
const app = express();

app.get('/', (req, res) => {
  res.send('봇 살아있음');
});

app.listen(process.env.PORT || 3000, () => {
  console.log('웹서버 실행됨');
});

// --------------------
// 디스코드 봇
// --------------------
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// 따옴표/공백/줄바꿈 방지
const TOKEN = (process.env.TOKEN || '')
  .trim()
  .replace(/^"(.*)"$/, '$1')
  .replace(/^'(.*)'$/, '$1');

const FILE_NAME = 'attendance.json';

console.log('TOKEN 존재 여부:', !!TOKEN);
console.log('TOKEN 길이:', TOKEN.length);

// --------------------
// 데이터 불러오기 / 저장
// --------------------
let attendance = {};
if (fs.existsSync(FILE_NAME)) {
  try {
    attendance = JSON.parse(fs.readFileSync(FILE_NAME, 'utf8'));
  } catch (err) {
    console.error('attendance.json 읽기 실패:', err);
    attendance = {};
  }
}

function saveAttendance() {
  fs.writeFileSync(FILE_NAME, JSON.stringify(attendance, null, 2), 'utf8');
}

// --------------------
// 날짜 함수 (한국 시간)
// --------------------
function getKSTNow() {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
}

function formatDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function getTodayKST() {
  return formatDate(getKSTNow());
}

function getWeekDatesKST() {
  const now = getKSTNow();
  const day = now.getDay(); // 일=0, 월=1, ... 토=6
  const diff = day === 0 ? -6 : 1 - day;

  const monday = new Date(now);
  monday.setDate(now.getDate() + diff);
  monday.setHours(0, 0, 0, 0);

  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    days.push(formatDate(d));
  }

  return days; // 월~일
}

// --------------------
// 이번주 출석표
// --------------------
function buildWeeklySummary(guildId) {
  if (!attendance[guildId]) return '이번 주 출석 기록이 없어 😢';

  const week = getWeekDatesKST();
  const results = [];

  for (const userId in attendance[guildId]) {
    const user = attendance[guildId][userId];
    const dates = Array.isArray(user.dates) ? user.dates : [];

    const marks = week.map(d => dates.includes(d) ? '✅' : '❌');
    const count = marks.filter(v => v === '✅').length;

    if (count > 0) {
      results.push({
        name: user.name,
        marks: marks.join(''),
        count
      });
    }
  }

  if (results.length === 0) return '이번 주 출석 기록이 없어 😢';

  results.sort((a, b) => b.count - a.count);

  return [
    '📅 이번 주 출석 기록',
    '',
    ...results.map(u => `${u.name} : ${u.marks}`),
    '',
    `🏆 이번주 출석왕 : ${results[0].name} (${results[0].count}일)`
  ].join('\n');
}

// --------------------
// 누적 랭킹
// --------------------
function buildTotalRanking(guildId) {
  if (!attendance[guildId]) return '출석 기록이 없어 😢';

  const results = [];

  for (const userId in attendance[guildId]) {
    const user = attendance[guildId][userId];
    const count = Array.isArray(user.dates) ? user.dates.length : 0;

    results.push({
      name: user.name,
      count
    });
  }

  if (results.length === 0) return '출석 기록이 없어 😢';

  results.sort((a, b) => b.count - a.count);

  const medals = ['🥇', '🥈', '🥉'];

  return [
    '🏆 누적 출석 랭킹',
    '',
    ...results.map((u, i) => `${medals[i] || `${i + 1}위`} ${u.name} (${u.count}일)`)
  ].join('\n');
}

// --------------------
// 메시지 처리
// --------------------
client.on('messageCreate', (message) => {
  if (message.author.bot) return;
  if (!message.guild) return;

  const guildId = message.guild.id;
  const userId = message.author.id;
  const today = getTodayKST();
  const name = message.member?.displayName || message.author.username;

  if (!attendance[guildId]) {
    attendance[guildId] = {};
  }

  // 출석
  if (message.content === '출석') {
    if (!attendance[guildId][userId]) {
      attendance[guildId][userId] = {
        name,
        dates: []
      };
    }

    attendance[guildId][userId].name = name;

    if (attendance[guildId][userId].dates.includes(today)) {
      message.reply('이미 출석했어 😎');
      return;
    }

    attendance[guildId][userId].dates.push(today);
    saveAttendance();
    message.reply('출석 완료 ✅');
    return;
  }

  // 출석확인
  if (message.content === '출석확인') {
    if (
      !attendance[guildId][userId] ||
      !attendance[guildId][userId].dates ||
      attendance[guildId][userId].dates.length === 0
    ) {
      message.reply('출석 기록이 없어 😢');
      return;
    }

    message.reply(`총 출석 횟수: ${attendance[guildId][userId].dates.length}일`);
    return;
  }

  // 이번주출석
  if (message.content === '이번주출석') {
    message.channel.send(buildWeeklySummary(guildId));
    return;
  }

  // 랭킹
  if (message.content === '랭킹') {
    message.channel.send(buildTotalRanking(guildId));
    return;
  }
});

// --------------------
// 매주 일요일 23:59 자동 안내
// --------------------
cron.schedule('59 23 * * 0', async () => {
  console.log('주간 출석표 스케줄 실행');
}, {
  timezone: 'Asia/Seoul'
});

// --------------------
// 디버그 로그
// --------------------
client.on('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
});

client.on('error', (err) => {
  console.error('디스코드 클라이언트 에러:', err);
});

client.on('warn', (info) => {
  console.warn('디스코드 경고:', info);
});

client.on('shardError', (err) => {
  console.error('샤드 에러:', err);
});

client.on('shardDisconnect', (event, id) => {
  console.error(`샤드 연결 끊김: shard ${id}`, event);
});

client.on('shardReconnecting', (id) => {
  console.warn(`샤드 재연결 중: shard ${id}`);
});

process.on('unhandledRejection', (err) => {
  console.error('Promise 에러:', err);
});

process.on('uncaughtException', (err) => {
  console.error('치명적 에러:', err);
});

// --------------------
// 로그인
// --------------------
console.log('디스코드 로그인 시도 시작');

setTimeout(() => {
  console.log('로그인 15초째 대기중');
}, 15000);

client.login(TOKEN)
  .then(() => {
    console.log('client.login 호출 성공');
  })
  .catch((err) => {
    console.error('client.login 실패:', err);
  });