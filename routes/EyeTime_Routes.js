// routes/EyeTime_Routes.js
const express = require('express');
const router = express.Router();
const EyeTimeQuery = require('../services/EyeTimeQuery');
const eyeTimeQuery = new EyeTimeQuery();

/**
 * 查询某日用眼统计 (总分钟数 + 小时分布)
 * GET /eyetime/daily?date=YYYY-MM-DD
 */
router.get('/eyetime/daily', async (req, res) => {
    try {
        let date;
        if (req.query.date) {
            const dateStr = req.query.date;
            const [year, month, day] = dateStr.split('-').map(Number);

            if (!year || !month || !day) {
                return res.status(400).json({
                    error: 'Invalid date format. Please use YYYY-MM-DD format.'
                });
            }

            date = new Date();

            if (isNaN(date.getTime())) {
                return res.status(400).json({
                    error: 'Invalid date format. Please use YYYY-MM-DD format.'
                });
            }
        } else {
            date = new Date(); // 默认当前日期
        }

        const stats = await eyeTimeQuery.getDailyMinutes(date);
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
        const stats = await eyeTimeQuery.getWeeklyMinutes(weekOffset);
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
        const stats = await eyeTimeQuery.getMonthlyMinutes(monthOffset);
        res.json(stats);
    } catch (error) {
        console.error('Error in /eyetime/monthly:', error);
        res.status(500).json({ error: 'Database error', details: error.message });
    }
});

module.exports = router;
