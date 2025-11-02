require('dotenv').config(); // 放在文件最开头
const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();
const HOST = process.env.HOST || '0.0.0.0';
const PORT = process.env.PORT || 3000;
const SECRET = process.env.SECRET || 'default-secret-key';
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/deviceStats';
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASSWD = process.env.ADMIN_PASSWD?.replace(/\$\$/g, '$') || '';

//运行信息
console.log('后端端口 ', PORT);
console.log('后端密钥 ', SECRET);
console.log('后端MongoDB ', MONGODB_URI);

// 中间件
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// MongoDB连接
mongoose.connect(MONGODB_URI)
    .then(() => console.log('成功连接到 MongoDB'))
    .catch(err => console.error('MongoDB 连接错误:', err));

module.exports.mongoose = mongoose;
module.exports.SECRET = SECRET;
module.exports.ADMIN_USER = ADMIN_USER;
module.exports.ADMIN_PASSWD = ADMIN_PASSWD;

// 导入模块
const StatsRecorder = require('./services/StatsRecorder');
const StatsQuery = require('./services/StatsQuery');
const AISummary = require('./services/AISummary');

// 创建实例
const statsRecorder = new StatsRecorder(parseInt(process.env.DEFAULT_TIMEZONE_OFFSET) || 8);
const statsQuery = new StatsQuery(statsRecorder,{
    timezoneOffset: parseInt(process.env.DEFAULT_TIMEZONE_OFFSET) || 8
});

// 创建AI总结实例并配置
const aiSummary = new AISummary(statsRecorder, statsQuery, {
    // AI API配置 (从环境变量读取)
    aiApiUrl: process.env.AI_API_URL,
    aiApiKey: process.env.AI_API_KEY,
    aiModel: process.env.AI_MODEL || 'gpt-4',
    aiMaxTokens: parseInt(process.env.AI_MAX_TOKENS) || 1000,

    // 发布API配置
    publishApiUrl: process.env.PUBLISH_API_URL,
    publishApiKey: process.env.PUBLISH_API_KEY,

    // 默认时区 (东八区)
    timezoneOffset: parseInt(process.env.DEFAULT_TIMEZONE_OFFSET) || 8,

    // 是否启用定时任务
    enabled: process.env.AI_SUMMARY_ENABLED !== 'false',
    intervalHours: parseInt(process.env.SCHEDULE_INTERVAL_HOURS) || 4,

    // 发布功能
    publishEnabled: process.env.PUBLISH_ENABLED !== 'false',

    aiPrompt:  process.env.AI_PROMPT?.replace(/\\n/g, '\n')
});

// 导出实例供 apiRoutes 使用
module.exports.statsRecorder = statsRecorder;
module.exports.statsQuery = statsQuery;
module.exports.aiSummary = aiSummary;

// 启动AI定时任务
aiSummary.start();

// API路由
const apiRoutes = require('./routes/apiRoutes');
const adminRoutes = require('./routes/adminRoutes');
const eyeapiRoutes = require('./routes/EyeTime_Routes');
app.use('/admin', adminRoutes);
app.use('/api', apiRoutes);
app.use('/api', eyeapiRoutes);

// 启动服务器
app.listen(PORT, HOST, () => {
    console.log(`Server running on http://${HOST}:${PORT}`);
    console.log('[AI Summary]:', aiSummary.enabled ? '已启用' : '已禁用');
    if (aiSummary.enabled && aiSummary.aiConfig.apiKey) {
        console.log('[AI Summary]定时任务: 已启用');
    } else if (aiSummary.enabled && !aiSummary.aiConfig.apiKey) {
        console.log('[AI Summary]警告: AI_API_KEY 未配置，AI功能无法正常工作');
    }
});