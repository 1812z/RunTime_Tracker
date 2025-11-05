const express = require('express');
const router = express.Router();
const { SECRET, statsRecorder, statsQuery, aiSummary } = require('../index');

// ==================== 辅助函数 ====================

/**
 * 将环境变量字符串转换为布尔值
 * @param {string|boolean|undefined} value - 环境变量值
 * @param {boolean} defaultValue - 默认值
 * @returns {boolean} 布尔值
 */
function parseBoolean(value, defaultValue = false) {
    // 如果值为 undefined、null 或空字符串，返回默认值
    if (value === undefined || value === null || value === '') {
        return defaultValue;
    }

    // 如果已经是布尔值，直接返回
    if (typeof value === 'boolean') {
        return value;
    }

    // 如果是字符串，转换为小写后判断
    if (typeof value === 'string') {
        const str = value.toLowerCase().trim();
        return str === 'true' || str === '1' || str === 'yes' || str === 'on';
    }

    // 如果是数字，非0为true
    if (typeof value === 'number') {
        return value !== 0;
    }

    // 其他情况返回默认值
    return defaultValue;
}

/**
 * 获取客户端IP地址
 */
function getClientIp(req) {
    // 优先从X-Forwarded-For获取(适用于反向代理场景)
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) {
        return typeof forwarded === 'string'
            ? forwarded.split(',')[0].trim()
            : forwarded[0].trim();
    }
    // 如果没有代理,直接使用connection的remoteAddress
    return req.connection?.remoteAddress || req.socket?.remoteAddress || req.ip;
}

// ==================== API路由 ====================

// 应用上报API
router.post('/', async (req, res) => {
    const { secret, device, app_name, running, batteryLevel, isCharging } = req.body;

    if (secret !== SECRET) {
        return res.status(401).json({ error: 'Invalid secret' });
    }

    if (!device) {
        return res.status(400).json({ error: 'Missing device' });
    }

    try {
        // 1. 处理电池信息
        if (batteryLevel !== undefined && batteryLevel > 0 && batteryLevel <= 100) {
            const chargingStatus = isCharging === true;
            statsRecorder.recordBattery(device, batteryLevel, chargingStatus);
        }

        // 2. 处理应用信息
        if (app_name !== undefined || running !== undefined) {
            // 校验应用信息的完整性
            if (running !== false && !app_name) {
                return res.status(400).json({
                    error: 'Missing app_name when running is true'
                });
            }

            await statsRecorder.recordUsage(device, app_name, running);
        }

        // 返回成功响应
        res.json({
            success: true,
            batteryInfo: statsRecorder.getLatestBatteryInfo(device),
            timestamp: new Date()
        });
    } catch (error) {
        console.error('Record error:', error);
        res.status(500).json({
            error: 'Database error',
            details: error.message
        });
    }
});

// 获取设备列表
router.get('/devices', async (req, res) => {
    try {
        const devices = await statsQuery.getDevices();
        res.json(devices);
    } catch (error) {
        res.status(500).json({ error: 'Database error' });
    }
});

// 获取所有设备的全部切换记录(测试用)
router.get('/recentall', (req, res) => {
    try {
        // 将Map转换为数组形式
        const allRecords = {};
        statsRecorder.recentAppSwitches.forEach((switches, deviceId) => {
            allRecords[deviceId] = switches.map(entry => ({
                appName: entry.appName,
                timestamp: entry.timestamp,
                running: entry.running !== false
            }));
        });
        res.json({
            success: true,
            data: allRecords,
            count: statsRecorder.recentAppSwitches.size
        });
    } catch (error) {
        res.status(500).json({
            error: 'Server error',
            details: error.message
        });
    }
});

// 获取特定设备应用切换记录
router.get('/recent/:deviceId', async (req, res) => {
    try {
        const deviceId = req.params.deviceId;
        let records = [];
        if (statsRecorder.recentAppSwitches.has(deviceId)) {
            const switchEntries = statsRecorder.recentAppSwitches.get(deviceId)
            // 转换为所需格式
            records = switchEntries.map(entry => ({
                appName: entry.appName,
                timestamp: entry.timestamp,
                running: entry.running !== false
            }));
        }
        res.json({
            success: true,
            data: records,
            count: records.length
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Server error',
            details: error.message
        });
    }
});

// 获取当天统计数据（支持全部设备）
router.get('/stats/:deviceId', async (req, res) => {
    try {
        // 解析日期参数（如果有的话）
        let date;
        if (req.query.date) {
            // 支持 YYYY-MM-DD 格式或完整日期字符串
            date = req.query.date;
        } else {
            date = new Date();
        }

        const deviceId = req.params.deviceId;
        let stats;
        if (deviceId === 'summary') {
            stats = await statsQuery.getDailyStatsForAllDevices(date);
        } else {
            stats = await statsQuery.getDailyStats(deviceId, date);
        }

        if (!stats || stats.totalUsage === 0) {
            return res.json({
                totalUsage: 0,
                appStats: {},
                hourlyStats: Array(24).fill(0),
                appHourlyStats: {}
            });
        }

        res.json(stats);
    } catch (error) {
        console.error('Error in /api/stats/:deviceId:', error);
        res.status(500).json({ error: 'Database error', details: error.message });
    }
});

// 获取周统计数据（支持全部设备）- 后端处理时区
router.get('/weekly/:deviceId', async (req, res) => {
    try {
        const weekOffset = parseInt(req.query.weekOffset) || 0;
        const appName = req.query.appName || null;
        const deviceId = req.params.deviceId;

        let stats;
        if (deviceId === 'summary') {
            stats = await statsQuery.getWeeklyAppStatsForAllDevices(appName, weekOffset);
        } else {
            stats = await statsQuery.getWeeklyAppStats(deviceId, appName, weekOffset);
        }

        res.json(stats);
    } catch (error) {
        console.error('Error in /api/weekly/:deviceId:', error);
        res.status(500).json({ error: 'Database error', details: error.message });
    }
});

