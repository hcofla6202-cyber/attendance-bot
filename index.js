const { Client, GatewayIntentBits } = require('discord.js');
const fs = require('fs');
const cron = require('node-cron');
const express = require('express');

// 🔥 웹서버 (Render용)
const app = express();
app.get('/', (req, res) => {
  res.send('봇 살아있음');
});
app.listen(process.env.PORT || 3000, () => {
  console.log('웹서버 실행됨');
});

// 🔥 디스코드 봇
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

const TOKEN = process.env.TOKEN;
const FILE_NAME = 'attendance.json';

// --------------------
// 데이터 로드 / 저장
// --------------------
let attendance = {};
if (fs.existsSync(FILE_NAME)) {
  attendance = JSON.parse(fs.readFileSync(FILE_NAME, 'utf8'));
}

// --------------------
// 날짜 함수 (한국시간)
// --------------------
function getKSTDate() {
  return new Date().toLocaleString('en-US', {
    timeZone: 'Asia/Seoul'
  }).slice(0, 10);
}

// --------------------
// 출석 처리
// --------------------
client.on('messageCreate', (message) => {
  if (message.author.bot) return;

  const guildId = message.guild.id;
  const userId = message.author.id;
  const username = message.author.username;
  const today = new Date().toISOString().slice(0, 10);

  if (!attendance[guildId]) {
    attendance[guildId] = {};
  }

  if (!attendance[guildId][userId]) {
    attendance[guildId][userId] = {
      name: username,
      dates: []
    };
  }

  // 출석
  if (message.content === '출석') {
    if (attendance[guildId][userId].dates.includes(today)) {
      message.reply('이미 출석했어 😎');
      return;
    }

    attendance[guildId][userId].dates.push(today);
    fs.writeFileSync(FILE_NAME, JSON.stringify(attendance, null, 2));

    message.reply('출석 완료 ✅');
  }

  // 출석 확인
  if (message.content === '출석확인') {
    if (!attendance[guildId][userId]) {
      message.reply('출석 기록이 없어 😢');
      return;
    }

    message.reply(`총 출석 횟수: ${attendance[guildId][userId].dates.length}일`);
  }

  // 이번주 출석
  if (message.content === '이번주출석') {
    const week = [];
    const now = new Date();
    const day = now.getDay();
    const monday = new Date(now);
    monday.setDate(now.getDate() - (day === 0 ? 6 : day - 1));

    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      week.push(d.toISOString().slice(0, 10));
    }

    let result = '📅 이번 주 출석 기록\n\n';
    let bestUser = '';
    let bestCount = 0;

    for (const uid in attendance[guildId]) {
      const user = attendance[guildId][uid];
      const marks = week.map(date =>
        user.dates.includes(date) ? '✅' : '❌'
      );

      const count = marks.filter(v => v === '✅').length;

      result += `${user.name} : ${marks.join('')}\n`;

      if (count > bestCount) {
        bestCount = count;
        bestUser = user.name;
      }
    }

    result += `\n🏆 이번주 출석왕 : ${bestUser} (${bestCount}일)`;

    message.channel.send(result);
  }

  // 랭킹
  if (message.content === '랭킹') {
    let ranking = [];

    for (const uid in attendance[guildId]) {
      const user = attendance[guildId][uid];
      ranking.push({
        name: user.name,
        count: user.dates.length
      });
    }

    ranking.sort((a, b) => b.count - a.count);

    let result = '🏆 출석 랭킹\n\n';
    ranking.slice(0, 10).forEach((user, i) => {
      result += `${i + 1}등 ${user.name} (${user.count}일)\n`;
    });

    message.channel.send(result);
  }
});

// --------------------
// 로그인 & 상태 확인
// --------------------
client.on('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
});

client.on('error', (err) => {
  console.error('에러:', err);
});

process.on('unhandledRejection', (err) => {
  console.error('Promise 에러:', err);
});

client.login(TOKEN);