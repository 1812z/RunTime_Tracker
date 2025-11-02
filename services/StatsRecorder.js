// StatsRecorder.js - 记录信息模块
const { mongoose } = require('../index');
const EyeTimeRecorder = require('./EyeTimeRecorder');
const TimezoneUtils = require('../utils/timezone'); // 引入时区工具

const eyeTimeRecorder = new EyeTimeRecorder();

// 假设从 index.js 中读取时区配置
// 你需要在实际代码中从配置文件或 index.js 中导入这个值
// 例如: const { timezoneOffset } = require('../config');
// 这里我们先创建一个默认的，你需要替换成实际的
let timezoneUtils;

// 定义新的数据模型 - 按天/小时/应用存储
const DailyStat = mongoose.model('DailyStat', {
    deviceId: String,
    date: Date,       // 本地时区日期零点 (存储为该时区零点的 UTC 时间戳)
    appName: String,
    hourlyUsage: [Number] // 24小时数组,每项代表分钟数
});

class StatsRecorder {
    constructor(timezoneConfig = 8) {
        // 初始化时区工具（接收时区偏移或时区名称）
        timezoneUtils = new TimezoneUtils(timezoneConfig);

        // 设备应用切换记录
        this.recentAppSwitches = new Map(); // {deviceId: [{appName, timestamp}]}
        // 电池信息存储
        this.batteryInfo = new Map(); // {deviceId: {level, isCharging, timestamp}}
    }

    // 记录电池信息和充电状态
    recordBattery(deviceId, level, isCharging = false) {
        const now = new Date();

        this.batteryInfo.set(deviceId, {
            level: level,
            isCharging: isCharging,
            timestamp: now
        });
    }

    // 获取最新电池信息
    getLatestBatteryInfo(deviceId) {
        const info = this.batteryInfo.get(deviceId);
        if (!info) {
            return {
                level: 0,
                isCharging: false,
                timestamp: null
            };
        }
        return info;
    }

    // 记录应用使用时间
    async recordUsage(deviceId, appName, running) {
        const now = new Date();

        await eyeTimeRecorder.recordActivity(deviceId, running) // 记录公共使用时间（用眼时长）

        if (!this.recentAppSwitches.has(deviceId)) {
            this.recentAppSwitches.set(deviceId, []);
        }

        const deviceSwitches = this.recentAppSwitches.get(deviceId);

        // 处理停止运行的情况
        if (running === false) {
            if (deviceSwitches.length > 0) {
                const lastSwitch = deviceSwitches[0];
                if (lastSwitch.running !== false) {
                    const minutesSinceLastSwitch = this.calculatePreciseMinutes(lastSwitch.timestamp, now);
                    // 更新应用分时段时间统计,传递完整的开始时间戳
                    await this.updateDailyStat(deviceId, lastSwitch.appName, lastSwitch.timestamp, minutesSinceLastSwitch);
                }
                deviceSwitches[0].running = false;
                deviceSwitches.unshift({
                    appName: "设备待机",
                    timestamp: now,
                    running: false
                });
            }
            return;
        }

        // 使用时间计算
        let minutesSinceLastSwitch = 0;
        if (deviceSwitches.length > 0) {
            const lastSwitch = deviceSwitches[0];
            if (lastSwitch.running !== false) {
                minutesSinceLastSwitch = this.calculatePreciseMinutes(lastSwitch.timestamp, now);
                // 关键修改:传递完整的开始时间戳
                await this.updateDailyStat(deviceId, lastSwitch.appName, lastSwitch.timestamp, minutesSinceLastSwitch);
            }
        }

        // 添加新记录
        deviceSwitches.unshift({
            appName: appName,
            timestamp: now,
            running: true
        });

        if (deviceSwitches.length > 20) {
            deviceSwitches.pop();
        }
    }

    // 精确计算时间差,返回小数分钟(精确到2位)
    calculatePreciseMinutes(startTime, endTime) {
        const milliseconds = endTime - startTime;
        const minutes = milliseconds / (60 * 1000);
        // 保留2位小数
        return Math.round(minutes * 100) / 100;
    }