// 获取月统计数据（支持全部设备）- 后端处理时区
router.get('/monthly/:deviceId', async (req, res) => {
    try {
        const monthOffset = parseInt(req.query.monthOffset) || 0;
        const appName = req.query.appName || null;
        const deviceId = req.params.deviceId;

        let stats;
        if (deviceId === 'summary') {
            stats = await statsQuery.getMonthlyAppStatsForAllDevices(appName, monthOffset);
        } else {
            stats = await statsQuery.getMonthlyAppStats(deviceId, appName, monthOffset);
        }

        res.json(stats);
    } catch (error) {
        console.error('Error in /api/monthly/:deviceId:', error);
        res.status(500).json({ error: 'Database error', details: error.message });
    }
});

// ==================== AI总结相关API ====================

// 获取最近一次AI总结（无需验证，只读操作）
router.get('/ai/summary/:deviceId', (req, res) => {
    try {
        const deviceId = req.params.deviceId;
        const summary = aiSummary.getRecentSummary(deviceId);

        if (!summary) {
            return res.status(404).json({
                success: false,
                error: 'No recent summary found for this device',
                message: '该设备暂无AI总结记录'
            });
        }

        res.json({
            success: true,
            deviceId,
            ...summary
        });
    } catch (error) {
        console.error('Error in /api/ai/summary/:deviceId:', error);
        res.status(500).json({
            error: 'Failed to retrieve summary',
            details: error.message
        });
    }
});

// 获取所有设备的最近总结（无需验证，只读操作）
router.get('/ai/summaries', (req, res) => {
    try {
        const summaries = aiSummary.getAllRecentSummaries();

        res.json({
            success: true,
            count: Object.keys(summaries).length,
            summaries
        });
    } catch (error) {
        console.error('Error in /api/ai/summaries:', error);
        res.status(500).json({
            error: 'Failed to retrieve summaries',
            details: error.message
        });
    }
});

// 手动触发AI总结生成 (GET方式，需要secret验证)
router.get('/ai/trigger/:deviceId', async (req, res) => {
    try {
        // 验证secret
        const { secret, date } = req.query;

        if (!secret || secret !== SECRET) {
            return res.status(401).json({
                success: false,
                error: 'Invalid or missing secret'
            });
        }

        const deviceId = req.params.deviceId;

        const result = await aiSummary.triggerSummary(deviceId, {
            date: date || null
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

// 获取AI总结状态（无需验证，只读操作）
router.get('/ai/status', (req, res) => {
    res.json({
        enabled: aiSummary.enabled,
        aiConfigured: !!aiSummary.aiConfig.apiKey,
        publishEnabled: aiSummary.publishConfig.publishEnabled,
        cronJobsCount: aiSummary.cronJobs.length,
        schedules: aiSummary.getScheduleStrings(),
        model: aiSummary.aiConfig.model,
        defaultTimezone: `UTC${aiSummary.scheduleConfig.timezoneOffset >= 0 ? '+' : ''}${aiSummary.scheduleConfig.timezoneOffset}`
    });
});

// 预留：周总结API
router.post('/ai/weekly/:deviceId', async (req, res) => {
    res.status(501).json({
        error: 'Weekly summary not implemented yet',
        message: '周总结功能将在后续版本中实现'
    });
});

// 预留：月总结API
router.post('/ai/monthly/:deviceId', async (req, res) => {
    res.status(501).json({
        error: 'Monthly summary not implemented yet',
        message: '月总结功能将在后续版本中实现'
    });
});

// 获取客户端IP地址
router.get('/ip', (req, res) => {
    const clientIp = getClientIp(req);
    res.json({ ip: clientIp });
});

// ==================== 页面组件配置 API ====================

/**
 * 获取页面组件显示配置
 */
router.get('/pageConfig', (req, res) => {
    try {
        const config = {
            WEB_DEVICE_COUNT: parseBoolean(process.env.WEB_DEVICE_COUNT, true),
            WEB_COMMENT: parseBoolean(process.env.WEB_COMMENT, true),
            WEB_AI_SUMMARY: parseBoolean(process.env.AI_SUMMARY_ENABLED, true),
            GISCUS_REPO: process.env.GISCUS_REPO || '',
            GISCUS_REPOID: process.env.GISCUS_REPOID || '',
            GISCUS_CATEGORY: process.env.GISCUS_CATEGORY || '',
            GISCUS_CATEGORYID: process.env.GISCUS_CATEGORYID || '',
            GISCUS_MAPPING: process.env.GISCUS_MAPPING || 'pathname',
            GISCUS_REACTIONSENABLED: parseBoolean(process.env.GISCUS_REACTIONSENABLED, true),
            GISCUS_EMITMETADATA: parseBoolean(process.env.GISCUS_EMITMETADATA, false),
            GISCUS_INPUTPOSITION: process.env.GISCUS_INPUTPOSITION || 'bottom',
            GISCUS_THEME: process.env.GISCUS_THEME || 'light',
            GISCUS_LANG: process.env.GISCUS_LANG || 'zh-CN'
        };

        const tzOffset = parseInt(process.env.DEFAULT_TIMEZONE_OFFSET ?? '8')

        res.json({
            success: true,
            config,
            tzOffset
        });
    } catch (error) {
        console.error('获取页面配置错误:', error);
        res.status(500).json({
            success: false,
            message: '获取配置失败',
            details: error.message
        });
    }
});

module.exports = router;