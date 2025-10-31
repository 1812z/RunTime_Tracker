const express = require('express');
const router = express.Router();
const EyeTimeQuery = require('../services/EyeTimeQuery');
const eyeTimeQuery = new EyeTimeQuery();

// 查询某日用眼统计(总分钟数+小时分布)
router.get('/eyetime/daily', async (req, res) => {
    try {
        const timezoneOffset = parseInt(req.query.timezoneOffset) || 0;
        if (timezoneOffset < -12 || timezoneOffset > 12) {
            return res.status(400).json({
                error: 'Invalid timezoneOffset. Must be between -12 and +12 (UTC-12 to UTC+12).',
            });
        }

        let date;
        if (req.query.date) {
            // 用户传入的是用户时区的日期字符串 YYYY-MM-DD
            const dateStr = req.query.date;
            const [year, month, day] = dateStr.split('-').map(Number);

            if (!year || !month || !day) {
                return res.status(400).json({
                    error: 'Invalid date format. Please use YYYY-MM-DD format.'
                });
            }

            // 创建UTC的中午12点(避免日期边界问题)
            date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0, 0));

            if (isNaN(date.getTime())) {
                return res.status(400).json({
                    error: 'Invalid date format. Please use YYYY-MM-DD format.'
                });
            }
        } else {
            // 如果没有传date,使用当前UTC时间
            date = new Date();
        }

        const stats = await eyeTimeQuery.getDailyMinutes(date, timezoneOffset);

        res.json(stats);
    } catch (error) {
        console.error('Error in /eyetime/daily:', error);
        res.status(500).json({ error: 'Database error', details: error.message });
    }
});

// 查询某周用眼统计(每日总分钟数)
router.get('/eyetime/weekly', async (req, res) => {
    try {
        const timezoneOffset = parseInt(req.query.timezoneOffset) || 0;
        if (timezoneOffset < -12 || timezoneOffset > 12) {
            return res.status(400).json({
                error: 'Invalid timezoneOffset. Must be between -12 and +12 (UTC-12 to UTC+12).',
            });
        }

        const weekOffset = parseInt(req.query.weekOffset) || 0;
        const stats = await eyeTimeQuery.getWeeklyMinutes(weekOffset, timezoneOffset);
        res.json(stats);
    } catch (error) {
        console.error('Error in /eyetime/weekly:', error);
        res.status(500).json({ error: 'Database error', details: error.message });
    }
});

// 查询某月用眼统计(每日总分钟数)
router.get('/eyetime/monthly', async (req, res) => {
    try {
        const timezoneOffset = parseInt(req.query.timezoneOffset) || 0;
        if (timezoneOffset < -12 || timezoneOffset > 12) {
            return res.status(400).json({
                error: 'Invalid timezoneOffset. Must be between -12 and +12 (UTC-12 to UTC+12).',
            });
        }

        const monthOffset = parseInt(req.query.monthOffset) || 0;
        const stats = await eyeTimeQuery.getMonthlyMinutes(monthOffset, timezoneOffset);
        res.json(stats);
    } catch (error) {
        console.error('Error in /eyetime/monthly:', error);
        res.status(500).json({ error: 'Database error', details: error.message });
    }
});

module.exports = router;