    // 获取本地时区的日期零点（返回该零点对应的 UTC Date 对象）
    getLocalDayStart(timestamp) {
        // 将 UTC 时间转换为本地时间
        const localTime = timezoneUtils.utcToLocal(new Date(timestamp));

        // 获取本地时间的日期部分
        const year = localTime.getUTCFullYear();
        const month = localTime.getUTCMonth();
        const day = localTime.getUTCDate();

        // 创建本地零点时间
        const localDayStart = new Date(Date.UTC(year, month, day, 0, 0, 0, 0));

        // 转换回 UTC（这样存储的就是本地零点对应的 UTC 时间）
        return timezoneUtils.localToUtc(localDayStart);
    }

    // 获取本地时区的小时数
    getLocalHour(timestamp) {
        const localTime = timezoneUtils.utcToLocal(new Date(timestamp));
        return localTime.getUTCHours();
    }

    // 更新每日统计
    async updateDailyStat(deviceId, appName, startTimestamp, durationMinutes) {
        // 使用本地时区的日期零点
        const dayStart = this.getLocalDayStart(startTimestamp);

        let stat = await DailyStat.findOne({
            deviceId,
            date: dayStart,
            appName
        });

        if (!stat) {
            stat = new DailyStat({
                deviceId,
                date: dayStart,
                appName,
                hourlyUsage: Array(24).fill(0)
            });
        }

        await this.distributePreciseMinutes(stat, startTimestamp, durationMinutes);
        await stat.save();
    }

    async distributePreciseMinutes(stat, startTimestamp, totalMinutes) {
        let remainingMinutes = totalMinutes;
        let currentTimestamp = new Date(startTimestamp);

        while (remainingMinutes > 0) {
            // 获取当前时间戳对应的本地日期零点
            const currentDayStart = this.getLocalDayStart(currentTimestamp);

            // 获取本地时区的小时、分钟、秒
            const localTime = timezoneUtils.utcToLocal(currentTimestamp);
            const currentHour = localTime.getUTCHours();
            const currentMinute = localTime.getUTCMinutes();
            const currentSecond = localTime.getUTCSeconds();

            // 如果跨日期了,需要获取新的统计记录
            let currentStat = stat;
            if (currentDayStart.getTime() !== stat.date.getTime()) {
                currentStat = await DailyStat.findOne({
                    deviceId: stat.deviceId,
                    date: currentDayStart,
                    appName: stat.appName
                });

                if (!currentStat) {
                    currentStat = new DailyStat({
                        deviceId: stat.deviceId,
                        date: currentDayStart,
                        appName: stat.appName,
                        hourlyUsage: Array(24).fill(0)
                    });
                }
            }

            // 计算当前小时内已使用的分钟数
            const usedInCurrentHour = currentStat.hourlyUsage[currentHour];

            // 计算当前时间点到下一个小时开始还有多少分钟
            const minutesToNextHour = 60 - currentMinute - (currentSecond > 0 ? (currentSecond / 60) : 0);

            // 当前小时的剩余容量
            const availableSpace = Math.max(0, 60 - usedInCurrentHour);

            // 实际能在当前小时分配的时间
            const minutesToAdd = Math.min(remainingMinutes, minutesToNextHour, availableSpace);

            if (minutesToAdd > 0) {
                const preciseMinutesToAdd = Math.round(minutesToAdd * 100) / 100;
                currentStat.hourlyUsage[currentHour] = Math.round((currentStat.hourlyUsage[currentHour] + preciseMinutesToAdd) * 100) / 100;

                // 如果是跨日期的新统计记录,需要保存
                if (currentStat !== stat) {
                    await currentStat.save();
                }

                remainingMinutes = Math.round((remainingMinutes - preciseMinutesToAdd) * 100) / 100;
            }

            // 移动到下一个时间点
            if (minutesToAdd >= minutesToNextHour) {
                // 移动到下一个小时的开始
                currentTimestamp = new Date(currentTimestamp.getTime() + minutesToNextHour * 60 * 1000);
            } else {
                // 在当前小时内完成了分配
                break;
            }

            // 避免浮点数精度问题
            if (remainingMinutes < 0.01) {
                remainingMinutes = 0;
            }

            // 防止无限循环(最多处理30天)
            const daysDifference = Math.floor((currentTimestamp - startTimestamp) / (24 * 60 * 60 * 1000));
            if (daysDifference > 30) {
                console.warn(`超过30天限制,剩余 ${remainingMinutes} 分钟无法分配,设备: ${stat.deviceId}, 应用: ${stat.appName}`);
                break;
            }
        }
    }
}

module.exports = StatsRecorder;