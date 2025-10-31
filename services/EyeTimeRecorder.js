// EyeTimeRecorder.js - 彻底修复版
const { mongoose } = require('../index');

const DailyEyeTime = mongoose.model('DailyEyeTime', {
    date: Date,
    hourlyUsage: [Number]
});

class EyeTimeRecorder {
    constructor() {
        this.globalStatus = new Map(); // { deviceId: { isActive } }
        this.currentDateKey = this._getDateKey(new Date());
        this.hourlyUsage = Array(24).fill(0);

        // 全局活跃状态追踪
        this.isAnyDeviceActive = false;

        // 记录已使用的分钟（防止重复计算）
        this.usedMinutes = new Set(); // 格式: "HH:MM"
    }

    _getDateKey(date) {
        const d = new Date(date);
        d.setHours(0, 0, 0, 0);
        return d;
    }

    // 获取分钟标识 "HH:MM"
    _getMinuteKey(date) {
        const h = date.getHours().toString().padStart(2, '0');
        const m = date.getMinutes().toString().padStart(2, '0');
        return `${h}:${m}`;
    }

    async recordActivity(deviceId, isActive = true) {
        const now = new Date();

        // 检查是否跨天
        const todayKey = this._getDateKey(now);
        if (todayKey.getTime() !== this.currentDateKey.getTime()) {
            await this._handleDayChange(todayKey);
        }

        // 获取或创建设备状态
        let status = this.globalStatus.get(deviceId);
        if (!status) {
            status = { isActive: false };
            this.globalStatus.set(deviceId, status);
        }

        // 更新设备状态
        status.isActive = isActive;

        // 更新全局活跃状态
        this._updateGlobalActiveState(now);
    }

    // 更新全局活跃状态
    _updateGlobalActiveState(now) {
        // 检查是否有任何设备活跃
        this.isAnyDeviceActive = Array.from(this.globalStatus.values())
            .some(s => s.isActive);

        // 如果有设备活跃，立即记录当前分钟
        if (this.isAnyDeviceActive) {
            this._recordCurrentMinute(now);
        }
    }

    // 记录当前分钟为已使用
    _recordCurrentMinute(date) {
        const minuteKey = this._getMinuteKey(date);

        // 如果这一分钟还没记录过
        if (!this.usedMinutes.has(minuteKey)) {
            this.usedMinutes.add(minuteKey);

            const hour = date.getHours();
            const currentVal = Number(this.hourlyUsage[hour]) || 0;

            // 每小时最多60分钟
            if (currentVal < 60) {
                this.hourlyUsage[hour] = currentVal + 1;
            }
        }
    }

// 跨天处理
    async _handleDayChange(newDateKey) {
        // 保存旧的一天
        await this._saveDay(this.currentDateKey);

        // 初始化新的一天
        this.currentDateKey = newDateKey;
        this.hourlyUsage = Array(24).fill(0);
        this.usedMinutes.clear(); // 清空已使用分钟集合
    }

    async _saveDay(dateKey) {
        let record = await DailyEyeTime.findOne({ date: dateKey });
        if (!record) {
            record = new DailyEyeTime({
                date: dateKey,
                hourlyUsage: Array(24).fill(0)
            });
        }

        // 直接覆盖
        record.hourlyUsage = [...this.hourlyUsage];
        await record.save();
    }
}

module.exports = EyeTimeRecorder;