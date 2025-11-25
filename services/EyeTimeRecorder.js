// EyeTimeRecorder.js
const { mongoose } = require('../index');
const TimezoneUtils = require('../utils/timezone');

const DailyEyeTime = mongoose.model('DailyEyeTime', {
    date: Date,           // 本地时区日期零点对应的 UTC 时间戳
    hourlyUsage: [Number] // 24小时数组,每项代表分钟数
});

class EyeTimeRecorder {
    constructor(timezoneConfig) {
        // 初始化时区工具
        this.timezoneUtils = new TimezoneUtils(timezoneConfig.timezoneOffset || 'Asia/Shanghai');

        // 存储所有设备的状态
        this.deviceStates = new Map(); // { deviceId: { isActive: boolean, lastUpdateTime: timestamp } }

        // 全局状态追踪
        this.globalActive = false;
        this.lastRecordTime = null;
    }

    /**
     * 记录设备活动状态
     * @param {string} deviceId - 设备ID
     * @param {boolean} isActive - 是否活跃（用眼中）
     */
    async recordActivity(deviceId, isActive = true) {
        const now = Date.now();
        const wasGlobalActive = this.globalActive;

        // 更新设备状态
        this.deviceStates.set(deviceId, {
            isActive: isActive,
            lastUpdateTime: now
        });

        // 重新计算全局状态（只要有一个设备活跃，全局就活跃）
        this.globalActive = false;
        for (const [, state] of this.deviceStates) {
            if (state.isActive) {
                this.globalActive = true;
                break;
            }
        }

        // 如果全局状态从活跃变为非活跃，需要记录最后一段时间
        if (wasGlobalActive && !this.globalActive && this.lastRecordTime) {
            await this._saveUsageTime(this.lastRecordTime, now);
            this.lastRecordTime = null;
        }

        // 如果全局状态从非活跃变为活跃，开始新的记录
        if (!wasGlobalActive && this.globalActive) {
            this.lastRecordTime = now;
        }

        // 如果全局状态持续活跃，记录这段时间并更新起始时间
        if (wasGlobalActive && this.globalActive && this.lastRecordTime) {
            await this._saveUsageTime(this.lastRecordTime, now);
            this.lastRecordTime = now;
        }
    }

    /**
     * 保存使用时间到数据库
     * @private
     */
    async _saveUsageTime(startTime, endTime) {
        const durationMs = endTime - startTime;
        if (durationMs <= 0) return;

        // 将时间段按本地时区的小时和日期拆分
        const segments = this._splitTimeSegments(startTime, endTime);

        // 为每个时间段更新数据库
        for (const segment of segments) {
            await this._updateDailyRecord(segment.date, segment.hour, segment.minutes);
        }
    }

    /**
     * 将时间段按本地时区的日期和小时拆分
     * @private
     */
    _splitTimeSegments(startTime, endTime) {
        const segments = [];
        let currentTime = startTime;

        while (currentTime < endTime) {
            // 转换为本地时间
            const localDate = this.timezoneUtils.utcToLocal(new Date(currentTime));
            const currentHour = localDate.getHours();

            // 计算当前小时结束时间（本地时间）
            const hourEndLocal = new Date(localDate);
            hourEndLocal.setHours(currentHour, 59, 59, 999);

            // 转换回UTC
            const hourEndUtc = this.timezoneUtils.localToUtc(hourEndLocal).getTime();

            // 确定这个时间段的结束时间
            const segmentEnd = Math.min(endTime, hourEndUtc + 1); // +1ms 进入下一小时

            // 计算分钟数
            const segmentDurationMs = segmentEnd - currentTime;
            const minutes = segmentDurationMs / (60 * 1000);

            // 获取本地时区零点的正确 UTC 时间
            // 例如：北京时间 2025-11-24 -> UTC 2025-11-23T16:00Z
            const localDayStartUtc = this.timezoneUtils.getLocalDayStart(new Date(currentTime));

            segments.push({
                date: localDayStartUtc,  // 存储为本地时区零点对应的 UTC 时间
                hour: currentHour,
                minutes: minutes
            });

            currentTime = segmentEnd;
        }

        return segments;
    }

    /**
     * 更新数据库中的每日记录
     * @private
     */
    async _updateDailyRecord(date, hour, minutes) {
        try {
            // 查找或创建当天的记录
            let record = await DailyEyeTime.findOne({ date: date });

            if (!record) {
                // 创建新记录，初始化24小时数组为0
                record = new DailyEyeTime({
                    date: date,  // 存储为本地时区零点的 UTC 时间
                    hourlyUsage: Array(24).fill(0)
                });
            }

            // 累加该小时的使用时间
            record.hourlyUsage[hour] += minutes;

            // 保存到数据库
            await record.save();

        } catch (error) {
            console.error('保存用眼时间记录失败:', error);
            throw error;
        }
    }

    /**
     * 获取设备当前状态（可选方法，用于调试）
     */
    getDeviceStatus(deviceId) {
        return this.deviceStates.get(deviceId) || null;
    }

    /**
     * 获取全局活跃状态（可选方法，用于调试）
     */
    isGlobalActive() {
        return this.globalActive;
    }

    /**
     * 获取所有活跃设备列表（可选方法，用于调试）
     */
    getActiveDevices() {
        const activeDevices = [];
        for (const [deviceId, state] of this.deviceStates) {
            if (state.isActive) {
                activeDevices.push(deviceId);
            }
        }
        return activeDevices;
    }
}

module.exports = EyeTimeRecorder;