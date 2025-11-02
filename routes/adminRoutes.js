const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const { ADMIN_USER, ADMIN_PASSWD, aiSummary} = require('../index');

let JWT_SECRET = crypto.randomBytes(64).toString('hex');

const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) {
        return res.status(401).json({
            success: false,
            error: 'Access token required'
        });
    }
    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({
                success: false,
                error: 'Invalid or expired token'
            });
        }
        req.user = user;
        next();
    });
};

router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({
                success: false,
                message: '用户名和密码不能为空'
            });
        }

        if (username !== ADMIN_USER) {
            return res.status(401).json({
                success: false,
                message: '用户名或密码错误'
            });
        }

        if (!ADMIN_PASSWD || typeof ADMIN_PASSWD !== 'string') {
            console.error('错误: 密码哈希未正确配置');
            return res.status(500).json({
                success: false,
                message: '服务器配置错误：密码哈希未设置'
            });
        }

        if (!ADMIN_PASSWD.startsWith('$2')) {
            console.error('错误: 密码哈希格式不正确');
            return res.status(500).json({
                success: false,
                message: '服务器配置错误：密码哈希格式无效'
            });
        }

        const isPasswordValid = await bcrypt.compare(password, ADMIN_PASSWD);

        if (!isPasswordValid) {
            return res.status(401).json({
                success: false,
                message: '用户名或密码错误'
            });
        }

        const token = jwt.sign(
            {
                userId: 'admin',
                username: ADMIN_USER,
                role: 'admin'
            },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.json({
            success: true,
            token
        });

    } catch (error) {
        console.error('登录错误:', error);

        if (error.message.includes('Illegal arguments')) {
            return res.status(500).json({
                success: false,
                message: '服务器配置错误：密码哈希无效'
            });
        }

        res.status(500).json({
            success: false,
            message: '服务器内部错误'
        });
    }
});

// 新增：更新管理员账户
router.post('/account/update', authenticateToken, async (req, res) => {
    try {
        const fs = require('fs');
        const path = require('path');
        const envPath = path.join(__dirname, '../.env');

        const { username, password } = req.body;

        if (!username && !password) {
            return res.status(400).json({
                success: false,
                message: '请提供要更新的用户名或密码'
            });
        }

        // 读取现有的 .env 文件
        let envContent = '';
        if (fs.existsSync(envPath)) {
            envContent = fs.readFileSync(envPath, 'utf8');
        }

        const envLines = envContent.split('\n');
        const envMap = new Map();

        envLines.forEach(line => {
            const trimmedLine = line.trim();
            if (trimmedLine && !trimmedLine.startsWith('#')) {
                const separatorIndex = trimmedLine.indexOf('=');
                if (separatorIndex > 0) {
                    const key = trimmedLine.substring(0, separatorIndex).trim();
                    const value = trimmedLine.substring(separatorIndex + 1).trim();
                    envMap.set(key, value);
                }
            }
        });

        const updatedFields = [];

        // 更新用户名
        if (username && username !== ADMIN_USER) {
            envMap.set('ADMIN_USER', username);
            process.env.ADMIN_USER = username;
            updatedFields.push('用户名');
        }

        // 更新密码（加密后保存）
        if (password) {
            const hashedPassword = await bcrypt.hash(password, 10);
            // Docker Compose 需要双美元符号转义
            const escapedPassword = hashedPassword.replace(/\$/g, '$$$$');
            envMap.set('ADMIN_PASSWD', escapedPassword);
            process.env.ADMIN_PASSWD = hashedPassword;
            updatedFields.push('密码');
        }

        // 生成新的 .env 内容
        const newEnvContent = Array.from(envMap.entries())
            .map(([key, value]) => `${key}=${value}`)
            .join('\n');

        // 写入 .env 文件
        fs.writeFileSync(envPath, newEnvContent + '\n', 'utf8');

        res.json({
            success: true,
            message: `账户信息已更新（${updatedFields.join('、')})`,
            requireRelogin: true
        });

    } catch (error) {
        console.error('更新账户错误:', error);
        res.status(500).json({
            success: false,
            message: '更新账户失败',
            details: error.message
        });
    }
});

router.post('/ai/trigger/:deviceId', authenticateToken, async (req, res) => {
    try {
        const deviceId = req.params.deviceId;
        const { date, timezoneOffset } = req.body;
        const result = await aiSummary.triggerSummary(deviceId, {
            date: date || null,
            timezoneOffset: timezoneOffset ? parseInt(timezoneOffset) : null
        });
        res.json(result);
    } catch (error) {
        console.error('Error in /api/ai/trigger/:deviceId:', error);
        res.status(500).json({
            error: 'AI summary generation failed',
            details: error.message
        });
    }
});

router.post('/ai/stop', authenticateToken, (req, res) => {
    try {
        aiSummary.stop();
        res.json({
            success: true,
            message: 'AI summary cron jobs stopped'
        });
    } catch (error) {
        console.error('Error in /api/ai/stop:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to stop AI tasks',
            details: error.message
        });
    }
});

