// routes/EyeTime_Routes.js
const express = require('express');
const router = express.Router();
const EyeTimeQuery = require('../services/EyeTimeQuery');
const TimezoneUtils = require('../utils/timezone');

const eyeTimeQuery = new EyeTimeQuery();
const defaultTimezoneOffset = parseInt(process.env.DEFAULT_TIMEZONE_OFFSET) || 8;
const tzUtils = new TimezoneUtils(defaultTimezoneOffset);

/**
 * 查询某日用眼统计 (总分钟数 + 小时分布)
 * GET /eyetime/daily?date=YYYY-MM-DD
 */
router.get('/eyetime/daily', async (req, res) => {
    try {
        let date;

        if (req.query.date) {
            // 使用 TimezoneUtils 正确解析本地日期
            try {
                date = tzUtils.parseDate(req.query.date);
            } catch (e) {
                return res.status(400).json({
                    error: 'Invalid date format. Please use YYYY-MM-DD format.'
                });
            }
        } else {
            // 默认当前日期
            date = tzUtils.getTodayInLocal();
        }

        const stats = await eyeTimeQuery.getDailyMinutes(date, defaultTimezoneOffset);
        res.json(stats);
    } catch (error) {
        console.error('Error in /eyetime/daily:', error);
        res.status(500).json({ error: 'Database error', details: error.message });
    }
});

/**
 * 查询某周用眼统计 (每日总分钟数)
 * GET /eyetime/weekly?weekOffset=0
 */
router.get('/eyetime/weekly', async (req, res) => {
    try {
        const weekOffset = parseInt(req.query.weekOffset) || 0;
        const stats = await eyeTimeQuery.getWeeklyMinutes(weekOffset, defaultTimezoneOffset);
        res.json(stats);
    } catch (error) {
        console.error('Error in /eyetime/weekly:', error);
        res.status(500).json({ error: 'Database error', details: error.message });
    }
});

/**
 * 查询某月用眼统计 (每日总分钟数)
 * GET /eyetime/monthly?monthOffset=0
 */
router.get('/eyetime/monthly', async (req, res) => {
    try {
        const monthOffset = parseInt(req.query.monthOffset) || 0;
        const stats = await eyeTimeQuery.getMonthlyMinutes(monthOffset, defaultTimezoneOffset);
        res.json(stats);
    } catch (error) {
        console.error('Error in /eyetime/monthly:', error);
        res.status(500).json({ error: 'Database error', details: error.message });
    }
});

module.exports = router;