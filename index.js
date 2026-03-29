const { Client, GatewayIntentBits } = require('discord.js');
const fs = require('fs');
const cron = require('node-cron');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

const TOKEN = process.env.TOKEN;
const REPORT_CHANNEL_ID = "여기에_채널ID";
const FILE_NAME = 'attendance.json';

// --------------------
// 데이터 로드 / 저장
// --------------------
function loadAttendance() {
  if (!fs.existsSync(FILE_NAME)) return {};
  try {
    return JSON.parse(fs.readFileSync(FILE_NAME, 'utf8'));
  } catch {
    return {};
  }
}

function saveAttendance() {
  fs.writeFileSync(FILE_NAME, JSON.stringify(attendance, null, 2), 'utf8');
}

let attendance = loadAttendance();

// --------------------
// 날짜 (한국 시간)
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
  const day = now.getDay();
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

  return days;
}

// --------------------
// 주간 출석표
// --------------------
function buildWeeklySummary(guildId) {
  if (!attendance[guildId]) return '이번 주 출석 기록이 없어 😢';

  const week = getWeekDatesKST();
  const results = [];

  for (const userId in attendance[guildId]) {
    const user = attendance[guildId][userId];
    const marks = week.map(d => user.dates.includes(d) ? '✅' : '❌');
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
    results.push({
      name: user.name,
      count: user.dates.length
    });
  }

  if (results.length === 0) return '출석 기록이 없어 😢';

  results.sort((a, b) => b.count - a.count);

  const medals = ['🥇', '🥈', '🥉'];

  return [
    '🏆 누적 출석 랭킹',
    '',
    ...results.map((u, i) => `${medals[i] || i + 1 + '위'} ${u.name} (${u.count}일)`)
  ].join('\n');
}

// --------------------
// 메시지 처리
// --------------------
client.on('messageCreate', (message) => {
  if (message.author.bot || !message.guild) return;

  const guildId = message.guild.id;
  const userId = message.author.id;
  const today = getTodayKST();
  const name = message.member?.displayName || message.author.username;

  if (!attendance[guildId]) attendance[guildId] = {};

  // 출석
  if (message.content === '출석') {
    if (!attendance[guildId][userId]) {
      attendance[guildId][userId] = { name, dates: [] };
    }

    attendance[guildId][userId].name = name;

    if (attendance[guildId][userId].dates.includes(today)) {
      message.reply('이미 출석했어 😎');
      return;
    }

    attendance[guildId][userId].dates.push(today);
    saveAttendance();
    message.reply('출석 완료 ✅');
  }

  // 출석확인
  if (message.content === '출석확인') {
    if (!attendance[guildId][userId]) {
      message.reply('출석 기록이 없어 😢');
      return;
    }

    message.reply(`총 출석 횟수: ${attendance[guildId][userId].dates.length}일`);
  }

  // 이번주출석
  if (message.content === '이번주출석') {
    message.channel.send(buildWeeklySummary(guildId));
  }

  // 랭킹
  if (message.content === '랭킹') {
    message.channel.send(buildTotalRanking(guildId));
  }
});

// --------------------
// 일요일 자동 출력
// --------------------
cron.schedule('59 23 * * 0', async () => {
  try {
    const channel = await client.channels.fetch(REPORT_CHANNEL_ID);
    if (!channel) return;

    const guildId = channel.guild.id;
    await channel.send(buildWeeklySummary(guildId));
  } catch (e) {
    console.error(e);
  }
}, { timezone: 'Asia/Seoul' });

client.login(TOKEN);