router.post('/ai/start', authenticateToken, (req, res) => {
    try {
        aiSummary.start();
        res.json({
            success: true,
            message: 'AI summary cron jobs started'
        });
    } catch (error) {
        console.error('Error in /api/ai/start:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to start AI tasks',
            details: error.message
        });
    }
});

router.get('/config', authenticateToken, (req, res) => {
    try {
        const config = {
            PORT: process.env.PORT || 3000,
            MONGODB_URI: process.env.MONGODB_URI || 'mongodb://localhost:27017/deviceStats',
            ADMIN_USER: process.env.ADMIN_USER || 'admin',
            AI_API_URL: process.env.AI_API_URL || '未设置',
            AI_MODEL: process.env.AI_MODEL || 'gpt-4',
            AI_MAX_TOKENS: process.env.AI_MAX_TOKENS || 1000,
            AI_PROMPT:  process.env.AI_PROMPT?.replace(/\\n/g, '\n') || '未设置',
            PUBLISH_ENABLED: process.env.PUBLISH_ENABLED || 'false',
            PUBLISH_API_URL: process.env.PUBLISH_API_URL || '未设置',
            PUBLISH_API_KEY: process.env.PUBLISH_API_KEY || '未设置',
            DEFAULT_TIMEZONE_OFFSET: process.env.DEFAULT_TIMEZONE_OFFSET || 8,
            AI_SUMMARY_ENABLED: process.env.AI_SUMMARY_ENABLED || 'true',
            JWT_SECRET_MODE: process.env.JWT_SECRET ? 'static' : 'random_on_restart',
            WEB_DEVICE_COUNT: process.env.WEB_DEVICE_COUNT || true,
            WEB_COMMENT: process.env.WEB_COMMENT || true,
        };

        res.json({
            success: true,
            config
        });
    } catch (error) {
        console.error('获取配置错误:', error);
        res.status(500).json({
            success: false,
            message: '获取配置失败',
            details: error.message
        });
    }
});

router.post('/config', authenticateToken, async (req, res) => {
    try {
        const fs = require('fs');
        const path = require('path');
        const envPath = path.join(__dirname, '../.env');

        const updates = req.body;

        if (!updates || Object.keys(updates).length === 0) {
            return res.status(400).json({
                success: false,
                message: '请提供要更新的配置项'
            });
        }

        // 移除敏感配置项
        const allowedKeys = [
            'PORT',
            'MONGODB_URI',
            'SECRET',
            'AI_API_URL',
            'AI_API_KEY',
            'AI_MODEL',
            'AI_MAX_TOKENS',
            'AI_PROMPT',
            'PUBLISH_ENABLED',
            'PUBLISH_API_URL',
            'PUBLISH_API_KEY',
            'DEFAULT_TIMEZONE_OFFSET',
            'AI_SUMMARY_ENABLED',
            'WEB_DEVICE_COUNT',
            'WEB_COMMENT'
        ];

        const invalidKeys = Object.keys(updates).filter(key => !allowedKeys.includes(key));
        if (invalidKeys.length > 0) {
            return res.status(400).json({
                success: false,
                message: `不允许修改的配置项: ${invalidKeys.join(', ')}，管理员账户请使用专用接口修改`
            });
        }

        let envContent = '';
        if (fs.existsSync(envPath)) {
            envContent = fs.readFileSync(envPath, 'utf8');
        }

        const envLines = envContent.split('\n');
        const envMap = new Map();

        envLines.forEach(line => {
            const trimmedLine = line.trim();
            if (trimmedLine && !trimmedLine.startsWith('#')) {
                const separatorIndex = trimmedLine.indexOf('=');
                if (separatorIndex > 0) {
                    const key = trimmedLine.substring(0, separatorIndex).trim();
                    const value = trimmedLine.substring(separatorIndex + 1).trim();
                    envMap.set(key, value);
                }
            }
        });

        const updatedKeys = [];
        for (const [key, value] of Object.entries(updates)) {
            envMap.set(key, value);
            updatedKeys.push(key);
            process.env[key] = value;
        }

        const newEnvContent = Array.from(envMap.entries())
            .map(([key, value]) => `${key}=${value}`)
            .join('\n');

        fs.writeFileSync(envPath, newEnvContent + '\n', 'utf8');

        res.json({
            success: true,
            message: '配置已更新',
            updatedKeys,
            notice: '部分配置需要重启服务才能生效'
        });

    } catch (error) {
        console.error('修改配置错误:', error);
        res.status(500).json({
            success: false,
            message: '修改配置失败',
            details: error.message
        });
    }
});

router.post('/restart', authenticateToken, (req, res) => {
    const { exec } = require('child_process');

    console.log('[Security] Service restart requested, all tokens will be invalidated');

    res.json({
        success: true,
        message: '服务重启指令已发送，将在1秒后执行重启',
        notice: '重启后所有用户需要重新登录',
        restartStatus: 'pending'
    });

    setTimeout(() => {
        console.log('开始执行PM2重启...');
        exec('pm2 restart runtime_tracker', (error, stdout, stderr) => {
            if (error) {
                console.error('PM2 重启失败:', error);
                return;
            }
            console.log('PM2 重启成功:', stdout);
        });
    }, 1000);
});

module.exports.authenticateToken = authenticateToken;
module.exports = router;