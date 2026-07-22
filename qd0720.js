var title = "260720起点自动";
var logFile = false; // 是否将日志保存到文件中

// --- 用户配置项 ---
var targetBookName = "盖世双谐"; // 去阅读任务需要搜索的书名
var enableGameTask = true;      // 是否执行玩游戏任务（true: 开启, false: 关闭）
var enableLottery = false;       // 是否执行转盘抽奖（true: 开启, false: 关闭）
// -----------------

var closeButtonBottom = 550; // 新广告右上角的X的下沿高度，控制台也放这么高
// X按钮位置不固定，扫描范围 X:1110-1130, Y:220-550 目前是1182 280
var t_click_step = 30;      // 循环扫描点击时，每步移这么远再点下一次
var t_click_x_left = 110;   // 循环扫描点击区域的左边框，到屏幕右边的距离（device.width-110≈1110）
var t_click_x_right = 90;   // 循环扫描点击区域的右边框，到屏幕右边的距离（device.width-90≈1130）
var t_click_y_top = 330;     // 循环扫描点击区域的上边框，在closeButtonBottom上方这么多（550-330=220）
var t_click_y_bottom = 0;  // 循环扫描点击区域的下边框，在closeButtonBottom下方这么多（550+0=550）

var startTime = new Date().getTime();
var t_click = new Object(); // 用于存储扫描点击成功的坐标
var debug = false; // 开启debug循环
var c_pos = [[0, closeButtonBottom], [device.width / 2, device.height - 500]]; // 控制台位置切换
var qidianPackageName = "com.qidian.QDReader";
var autojsPackage = currentPackage();
var longdash = "————————————";
var shortdash = "——————";
var freeCenterScrolled = 0;
var adCount = 0, lotteryCount = 0, exchangeCount = 0, readTime = 0, gamePlayTime = 0;
var ADReceive = new Object();
// 按钮固定位置（通常是底部中央的蓝色按钮）
var fixedButtonPos = { x: 630, y: 2320 };
// 扫描点击的坐标持久化
var thisLable = "ysun.QidianFreeCenter";
//storages.remove(thisLable); // 删除、重置旧坐标缓存（closeButtonBottom从200改为320后旧坐标失效）
var storage = storages.create(thisLable);
var closeCoord_name = "closeCoord";
let tmp = storage.get(closeCoord_name);
if (tmp) t_click = JSON.parse(tmp);
// 日志存放位置
var logFilePath = files.cwd() + "/log/" + thisLable + "/";
if (logFile || debug) files.createWithDirs(logFilePath);
var nickname = "";
var isFirstGoComplete = true; // 标记是否为第一次点击“去完成”
var isClickNewPage = false;   // 全局标记：当前是否正在进行会跳转页面的任务

//setScreenMetrics(1080, 2310);
auto.waitFor();
var cmdIsDisplay = false;
showCon();
console.setTitle(title);
console.setSize(device.width / 2, device.width / 2);
l_log("\n\n" + title);
if (auto.service == null) {
    l_error("请先开启无障碍服务！");
    l_exit();
}
l_info("无障碍服务已开启");
//log("开启静音");
//device.setMusicVolume(0); // 要给autojs权限
if (!requestScreenCapture()) {
    l_error("请求截图权限失败");
    l_exit();
}
l_log("请求截图权限成功");
try {
    if (paddle) l_log("有Paddle识图功能");
} catch (error) {
    l_error("无Paddle识图功能，推荐安装Autox.js v7！");
    l_exit();
}
console.verbose("建议Autox.js开启“稳定模式”、“前台服务”、“使用情况访问权限”。");
console.verbose("建议重启手机或清理手机后再运行。");
l_log(longdash);

function wherePage() {
    let cp = currentPackage();
    let ca = currentActivity();
    
    // 优先通过包名和 Activity 快速过滤
    if (cp != qidianPackageName && cp != "com.android.settings" && cp != autojsPackage) {
        return "isNotQidain";
    }
    
    // 广告 Activity 识别（最快）
    if (ca.indexOf("RewardvideoPortraitADActivity") > -1 || ca.indexOf("RewardVideoActivity") > -1 || ca.indexOf("AdActivity") > -1) {
       return "adframe";
    }

    // 识别页面特征，减少 exists() 的并发搜索
    if (text("书架").exists() && text("精选").exists()) {
        return "index";
    }
    if (textContains("完成任务得奖励").exists() && text("去完成").exists()) {
        return "freecenter";
    }
    if (textContains("点击后看").exists() && textContains("任务").exists()) {
        return "adframe";
    }
    if (textContains("后看广告").exists() || textContains("秒后获取奖励").exists() || textContains("观看视频").exists()) {
        return "adframe";
    }
    if (text("跳过").exists() || (textContains("秒").exists() && textContains("奖励").exists())) {
        return "adframe";
    }
    if (text("签到详情").exists() || text("连签有礼").exists()) {
        return "signdetail";
    }
    if (text("阅游戏").exists() && text("在线玩").exists()) {
        return "gamecenter";
    }
    if (id("browser_container").exists()) {
        return "browser";
    }
    return "";
}
function launchQidian() {
    // 切换回起点
    let p = currentPackage();
    if (p != qidianPackageName) {
        l_verbose("其它app：", getAppName(p));
        home();
        sleep(900);
    }
    launch(qidianPackageName);
    sleep(1200);
}
function openQidian() {
    launchQidian();

    let n = 0;
    let wp = "";
    do {
        n++;
        wp = wherePage();
        // 如果已经到了首页、福利中心或签到页，就不用再折腾启动逻辑了
        if (wp == "index" || wp == "freecenter" || wp == "signdetail") {
            l_info("当前已在已知页面：" + wp);
            break;
        }

        if (currentPackage() != qidianPackageName) {
            launchQidian();
            sleep(500);
        }
        let a = currentActivity();
        if (a.indexOf("Splash") > -1) {
            n = 0;
        } else if (a.indexOf("activity.QDReader") > -1 || a.indexOf("chapter") > -1 || a.indexOf("new_msg") > -1) {
            l_verbose("非主页Activity，尝试返回");
            back();
        } else if (wp == "isNotQidain") {
            l_verbose("不在起点App内，尝试拉起");
            launchQidian();
        } else {
            l_verbose("正在等待页面加载 (" + n + "/20)");
            // 如果已经在起点内且不是已知干扰页面，不轻易执行 back()，防止退出
        }
        sleep(500);
        closeDialogs();
        if (n > 20 && currentPackage() != qidianPackageName) break;
    } while (wp == "" || wp == "isNotQidain");
    
    sleep(600);
    
    // 如果已经在福利中心相关页面，跳过进入“我”的逻辑
    let wp_final = wherePage();
    if (wp_final == "freecenter" || wp_final == "signdetail") {
        l_info("已直接进入目标区域");
        return;
    }

    if (!enterMe()) {
        l_error("无法进入‘我’界面，请手动复原到首页");
        l_warn(wherePage(), currentPackage(), currentActivity());
        l_exit();
    }
    l_info("起点已就绪");
}
function enterMe() {
    closeDialogs();
    let me = id("view_tab_title_title").className("android.widget.TextView").text("我").findOne(500);
    let uc = id("viewPager").className("androidx.viewpager.widget.ViewPager").scrollable(true).findOne(500);
    if (me && me.parent().clickable()) {
        //方案一.1
        me.parent().click();
    } else if (me && me.parent().parent().clickable()) {
        //方案一.2
        me.parent().parent().click();
    } else if (uc) {
        //方案二
        let x1 = uc.bounds().right;
        let y1 = uc.bounds().bottom;
        click((x1 - 10), (y1 + 10));
    } else {
        //方案三
        click(device.width - 100, device.height - 100);
    }
    let n = 15;
    do {
        sleep(1000);
        closeDialogs();
        n--;
        if (n < 0) return false;
    } while (!text("福利中心").exists());
    if (id("tvName").exists() || id("userInfo").exists()) {
        //l_log("成功打开“我”");
        nickname = id("tvName").findOne(500).text();
        l_log("当前账号：", nickname);
        return true;
    }
    l_warn("未找到昵称，可能版本不一样");
    l_warn(wherePage(), currentPackage(), currentActivity());
    return false;
}
function enterFreeCenter() {
    if (wherePage() == "freecenter") {
        l_info("当前已在福利中心");
        return;
    }
    let n = 0;
    do {
        click("福利中心", 0);
        let m = 0;
        while (m < 5 && !textContains("完成任务得奖励").exists() && !text("去完成").exists()) {
            sleep(350);
            m++;
        }
        if (m == 5 && text("福利中心").exists() && text("规则").exists()) {
            l_verbose("进入福利中心，但下半部分无法识别");
            back();
            n = 0;
            sleep(500);
        }
        n++;
    } while (n < 8 && wherePage() != "freecenter");
    if (n == 8) {
        l_warn(wherePage(), currentPackage(), currentActivity());
        l_error("没识别到福利中心");
        l_exit();
    }
    l_info("已进入福利中心");
}
function closeDialogs() {
    function c(str, btn) {
        l_verbose(str);
        sleep(800);
        btn.click();
        sleep(800);
    }
    if (textContains("青少年模式").exists()) {
        l_verbose("青少年模式");
        sleep(500);
        click("我知道了", 0);
    }
    if (text("确定").exists() && textContains("无响应").exists()) c("无响应", text("确定").findOne(500));
    if (id("upgrade_dialog_close_btn").exists()) c("升级提醒", id("upgrade_dialog_close_btn").findOne(500));
    if (id("btnClose").exists()) c("徽章", id("btnClose").findOne(500));
    if (id("imgClose").exists()) c("首页悬浮广告", id("imgClose").findOne(500));
}
function exchange() {
    let result = 0;
    let e = className("android.widget.ListView").findOne(500);
    if (e.parent().clickable()) {
        freeCenterScrolled = scrollShowButton(freeCenterScrolled, e);
        e.parent().click();
        l_verbose("点进签到日历");
        sleep(1000);
        scrollShowButton(device.height, 0); // 进入后它会自动向下滚，滚回
        sleep(500);
    } else {
        l_error("没找到链接，无法进入签到日历");
    }
    let d = className("android.widget.Button").text("去兑换 今日").findOne(500);
    if (d) {
        // 今日是周日兑换
        l_verbose(shortdash);
        l_log(d.text());
        d.click();
        sleep(1000);
        let btns = className("android.widget.TextView").text("兑换").find();
        if (btns.length > 0) {
            let bigIndex = -1;
            let max = 0;
            for (let i = 0; i < btns.length; i++) {
                // 确保只点击列表中的“兑换”按钮，避免误点到其他地方
                if (btns[i].bounds().width() < 10 || btns[i].bounds().height() < 10) continue; 
                let t1 = getDescriptionOnLeft(btns[i]);
                let n1 = t1.replace(/[^\d.]/g, "") * 1;
                if (n1 > max) {
                    bigIndex = i;
                    max = n1;
                }
            }
            if (bigIndex > -1) {
                let n1 = 0;
                let r1 = "";
                do {
                    let targetBtn = refreshView(btns[bigIndex]);
                    if (!targetBtn) break;
                    l_verbose(getDescriptionOnLeft(targetBtn));
                    targetBtn.click();
                    sleep(2000);
                    let p2 = className("android.widget.Button").text("兑换").findOne(1000);
                    if (p2) {
                        let t1 = getTextOfView(p2.parent());
                        r1 = t1.split("\n")[0];
                        l_verbose(t1);
                        sleep(1000);
                        p2.click();
                        sleep(1000);
                    } else {
                        l_error("未找到二次确认兑换按钮");
                        break;
                    }
                    if (textContains("拼图").exists()) {
                        let c1 = 0;
                        while (textContains("拼图").exists()) {
                            c1++;
                            setConPos(c1 % 2);
                            //toastLog
                            l_log("请手动过一下");
                            sleep((1 + c1 % 2) * 800);
                        }
                        if (c1 > 0) setConPos(0);
                    }
                    n1++;
                } while (refreshView(btns[bigIndex]).text() == btns[bigIndex].text() && n1 < 5);
                if (refreshView(btns[bigIndex]).text() != btns[bigIndex].text()) {
                    showReceived(r1);
                    addReceived(r1.replace("兑换", ""));
                    result |= 0b10;
                    l_info("兑换成功");
                } else {
                    l_error("似乎兑换失败");
                }
                exchangeCount++;
            } else {
                l_warn("有兑换按钮，没找到对应说明");
            }
        }
    }
    back();
    sleep(1000);
    return result;
}
function lottery() {
    let result = 0;
    let cb = null;
    
    // 增加等待时间，确保福利中心页面在广告刷完后稳定
    l_verbose("准备进入抽奖流程，等待页面稳定...");
    sleep(1000);
    
    let e = className("android.widget.ListView").findOne(1000);
    if (e && e.parent() && e.parent().clickable()) {
        freeCenterScrolled = scrollShowButton(freeCenterScrolled, e);
        e.parent().click();
        l_verbose("点进签到日历");
        sleep(1500); // 增加进入后的等待时间
        
        let b = className("android.widget.Button").text("领奖励").findOne(1000);
        if (b) { 
            l_log(b.text());
            b.click();
            sleep(1500);
            clickIknown();
        }
        
        // 重新获取容器，防止滚动后失效
        let e_recheck = className("android.widget.ListView").findOne(500);
        if (e_recheck) scrollShowButton(device.height, 0); 
        sleep(1000);
        
        cb = className("android.widget.TextView").textContains("抽奖机会 ×").findOne(1000);
        if (!cb) cb = className("android.widget.TextView").text("做任务可抽奖").findOne(1000);
    } else {
        l_error("没找到链接或链接不可点击，无法进入签到日历");
        // 尝试兜底点击位置
        l_log("尝试坐标点击进入签到日历");
        click(500, 500); // 根据实际情况调整
        sleep(2000);
    }
    if (cb && (cb.text().indexOf("×") < 0 || (cb.text().indexOf("×") > 0 && cb.text().replace(/[^\d.]/g, "") * 1 > 0))) {
        // 有抽奖机会
        l_verbose(cb.text());
        scrollShowButton(0, cb);
        cb.click();
        sleep(1000);
        let n = 0;
        while (n < 5) {
            l_verbose(shortdash);
            let c = className("android.widget.TextView").text("抽奖").findOne(500);
            if (!c) {
                let v = className("android.widget.TextView").text("做任务抽奖机会+1").findOne(500);
                while (v != null && v.text() == refreshView(v).text()) {
                    l_log(v.text());
                    v.click();
                    sleep(2000);
                    video_look(v);
                    sleep(1000);
                    c = className("android.widget.TextView").text("抽奖").findOne(500);
                }
            }
            if (c) {
                l_log(c.text());
                let r = "";
                c.click();
                lotteryCount++;
                sleep(800);
                let n1 = 0;
                while (n1 < 8) {
                    l_verbose("转");
                    sleep(1000);
                    n1++;
                    // 彻底修复：重新寻找按钮对象，防止旧对象 c 彻底失效导致的 parent() 为 null
                    let c_now = className("android.widget.TextView").text("抽奖").findOnce();
                    if (!c_now || !c_now.parent()) {
                        l_warn("抽奖按钮或父容器已消失");
                        break;
                    }
                    let p = c_now.parent();
                    let idx = c_now.indexInParent();
                    let r1 = (idx >= 1 && p.childCount() > idx - 1) ? getLotteryReceive(p.child(idx - 1)) : "";
                    let r2 = (idx >= 2 && p.childCount() > idx - 2) ? getLotteryReceive(p.child(idx - 2)) : "";
                    let r3 = (idx >= 3 && p.childCount() > idx - 3) ? getLotteryReceive(p.child(idx - 3)) : "";
                    if (r1 != "" && r1 == r2 && r2 == r3) {
                        if (r != "") {
                            if (r == r1) {
                                addReceived(r);
                                showReceived(r);
                                result |= 0b01;
                                break;
                            } else {
                                r = "";
                            }
                        } else {
                            r = r3;
                        }
                    } else {
                        r = "";
                    }
                }
                if (n1 == 8) l_verbose("未获取到抽奖结果");
                n = 0;
                sleep(1000);
            } else {
                break;
            }
            n++;
        }
        if (result & 0b01) l_info("抽奖完成");
        let closeBtn = className("android.widget.TextView").text("").findOne(1000);
        if (closeBtn) {
            closeBtn.click();
        } else {
            // 兜底方案：如果找不到特定字符，尝试点击右上角或按返回键
            l_warn("未发现抽奖关闭按钮，尝试返回");
            back();
        }
    }
    back();
    sleep(1500);
    return result;
}
function runGameTask() {
    // 执行玩游戏任务（支持多轮）
    let gamebtntext = "去完成";
    let gameremain = "再玩";
    do {
        let playLabel = textContains(gameremain).findOne(500);
        if (!playLabel) break;
        l_log(playLabel.text());
        let min = playLabel.text().replace(/[^\d.]/g, "") * 1;
        let b = null;
        let aa = text(gamebtntext).find();
        for (let i = 0; i < aa.length; i++) {
            let s = getDescriptionOnLeft(aa[i]);
            if (s && s.indexOf(gameremain) > -1) {
                b = aa[i];
                break;
            }
        }
        if (b != null) {
            robustClick(b);
            sleep(1500);
            let res = game_play(min);
            if (res == 1) back();
            sleep(1000);
            if (wherePage() == "gamecenter") back();
            sleep(1500);
            if (res > 1) break;
        } else {
            l_error("没找到对应的'去完成'按钮");
            break;
        }
    } while (textContains(gameremain).exists());
    l_info("结束玩游戏");
    freeCenterScrolled = 0;
}
function jumpMarket(btn) {
    sleep(1000);
    launchQidian();
}

function video_look(btn) {
    adCount++;
    l_verbose("广告", adCount, "开始");
    
    let isSlideTask = false; // 是否为滑动任务
    let has_slide_reset = false; // 标记是否发生了滑动重置

    // 引入外层大循环：用于处理滑动任务后的状态重置
    // 当发生滑动任务需要重新识别时，通过 continue ad_main_loop; 跳回这里
    ad_main_loop: while (true) {
        let ad_raw = -1, ad_clicknewpage = -1; // 生页面、 要再点击一下的页面
        let m = 0;
        has_slide_reset = false; // 每次进入主循环重置标记
        let a1 = ["查看", "详情", "立即", "继续", "下载", "了解", "更多", "领取", "去", "秒杀"];
        do {
        sleep(500);
        let blocked_check = 0;
        let wp = wherePage();
        
        // 验证码检测逻辑：文字范围 Y: 110-850
        // 只有在第一次看广告任务且 isFirstGoComplete 为 true 时才执行检测
        let hasCaptcha = false;
        if (isFirstGoComplete) {
            let res_chap = cappad([0, 110, device.width, 740]); // 850-110=740
            for (let i = 0; i < res_chap.length; i++) {
                if (res_chap[i].text.indexOf("验证") > -1 || res_chap[i].text.indexOf("依次点击") > -1 || res_chap[i].text.indexOf("安全") > -1) {
                    hasCaptcha = true;
                    break;
                }
            }
        }
        
        if (hasCaptcha) {
            let c_count = 0;
            while (hasCaptcha) {
                c_count++;
                l_log("检测到安全验证，请手动完成 (" + c_count + ")");
                device.vibrate(500); // 震动提醒
                sleep(2000);
                // 重新检测验证码是否还在
                let res_recheck = cappad([0, 110, device.width, 740]);
                hasCaptcha = false;
                for (let i = 0; i < res_recheck.length; i++) {
                    if (res_recheck[i].text.indexOf("验证") > -1 || res_recheck[i].text.indexOf("依次点击") > -1 || res_recheck[i].text.indexOf("安全") > -1) {
                        hasCaptcha = true;
                        break;
                    }
                }
                if (c_count > 30) {
                    l_error("验证超时，跳过此任务");
                    return;
                }
            }
            l_info("验证已完成，继续任务");
             m = 0; // 重置识别计数
             continue;
         }

         // 在缓冲阶段就尝试进行一次快速 OCR，识别是否有倒计时或任务提示
        if (wp == "adframe" && m == 0) {
            // 快速识别：聚焦左上角核心区域
            let res_fast = cappad([0, 0, device.width, 550]); 
            for (let i = 0; i < res_fast.length; i++) {
                let txt = res_fast[i].text;
                if (txt.indexOf("秒") > -1 || txt.indexOf("完成") > -1 || txt.indexOf("任务") > -1 || txt.indexOf("滑动") > -1) {
                    l_log("核心区快速识别成功：", txt);
                    m = 3; 
                    break;
                }
            }
        }

        while (wp == "freecenter" || (wp == "adframe" && !textContains("跳过").exists() && !textContains("秒").exists())) {
            sleep(1000);
            blocked_check++;

            // 兜底操作：缩短判定时间，从 20 秒减为 12 秒
            if (blocked_check > 12) {
                l_error("加载过慢，执行兜底退回");
                back(); 
                sleep(1000);
                // 仅当确实不在起点时才执行 home()
                if (currentPackage() != qidianPackageName) {
                    home();
                    sleep(1000);
                }
                launchQidian();
                sleep(1000);
                return; 
            }

            if (text("可从这里回到福利页哦").exists()) click("我知道了", 0);
            if (textContains("播放将消耗流量").exists()) click("继续播放", 0);
            
            wp = wherePage();
            // 如果缓冲超过 5 秒还没出现倒计时，说明可能需要点击激活
            if (wp == "adframe" && blocked_check >= 5) {
                l_verbose("缓冲超时，尝试进入任务识别模式进行激活");
                m = 2; // 设置 m 使得退出循环后 m++ 变为 3，从而触发下方的任务识别
                break;
            }
            if (currentActivity() != "com.qq.e.tg.RewardvideoPortraitADActivity" && wp == "freecenter") btn.click();
        }
        m++;
        if (m > 6) { // 缩短整体识别轮次，从 10 减为 6
            l_warn("识别超时，切换旧版逻辑");
            break;
        }
        if (m >= 2) { // 提前进入核心识别阶段，从 3 提前到 2
            // 识别任务提示：聚焦左上角核心区域
            let res = cappad([0, 0, device.width, 550]); 
            // 如果核心区域没识别到，再扩大范围到上半部分兜底
            if (res.length == 0) res = cappad([0, 0, device.width, 1600]);

            // 第一遍扫描：优先判定“滑动任务”
            for (let i = 0; i < res.length; i++) {
                let txt = res[i].text;
                if (txt.indexOf("滑动") > -1 && res[i].bounds.top < 1000) {
                    let sec = txt.replace(/[^\d.]/g, "") * 1 || 15;
                    l_log("优先识别到滑动任务：", sec);
                    isSlideTask = true;
                    ad_raw = sec;
                    break;
                }
            }

            // 第二遍扫描：如果不是滑动任务，再判定其他类型
            if (!isSlideTask) {
                for (let i = 0; i < res.length; i++) {
                    let txt = res[i].text;
                    if (txt.indexOf("得奖励") > -1 || txt.indexOf("小游戏") > -1 || txt.indexOf("完成") > -1 || txt.indexOf("任务") > -1 || txt.indexOf("点击后") > -1 || txt.indexOf("秒") > -1 || txt.indexOf("继续") > -1) {
                        let sec = txt.replace(/[^\d.]/g, "") * 1;
                        // 如果包含“已完成”且数字很小，通常是任务序号，不作为倒计时
                        if (txt.indexOf("已完成") > -1 && sec > 0 && sec < 10) {
                            sec = 15;
                        }
                        if (sec > 25) {
                            l_verbose(sec, "任务时间异常，限制为 15 秒");
                            sec = 15;
                        }
                        if (txt.indexOf("点击") > -1 && res[i].bounds.top < 1000) {
                            l_log("检测到点击任务提示：", sec || 15);
                            ad_clicknewpage = sec || 17; 
                            break;
                        } else if (txt.indexOf("点击") > -1 || txt.indexOf("玩") > -1) {
                            l_log("点/玩类型：", sec || 15);
                            ad_clicknewpage = sec || 15;
                            break;
                        } else if (txt.indexOf("浏览") > -1 || txt.indexOf("观看") > -1 || txt.indexOf("看") > -1 || txt.indexOf("秒") > -1) {
                            l_log("览/看/秒类型：", sec || 15);
                            ad_raw = sec || 15;
                            break;
                        }
                    }
                }
            }
            if (ad_raw > -1 || ad_clicknewpage > -1) {
                if (ad_clicknewpage > -1) {
                    let clicked = false;
                    l_verbose("等待 4 秒让按钮加载...");
                    sleep(4000);
                    
                    // 识别按钮：聚焦下半部分（Y >= 1600）
                    let res_new = cappad([0, 1600, device.width, device.height - 1600]); 
                    
                    // 1. 优先 OCR 识别特定范围或关键词按钮
                    // 针对微信小游戏：1888-2050 范围优先
                    let wechatKeywords = ["微信", "小游戏", "立即玩", "开始玩", "立即获得", "立即抢购", "立即下载"];
                    let btnBlacklist = ["点击后", "任务中", "已成功", "获得奖励", "秒后", "看完"];
                    
                    for (let i = 0; i < res_new.length; i++) {
                        let b = res_new[i].bounds;
                        let txt = res_new[i].text;
                        // 过滤黑名单
                        if (strHasArr(txt, btnBlacklist)) continue;
                        // 过滤太长的指令性文字（按钮通常很短）
                        if (txt.length > 10) continue;

                        // 如果在用户指定的高度范围内，且包含关键词
                        if (b.top >= 1850 && b.top <= 2100) {
                            if (strHasArr(txt, wechatKeywords) || strHasArr(txt, ["立即", "点击"])) {
                                l_log("策略1-目标范围OCR匹配：", txt, "@", b.top);
                                click(parseInt((b.left + b.right) / 2), parseInt((b.top + b.bottom) / 2));
                                clicked = true;
                                break;
                            }
                        }
                    }

                    // 2. 识别 Y > 2000 的其他高优先级按钮
                    if (!clicked) {
                        let priorityBtns = ["立即", "点击详情", "立即获得", "去完成", "立即抢购", "开始玩"];
                        for (let p = 0; p < priorityBtns.length; p++) {
                            for (let i = 0; i < res_new.length; i++) {
                                let txt = res_new[i].text;
                                if (strHasArr(txt, btnBlacklist)) continue;
                                if (txt.length > 8) continue; // 真正的按钮通常不会很长

                                if (txt.indexOf(priorityBtns[p]) > -1 && res_new[i].bounds.top > 2000) {
                                    let b = res_new[i].bounds;
                                    l_log("策略2-高优先级OCR匹配：", txt);
                                    click(parseInt((b.left + b.right) / 2), parseInt((b.top + b.bottom) / 2));
                                    clicked = true;
                                    break;
                                }
                            }
                            if (clicked) break;
                        }
                    }

                    // 3. 兜底 OCR：尝试识别其他可能的候选按钮（限制 Y >= 1600）
                    if (!clicked) {
                        // 按照与固定位置的距离排序，优先点离固定位置近的文字块
                        res_new.sort((a, b) => {
                            let distA = Math.sqrt(Math.pow((a.bounds.left + a.bounds.right) / 2 - fixedButtonPos.x, 2) + Math.pow((a.bounds.top + a.bounds.bottom) / 2 - fixedButtonPos.y, 2));
                            let distB = Math.sqrt(Math.pow((b.bounds.left + b.bounds.right) / 2 - fixedButtonPos.x, 2) + Math.pow((b.bounds.top + b.bounds.bottom) / 2 - fixedButtonPos.y, 2));
                            return distA - distB;
                        });

                        for (let i = 0; i < res_new.length; i++) {
                            let txt = res_new[i].text;
                            if (txt.indexOf("第三方应用") > -1 || strHasArr(txt, btnBlacklist)) continue;
                            if (txt.length < 2 || txt.length > 8) continue;

                            if (strHasArr(txt, a1)) {
                                let b = res_new[i].bounds;
                                l_log("策略3-通用候选OCR匹配：", txt);
                                click(parseInt((b.left + b.right) / 2), parseInt((b.top + b.bottom) / 2));
                                clicked = true;
                                break; 
                            }
                        }
                    }

                    // 4. 针对微信小游戏的固定位置尝试（1888-2050 范围）
                    if (!clicked) {
                        l_log("策略4-目标范围固定位置点击...");
                        click(device.width / 2, 1960); 
                        clicked = true;
                    }

                    // 5. 原有的固定位置兜底（Y=2320）
                    if (!clicked) {
                        l_log("策略5-传统固定位置点击:", fixedButtonPos.x, fixedButtonPos.y);
                        click(fixedButtonPos.x, fixedButtonPos.y);
                        clicked = true;
                    }
                    
                    if (clicked) {
                        l_verbose("等待 4 秒检测跳转状态...");
                        sleep(4000);

                        let wp_now = wherePage();
                        let curr_pkg = currentPackage();

                        if (curr_pkg == qidianPackageName) {
                            l_log("仍留在起点 App 内，检查任务状态...");
                            if (wp_now == "adframe" && !textContains("已成功").exists() && !textContains("任务中").exists()) {
                                l_warn("未检测到跳转且任务未激活，重新识别...");
                                m = 2;
                                continue;
                            }
                            l_info("检测到应用内任务已激活");
                        } else {
                            l_info("检测到已成功跳转至第三方应用：", getAppName(curr_pkg));
                        }
                        // 跳转检测等待的时间从总倒计时中扣除
                        if (ad_clicknewpage > -1) ad_clicknewpage -= 4;
                    }
                }
                break;
            }
        }
    } while (!(textContains("得奖励").exists() || textContains("跳过").exists() || textContains("任务").exists() || textContains("完成").exists()));

    if (ad_raw > -1 || ad_clicknewpage > -1) {
        // 新广告
        let sec = ad_clicknewpage;
        if (sec == -1) sec = ad_raw;
        sec += 2; // 多等两秒，应对严格的 15 秒限制
        let adSec = sec; // 保存广告原始时长，供续看遇到权限弹窗时使用
        isClickNewPage = ad_clicknewpage > -1; // 标记是否为"点击/玩"类型（会跳转新页面）
        if (isClickNewPage) {
            l_log("跳转类任务，预计等待 " + sec + " 秒...");
        }
        debugDelay = 3;
        while (sec > 0) {
            sleep(1000);

            if (isClickNewPage) {
                // 跳转类任务不再每秒输出日志
            } else if (isSlideTask) {
                // 滑动任务：每3秒滑动一次
                if (sec % 3 == 0) {
                    swipe(device.width * 0.85, device.height / 2, device.width * 0.15, device.height / 2, 400);
                    l_verbose("执行滑动", sec);
                }
            } else {
                if (sec % 5 == 0) click(random(10, 20), random(10, 20));
            }
            sec--;
        }
        l_verbose("应该看完");
        debugDelay = 1;
        sleep(1000);

        // 滑动任务结束后再滑一次确保任务完成
        if (isSlideTask) {
            l_verbose("滑动任务结束，最后滑一次");
            swipe(device.width * 0.85, device.height / 2, device.width * 0.15, device.height / 2, 400);
            sleep(1000);
        }

        // "点击/玩"类型广告会跳转到新页面，优先执行直接切换回起点，替代模拟返回
        if (isClickNewPage) {
            // 从微信等第三方应用返回时，页面切换需要时间，先等待1秒再判断
            sleep(1000);
            if (currentPackage() != qidianPackageName) {
                l_verbose("点击/玩类型，执行直接切换回起点");
                launchQidian();
                sleep(1000);
            }
            
            // 兜底：如果执行了切换还是没回到起点，或者由于没安装 App 导致卡在应用商店/浏览器
            // 增加一次物理/手势返回，确保关闭可能弹出的系统对话框或空白页
            l_verbose("执行一次保底返回");
            back();
            sleep(500);

            if (isSlideTask) {
                l_verbose("滑动任务，执行切换");
                swipe(device.width * 0.8, device.height / 2, device.width * 0.2, device.height / 2, 500);
                sleep(2000);
            }
        }

        // 看完点X
        let n = 0;
        let try_back_time = 2;
        let xr = device.width - t_click_x_right, yt = closeButtonBottom - t_click_y_top;
        let xc = xr, yc = yt;
        do {
            n++;

            // 权限管理弹窗：不做任何额外操作，直接等待剩余秒数（与正常看广告一致）
            if (currentPackage().indexOf("permissioncontroller") > -1) {
                l_verbose("权限管理弹窗，直接等待" + adSec + "秒");
                debugDelay = 3;
                let waitSec = adSec;
                while (waitSec > 0) {
                    sleep(1000);
                    waitSec--;
                }
                debugDelay = 1;
                continue;
            }

            if (n < try_back_time) {
                // 只有包名不在起点时才执行切换
                if (currentPackage() != qidianPackageName) {
                    if (currentPackage().indexOf("permissioncontroller") > -1) {
                        l_verbose("权限管理弹窗，直接右滑返回");
                        back();
                    } else {
                        l_verbose("执行直接切换回起点");
                        launchQidian();
                    }
                    sleep(800);
                }
            }

            // 返回动作完成后再识别当前app状态
            let wp_recheck = wherePage();
            let p_now = currentPackage();

            // 只有当：不是跳转类广告，且包名已跳出起点，且没识别到广告/浏览器页，才判定为界面不对
            if (!isClickNewPage && p_now != qidianPackageName && wp_recheck != "adframe" && wp_recheck != "browser") {
                l_verbose("界面不对0 (跳出起点): " + wp_recheck + " [" + p_now + "]");
                n = 0;
                if (p_now.indexOf("permissioncontroller") > -1) {
                    l_verbose("权限管理弹窗，直接右滑返回");
                    back();
                } else {
                    home();
                    console.hide();
                    cmdIsDisplay = false;
                    sleep(900);
                    launchQidian();
                }
            }

            if (n >= try_back_time) {
                let n1 = n - try_back_time;
                if (n1 < Object.keys(t_click).length) {
                    let tmp = t_click[Object.keys(t_click)[n1]];
                    l_verbose("尝试点击", tmp.x, tmp.y);
                    click(tmp.x, tmp.y);
                } else {
                    if (xc < device.width - t_click_x_left) {
                        l_error("没点到，放弃");
                        l_warn("请编辑代码前几行，扩大循环点击扫描的范围，试出点击坐标后，再缩小范围。");
                        throw new Error("请扩大扫描范围");
                    }
                    l_verbose("扫描", xc, yc);
                    click(xc, yc);
                    yc += t_click_step;
                    if (yc > closeButtonBottom + t_click_y_bottom) {
                        yc = yt;
                        xc -= t_click_step;
                    }
                }
                //if(className("android.widget.Button").text("立即下载").exists()){
                if (text("取消").exists()) {
                    l_verbose("界面不对1");
                    click(device.width - xc, yc);
                    n = 0;
                }
            }
            if (!cmdIsDisplay) showCon();

            if (!btn.parent()) {
                // 权限管理弹窗：不做任何额外操作，直接等待剩余秒数（与正常看广告一致）
                if (currentPackage().indexOf("permissioncontroller") > -1) {
                    l_verbose("权限管理弹窗，直接等待" + adSec + "秒");
                    debugDelay = 3;
                    let waitSec = adSec;
                    while (waitSec > 0) {
                        sleep(1000);
                        waitSec--;
                    }
                    debugDelay = 1;
                    continue;
                }

                // 等待页面稳定后再识别续看，避免返回过程中误识别
                sleep(500);

                // 再次检查是否已经返回到福利中心（返回完成后 btn.parent() 会恢复）
                let stabilize_count = 0;
                while (!btn.parent() && stabilize_count < 3) {
                    let wp_stabilize = wherePage();
                    if (wp_stabilize == "freecenter") break;
                    sleep(500);
                    stabilize_count++;
                }
                if (btn.parent()) continue;

                let t1 = new Date();
                // 识别"续"的关键词：聚焦左上角核心区域
                let res_kw = cappad([0, 0, device.width, 550]); 
                if (res_kw.length == 0) res_kw = cappad([0, 0, device.width, 1200]);

                let hasResumeKeyword = false;
                for (let i = 0; i < res_kw.length; i++) {
                    let txt = res_kw[i].text;
                    if (txt.indexOf("秒杀") > -1) continue;
                    
                    // 1. 优先判定是否包含“滑动”
                    if (txt.indexOf("滑动") > -1) {
                        l_log("检测到滑动指令，立即执行滑动切换...");
                        // 立即滑动
                        swipe(device.width * 0.85, device.height / 2, device.width * 0.15, device.height / 2, 400);
                        sleep(2000); // 增加等待时间，确保滑动后的新任务 UI 完全加载
                        
                        // 重置变量，跳出当前的点 X 和续看检测循环 (do-while !btn.parent())
                        // 通过 continue ad_main_loop 让外层主循环重新接管识别
                        isSlideTask = false;
                        has_slide_reset = true; // 设置重置标记
                        break; 
                    }

                    // 2. 关键词匹配：秒、观看、点击后、继续
                    if (txt.indexOf("秒") > -1 || txt.indexOf("观看") > -1 || txt.indexOf("点击后") > -1 || (txt.indexOf("继续") > -1 && txt.indexOf("滑动") == -1)) {
                        let sec_tmp = txt.replace(/[^\d.]/g, "") * 1;
                        if (sec_tmp > 10 && sec_tmp < 200) {
                            sec = sec_tmp;
                            hasResumeKeyword = true;
                            break;
                        } else if (txt.indexOf("观看") > -1 || txt.indexOf("点击后") > -1) {
                            sec = 15;
                            hasResumeKeyword = true;
                            break;
                        }
                    }
                }
                
                // 如果发生滑动重置，直接跳出 btn.parent() 检测循环
                if (has_slide_reset) {
                    break;
                }
                
                // 检查是否需要强制跳出检测循环
                if (typeof force_break_resume_loop !== 'undefined' && force_break_resume_loop) {
                    break;
                }
                
                // 如果是滑动任务触发了 break，这里 hasResumeKeyword 为 false，会跳过下方的 sleep 循环
                if (hasResumeKeyword) {
                    if (sec > 22) {
                        l_warn("续看时间异常(" + sec + ")，限制为 15 秒");
                        sec = 15;
                    }
                    sec += 2; 
                    l_log("续", sec);
                    
                    // 仅当之前不是滑动任务时，才尝试识别滑动提示
                    if (!isSlideTask) {
                        for (let i = 0; i < res_kw.length; i++) {
                            if (res_kw[i].text.indexOf("滑动") > -1) {
                                l_log("续看阶段检测到滑动任务提示");
                                isSlideTask = true;
                                break;
                            }
                        }
                    }

                    // 识别“续”的按钮：需要识别中下部区域 (Y > 1200)
                    let res_btn = cappad([0, 1200, device.width, device.height - 1200]);
                    let btnBlacklist = ["点击后", "任务中", "已成功", "获得奖励", "秒后", "看完"];
                    let clicked_resume = false;

                    for (let i = 0; i < res_btn.length; i++) {
                        let txt = res_btn[i].text;
                        if (strHasArr(txt, btnBlacklist)) continue;
                        if (txt.length > 8) continue;

                        if (strHasArr(txt, a1)) {
                            let b = res_btn[i].bounds;
                            l_log("续看阶段点击激活按钮：", txt);
                            click(parseInt((b.left + b.right) / 2), parseInt((b.top + b.bottom) / 2));
                            clicked_resume = true;
                            break;
                        }
                    }
                    
                    // 兜底：如果 OCR 没点到，且是"点击/玩"类型，点一下 1888-2050 的保底位置
                    if (!clicked_resume && isClickNewPage) {
                        l_log("续看阶段-保底位置点击...");
                        click(device.width / 2, 1960);
                    }

                    debugDelay = 3;
                    while (sec > 0) {
                        sleep(1000);
                        if (currentPackage().indexOf("permissioncontroller") == -1) {
                            if (sec % 5 == 0) click(random(10, 20), random(10, 20));
                        }
                        sec--;
                    }
                    l_verbose("应该看完");
                    debugDelay = 1;

                    // 如果是滑动任务，执行滑动操作以切换到下一个任务
                    if (isSlideTask) {
                        l_verbose("续看结束，执行滑动切换任务");
                        // 增加滑动强度和次数，确保触发
                        swipe(device.width * 0.85, device.height / 2, device.width * 0.15, device.height / 2, 400);
                        sleep(1000);
                        swipe(device.width * 0.85, device.height / 2, device.width * 0.15, device.height / 2, 400);
                        sleep(2000); // 滑动后多等一会儿，让 UI 刷新
                        isSlideTask = false; // 执行完后重置标记，防止死循环
                    }

                    if (isClickNewPage) {
                        l_verbose("续看结束，直接切换回起点");
                        launchQidian();
                        sleep(2000);
                        isClickNewPage = false; // 执行完后重置
                    }
                    n = 0;
                    continue; // 继续在当前的 do-while !btn.parent() 中检测是否出现真正的关闭按钮
                }

                // 检查拦截弹窗并处理
                res = cappad();
                let hasContinueBtn = false;
                for (let i = 0; i < res.length; i++) {
                    if (res[i].text.indexOf("继续观看") > -1 || res[i].text.indexOf("继续浏览") > -1 || res[i].text.indexOf("放弃福利") > -1) {
                        hasContinueBtn = true;
                        break;
                    }
                }
                if (hasContinueBtn) {
                    l_log("检测到拦截弹窗，任务未完成");
                    for (let i = 0; i < res.length; i++) {
                        if (res[i].text.indexOf("继续观看") > -1 || res[i].text.indexOf("继续浏览") > -1) {
                            let b = res[i].bounds;
                            click(parseInt((b.left + b.right) / 2), parseInt((b.top + b.bottom) / 2));
                            l_log("点击继续观看/浏览");
                            sleep(3000);
                            
                            // 重新检查是否包含滑动任务提示
                            let res_check = cappad([0, 0, device.width, 550]);
                            for (let j = 0; j < res_check.length; j++) {
                                if (res_check[j].text.indexOf("滑动") > -1) {
                                    isSlideTask = true;
                                    break;
                                }
                            }

                            if (isSlideTask) {
                                l_verbose("滑动切换下一段任务");
                                swipe(device.width * 0.8, device.height / 2, device.width * 0.2, device.height / 2, 500);
                                sleep(2000);
                                has_slide_reset = true;
                            }
                            n = 0; 
                            break;
                        }
                    }
                    if (has_slide_reset) break; // 如果有弹窗并在弹窗后进行了滑动，也跳出关闭按钮检测循环
                    continue; // 重新进入 do-while 循环
                }

                let t2 = 1000 - (new Date() - t1);
            } else {
                sleep(1000);
                if (className("android.widget.TextView").textContains("恭喜").exists()) break;
            }
        } while (!btn.parent());
        
        // 判断是否因为滑动任务重置而跳出了上面的 do-while (!btn.parent())
        if (has_slide_reset) {
            l_log("因滑动任务重置，重回主识别流程...");
            continue ad_main_loop; 
        }
        
        isClickNewPage = false; // 任务结束，重置标记

        if (!(xc == xr && yc == yt)) {
            yc -= t_click_step;
            if (yc < yt) {
                yc = closeButtonBottom + t_click_y_bottom;
                xc += t_click_step;
            }
            let tmp = new Object();
            tmp.x = xc;
            tmp.y = yc;
            t_click["" + xc + "," + yc] = tmp;
        }
    } else {
        // 旧广告，用旧方法
        if (className("android.widget.TextView").textContains("跳过").exists()) {
            let thread1 = threads.start(
                function t() {
                    sleep(1000);
                    if (!className("android.widget.TextView").textContains("跳过").exists()) {
                        thread1.interrupt();
                        m = 0;
                        l_log("“跳过”2字没了");
                    }
                }
            );
        }
        //获取退出坐标
        let video_quit = null;
        let x1 = 1, x2 = 1, y1 = 1, y2 = 1;
        let thread = threads.start(
            function coordinate() {
                sleep(3000);
                if (textContains("可获得奖励").exists() && !video_quit) {
                    video_quit = textContains("可获得奖励").findOne(500).bounds();
                    x1 = 0;
                    x2 = video_quit.left;
                    y1 = video_quit.top;
                    y2 = video_quit.bottom;
                    l_verbose("退出坐标", parseInt((x1 + x2) / 2), parseInt((y1 + y2) / 2));
                } else {
                    l_verbose("计算退出坐标失败，稍后重新获取");
                    return;
                }
            }
        );
        let m1 = 0;
        let video_flag = ""; //视频文字信息
        //判断视频是否播放到满足领取奖励条件
        let v = -1;
        do {
            if (textContains("获得奖励").exists()) {
                /* if (textContains("观看完视频").exists()) {
                     video_flag = "观看完视频,可获得奖励";
                 }
                 if (textContains("观看视频").exists()) {
                     video_flag = textContains("观看视频").findOne(500).text();
                 }*/
                video_flag = textContains("获得奖励").findOne(500).text();
                if (textContains("有声书").exists()) {
                    video_flag = textContains("有声书").findOne(500).text();
                }
                let v1 = video_flag.replace(/[^\d.]/g, "") * 1;
                if (v1 != v) {
                    l_verbose(video_flag);
                    if (v1 == 0) {
                        l_log('结束');
                        sleep(1200);
                        break;
                    } else {
                        v = v1;
                    }
                }
            } else if (video_flag.includes("观看完视频")) {
                l_log("看完结束");
                sleep(1100);
                break;
            } else {
                sleep(1000);
                m1++;
            }

            if (textContains("继续观看").exists()) {
                textContains("继续观看").click();
                sleep(1500);
            }
            if (textContains("继续听完").exists()) {
                textContains("继续听完").click();
                sleep(1500);
            }
            if (m1 > 20) {
                l_log("已看20秒");
                break;
            }
        } while (!(video_flag.includes("已") || m == 0));
        l_verbose("应该已获得奖励");
        thread.interrupt();

                // 退出视频
                let n = 0;
                do {
                    n++;
                    if (n == 1) {
                        click(parseInt((x1 + x2) / 2), parseInt((y1 + y2) / 2));
                    } else if (textContains("可获得奖励").exists()) {
                        l_log("退出失败，重新获取退出坐标");
                        if (textContains("跳过").exists()) {
                            textContains("跳过").findOne(500).click();
                        } else {
                            if (textContains("可获得奖励").exists()) {
                                video_quit = textContains("可获得奖励").findOne(500).bounds();
                            }
                            x1 = 0;
                            x2 = video_quit.left;
                            y1 = video_quit.top;
                            y2 = video_quit.bottom;
                            do {
                                let x = random(x1, x2);
                                let y = random(y1, y2);
                                l_verbose("区域随机点击", x, y);
                                click(x, y);
                                if (textContains("继续观看").exists()) {
                                    textContains("继续观看").click();
                                    sleep(1500);
                                }
                                if (textContains("继续听完").exists()) {
                                    textContains("继续听完").click();
                                    sleep(1500);
                                }
                            } while (textContains("可获得奖励").exists());
                        }
                    } else if (n < 5) {
                        l_verbose("执行直接切换回起点");
                        launchQidian();
                        sleep(2000);
                    } else {
                        l_error("未知原因退出失败");
                        throw new Error("退出失败");
                    }
                    sleep(1000);
                } while (!btn.parent());
        }
        // 旧广告结束退出 ad_main_loop
        break ad_main_loop;
    } 
    clickIknown();
    l_verbose("广告", adCount, "结束");
    sleep(1000);
}
function read_book(min) {
    let second = Math.floor(min * 60); // 确保是整数，使取模 % 逻辑生效
    let st = new Date().getTime();
    for (let i = 0; i < 2; i++) {
        // 确保进正文
        swipe(device.width * 3 / 4 + i, device.height / 2 + 105 + i, device.width / 4 + i, device.height / 2 + 100 + i, 500);
        sleep(900);
    }
    debugDelay = 30;
    let n = 0;
    do {
        if (text("跳转").exists() && text("取消").exists()) {
            let c = text("取消").findOne(500);
            if (c) {
                l_verbose(c.text());
                c.click(); // 不能点
                c.parent().click();
            }
        }
        let a = 1000;
        if (second % 60 == 0) {
            l_log("阅读倒计时：" + (second / 60) + "分钟");
        }
        
        // 每 8 秒进行一次活跃滑动，模拟福利中心的上下滚动效果
        if (second % 8 == 0 && second > 0) {
            l_log("执行活跃滑动 (上下滚动，剩余" + second + "s)");
            // 向上滑动浏览
            swipe(device.width / 2, device.height * 0.7, device.width / 2, device.height * 0.3, 600);
            sleep(300);
            // 向下滑动回位
            swipe(device.width / 2, device.height * 0.4, device.width / 2, device.height * 0.8, 600);
            sleep(300);
        } else {
            sleep(a);
        }
        second--;
    } while (second > -2);
    l_verbose("时间到");
    readTime += new Date().getTime() - st;
    debugDelay = 1;
    sleep(500);
    back();
    sleep(2000);
}
function game_play(min) {
    let second = min * 60;
    swipe(device.width - 50, device.height / 3, device.width - 55, device.height / 2, 900);
    let num = 0;
    do {
        num++;
        l_verbose("缓冲……");
        sleep(1000);
        if (num > 8) {
            l_error("没成功获取到游戏中心");
            return 1;
        }
    } while (wherePage() != "gamecenter" && wherePage() != "browser");
    if (wherePage() == "gamecenter") {
        l_info("成功打开游戏中心");
        sleep(1000);
        if (text("在线玩").find().length < 2) {
            l_warn("未识别到“在线玩”");
            return 1;
        }
        let play_btn = text("在线玩").findOnce(0);
        scrollShowButton(0, play_btn);
        play_btn.click();
        l_log("在线玩");
        sleep(2000);
    }
    if (wherePage() == "browser") l_info("应该直接打开游戏了");
    l_verbose(shortdash);
    sleep(1000);

    debugDelay = 30;
    let st = new Date().getTime();
    do {
        if (textContains("实名认证").exists()) {
            //身份信息仅用于实名认证使用
            l_warn("似乎有实名认证，请先自行认证");
            sleep(2000);
            back();
            return 2;
        }
        if (second % 60 == 0) {
            l_verbose("倒计时" + (second / 60) + "分钟");
        }
        if (second % 5 == 0) {
            click(random(10, 20), random(10, 20));
        }
        sleep(1000);
        second--;
    } while (second > -5);
    debugDelay = 1;
    gamePlayTime += new Date().getTime() - st;
    l_log("时间到");
    let n = 0;
    do {
        if (currentPackage() != qidianPackageName) {
            launchQidian();
            sleep(2000);
        } else {
            back();
            sleep(800);
        }
        n++;
    } while (wherePage() == "" && n < 10);
    return 0;
}
function showCon() {
    //l_verbose("显示控制台");
    console.show();
    cmdIsDisplay = true;
    setConPos(0);
}
function setConPos(n) {
    if (n * 1 !== n) n = 0;
    if (n > c_pos.length - 1) n = 0;
    console.setPosition(c_pos[n][0], c_pos[n][1]);
}
function cappad(region) {
    let cid = cmdIsDisplay;
    // 只有当识别区域可能被控制台遮挡时，才隐藏控制台
    // 默认控制台位置 c_pos[0] 在顶部，c_pos[1] 在底部
    let needHide = cid;
    if (region && cid) {
        // 如果识别区域在底部 (y > 2000)，而控制台在顶部 (closeButtonBottom 附近)，则无需隐藏
        if (region[1] > closeButtonBottom + 200) { 
            needHide = false; 
        }
    }

    if (needHide) {
        console.hide();
        cmdIsDisplay = false;
        sleep(50);
    }
    
    let capimg = captureScreen();
    let res;
    if (region) {
        // region: [x, y, width, height]
        // 确保不越界
        let rx = Math.max(0, region[0]), ry = Math.max(0, region[1]);
        let rw = Math.min(device.width - rx, region[2]), rh = Math.min(device.height - ry, region[3]);
        let clip = images.clip(capimg, rx, ry, rw, rh);
        res = paddle.ocr(clip);
        // 将坐标偏移还原回全屏坐标
        res.forEach(item => {
            item.bounds.left += rx;
            item.bounds.top += ry;
            item.bounds.right += rx;
            item.bounds.bottom += ry;
        });
        clip.recycle();
    } else {
        res = paddle.ocr(capimg);
    }
    
    if (needHide) showCon();
    return res;
}
function l_exit() {
    debugDelay = -1;
    threads.shutDownAll();
    l_warn("退出");
    exit();
}
function myFormatDate(dt) {
    let y = dt.getFullYear();
    let m = "0" + (dt.getMonth() + 1);
    if (m.length > 2) m = m.substring(m.length - 2);
    let d = "0" + dt.getDate();
    if (d.length > 2) d = d.substring(d.length - 2);
    return "".concat(y).concat(m).concat(d);
}
function myFormatTime(dt) {
    let h = "0" + dt.getHours();
    if (h.length > 2) h = h.substring(h.length - 2);
    let m1 = "0" + dt.getMinutes();
    if (m1.length > 2) m1 = m1.substring(m1.length - 2);
    let s = "0" + dt.getSeconds();
    if (s.length > 2) s = s.substring(s.length - 2);
    let m2 = "00" + dt.getMilliseconds();
    if (m2.length > 3) m2 = m2.substring(m2.length - 3);
    return "" + h + ":" + m1 + ":" + s + "." + m2;
}
function writeLog(...a) {
    let dt = new Date();
    files.append(
        logFilePath + "/" + myFormatDate(dt) + ".log",
        myFormatTime(dt) + " " + a.join(" ") + "\n"
    );
}
// arguments
function l_log(...s) {
    console.log.apply(console, s);
    if (logFile || debug) writeLog.apply(null, s);
}
function l_verbose(...s) {
    console.verbose.apply(console, s);
    if (logFile || debug) writeLog.apply(null, s);
}
function l_info(...s) {
    console.info.apply(console, s);
    if (logFile || debug) writeLog.apply(null, s);
}
function l_warn(...s) {
    console.warn.apply(console, s);
    if (logFile || debug) writeLog.apply(null, s);
}
function l_error(...s) {
    console.error.apply(console, s);
    if (logFile || debug) writeLog.apply(null, s);
}
function strHasArr(s, a) {
    for (let i = 0; i < a.length; i++) if (s.indexOf(a[i]) > -1) return true;
    return false;
}
function textButtonExist(str) {
    if (Array.isArray(str)) {
        for (let i = 0; i < str.length; i++) {
            if (text(str[i]).exists()) return true;
        }
    }
    if (typeof str === 'string') {
        if (text(str).exists()) return true;
    }
    return false;
}
function refreshView(v) {
    return v.parent().child(v.indexInParent());
}
function getLotteryReceive(v) {
    let top1 = v.bounds().top;
    let bottom1 = v.bounds().bottom;
    let c = v.child(0).children();
    for (let i = 0; i < c.length; i++) {
        if (c[i].className() == "android.widget.TextView") {
            if (c[i].bounds().top > top1 && c[i].bounds().bottom < bottom1) {
                return c[i].text();
            }
        }
    }
    return "";
}
function scrollShowButton(scrolled, btn) {
    let btn_top = 0;
    if (typeof btn === "number" && !isNaN(btn)) btn_top = btn;
    else btn_top = btn.bounds().top;
    //log(scrolled, btn_top);
    let h4 = device.height / 4;
    let scroll1 = btn_top - scrolled - device.height * 3 / 4;
    if (scroll1 > device.height / 8) {
        let scroll2 = scroll1;
        for (let i = 0; i < Math.floor(scroll1 / h4); i++) {
            swipe(device.width - 50, device.height * 7 / 8, device.width - 60, device.height * 7 / 8 - h4, 300);
            sleep(100);
            scroll2 -= h4;
        }
        swipe(device.width - 50, device.height * 7 / 8, device.width - 60, device.height * 7 / 8 - scroll2, 500);
        sleep(800);
        return scrolled + scroll1;
    }
    if (scrolled > 0 && btn_top - scrolled < 0) {
        scroll1 = scrolled - btn_top;
        let scroll2 = scroll1;
        for (let i = 0; i < Math.floor(scroll1 / h4); i++) {
            swipe(device.width - 50, device.height / 4, device.width - 60, device.height / 4 + h4, 300);
            sleep(100);
            scroll2 -= h4;
        }
        swipe(device.width - 50, device.height / 4, device.width - 60, device.height / 4 + scroll2, 500);
        sleep(800);
        return scrolled - scroll1;
    }
    return scrolled;
}
function getTextOfView(v, e, depth) {
    if (v.equals(e)) return "";
    // 增加递归深度限制，防止在极端复杂的 UI 树下导致栈溢出
    depth = depth || 0;
    if (depth > 15) return ""; 

    if (v.className() == "android.widget.TextView" && v.text() != "") {
        return v.text();
    }
    if (v.childCount() > 0) {
        let t = new Array();
        let v1 = v.children();
        for (let i = 0; i < v1.length; i++) {
            let t1 = getTextOfView(v1[i], e, depth + 1);
            if (t1 != "") t.push(t1);
        }
        return t.join("\n");
    }
    return "";
}
function robustClick(targetObj) {
    if (!targetObj) return false;
    let isClicked = false;
    if (targetObj.click()) {
        isClicked = true;
    } else if (targetObj.parent() && targetObj.parent().click()) {
        isClicked = true;
    } else if (targetObj.parent() && targetObj.parent().parent() && targetObj.parent().parent().click()) {
        isClicked = true;
    } else {
        // 坐标点击兜底
        let b = targetObj.bounds();
        if (b.width() > 0 && b.height() > 0) {
            click(b.centerX(), b.centerY());
            isClicked = true;
        }
    }
    return isClicked;
}

function getDescriptionOnLeft(b) {
    // 调试：输出当前按钮的位置信息
    // l_verbose("分析按钮位置: " + b.bounds());
    
    // 尝试在当前层级及向上三层寻找描述文本
    let curr = b;
    for (let depth = 0; depth < 4; depth++) { // 增加到4层
        if (!curr) break;
        let p = curr.parent();
        if (!p) break;
        
        let j = curr.indexInParent();
        let t = curr.bounds().top;
        let c = p.children();
        let r = new Array();
        
        for (let i = 0; i < c.length; i++) {
            if (!c[i]) continue;
            // 寻找水平方向上相近的文本（垂直差距在200像素以内）
            // 且必须在按钮的左侧（bounds.left < b.bounds.left）
            if (i != j && Math.abs(c[i].bounds().top - t) < 200) {
                let t1 = getTextOfView(c[i]);
                if (t1 != "") r.push(t1);
            }
        }
        
        if (r.length > 0) {
            let desc = r.join("\n");
            // l_verbose("层级 " + depth + " 找到描述: " + desc);
            return desc;
        }
        curr = p; // 向上找一层
    }
    
    // 如果还没找到，尝试全局寻找距离该按钮最近的 TextView
    // l_verbose("层级搜索失败，尝试坐标邻近搜索");
    return "";
}
function showReceived(r) {
    if (r.indexOf("章节卡") > -1 || r.indexOf("点币") > -1 || r.substring(r.length - 1) == "点") l_info(r);
    else l_log(r);
}
function addReceived(r) {
    r = r.replaceAll(" ", "");
    while (r.substring(0, 1) == "+") r = r.substring(1);
    if (r.indexOf("满") > -1 && r.indexOf("-") > -1) {
        let t = r.split("-");
        t[0] = t[0].replace(/[^\d.]/g, "");
        r = t.join("-");
    }
    if (r in ADReceive) ADReceive[r]++;
    else ADReceive[r] = 1;
}
function clickIknown() {
    let tmp = textContains("恭喜获得").findOne(500) || textContains("恭喜").findOne(200);
    if (tmp) {
        let t1 = tmp.text();
        showReceived(t1);
        let a = "恭喜获得";
        if (t1.substring(0, a.length) == a) addReceived(t1.substring(a.length));

        sleep(800);
        // 优先精确匹配"知道了"，再尝试其他常见按钮
        let iknow = text("知道了").findOne(800) || text("知道啦").findOne(200);
        if (!iknow) iknow = textContains("知道").findOne(500);
        if (!iknow) iknow = text("确认").findOne(200) || text("领取").findOne(200);
        if (iknow) {
            l_verbose("点击弹窗按钮: " + iknow.text());
            robustClick(iknow);
            return 1;
        } else {
            // 兜底：如果没找到按钮但有弹窗，尝试点一下屏幕中心
            l_verbose("未找到明确按钮，尝试点击屏幕中心关闭弹窗");
            click(device.width / 2, device.height / 2);
        }
        return 1;
    }
    return 0;
}
function sortFormatReceive() {
    function rmBracket(s) {
        if (s.substr(-1) == ")") s = s.substring(0, s.lastIndexOf("("));
        if (s.substr(-1) == "）") s = s.substring(0, s.lastIndexOf("（"));
        return s;
    }
    function indexFirstNotNum(str) {
        for (let i = 0; i < str.length; i++) {
            let n = str.substring(i, i + 1) * 1;
            if (isNaN(n)) return i;
        }
        return -1;
    }
    function indexLastNum(str) {
        for (let i = str.length - 1; i > 0; i--) {
            let n = str.substring(i - 1, i) * 1;
            if (!isNaN(n)) return i;
        }
        return -1;
    }
    function indexLastNotNum(str) {
        for (let i = str.length - 1; i > 0; i--) {
            let n = str.substring(i - 1, i) * 1;
            if (isNaN(n)) return i;
        }
        return -1;
    }
    let s = new Object();
    Object.keys(ADReceive).forEach(k => {
        let k1 = k;
        if (k1.indexOf("×") > -1) k1 = k1.replace("×", "");
        k1 = rmBracket(k1);
        let p = indexLastNum(k1);
        let p1 = indexLastNotNum(k1);
        let a1 = "";
        if (p1 > p) {
            //文字在数字后面 或没数字
            if (p < 0) a1 = k1;
            else a1 = "0" + k1.substring(p);
        } else {
            //文字在数字前
            a1 = "0" + k1.substring(0, p1);
        }
        if (!(a1 in s)) s[a1] = new Object();
        s[a1][k] = ADReceive[k];
    });
    let s1 = new Object();
    let ak = Object.keys(s).sort();
    for (let i = 0; i < ak.length; i++) {
        s1[ak[i]] = new Object();
    }
    Object.keys(s).forEach(k => {
        let t = Object.keys(s[k]).sort((a, b) => {
            a = rmBracket(a);
            b = rmBracket(b);
            let p1 = a.indexOf("-");
            let p2 = b.indexOf("-");
            if (p1 > -1) a = a.substring(p1 + 1);
            if (p2 > -1) b = b.substring(p2 + 1);
            let a1 = a.match(/(\d+)/g);
            let b1 = b.match(/(\d+)/g);
            return b1[0] * 1 - a1[0] * 1;
        });
        for (let i = 0; i < t.length; i++) {
            s1[k][t[i]] = s[k][t[i]];
        }
    });
    let a = new Array();
    Object.keys(s1).forEach(k => {
        Object.keys(s1[k]).forEach(n => {
            a.push((" " + ADReceive[n] + " × ").concat(n).concat("\n"));
        });
    });
    return a;
}
function formatTime(t) {
    let s = Math.floor(t / 1000);
    if (s < 60) return "".concat(s) + "秒";
    let m = Math.floor(s / 60);
    s = s % 60;
    if (m < 60) return "".concat(m) + "分" + s + "秒";
    let h = Math.floor(m / 60);
    m = m % 60;
    return "".concat(h) + "时" + m + "分" + s + "秒";
}
function reviewResults() {
    let r = new Array();
    r.push("当前账号：");
    r.push(nickname.concat("\n"));
    r.push("本次总用时" + formatTime(new Date().getTime() - startTime) + "\n");
    if (exchangeCount > 0) {
        r.push("兑换");
        r.push(exchangeCount);
        r.push("次\n");
    }
    if (adCount > 0) {
        r.push("看");
        r.push(adCount);
        r.push("个广告\n");
    }
    if (lotteryCount > 0) {
        r.push("抽奖");
        r.push(lotteryCount);
        r.push("次\n");
    }
    if (readTime > 0) {
        r.push("阅读 " + formatTime(readTime) + "\n");
    }
    if (gamePlayTime > 0) {
        r.push("玩游戏 " + formatTime(gamePlayTime) + "\n");
    }
    if (Object.keys(ADReceive).length > 0) {
        r.push("获得：\n");
        r = r.concat(sortFormatReceive());
    } else {
        r.push("未获得奖励");
    }
    return r;
}

// 正式开始------------------------------------------------------------------
var debugDelay = 1;
var debugLoop = null;
var outPackageStartTime = 0; // 记录离开起点的时间

if (debug || true) { // 默认开启包名检测逻辑
    debugLoop = threads.start(
        function t() {
            let n = 0, a = 1000, b = 0;
            while (debugDelay > 0) {
                b = 0;
                n++;
                
                let p = currentPackage();
                // 包名检测逻辑：在起点 APP 外停留超过 20 秒自动返回
                // 增加权限管理相关的包名白名单，防止在跳转确认阶段被误杀
                if (p != qidianPackageName && p != autojsPackage && p != "android" && p != "com.android.settings" && p.indexOf("permissioncontroller") == -1) {
                    // 如果是"点击/玩"类型广告正在等待倒计时，跳过自动返回，避免任务中断
                    if (isClickNewPage && adCount > 0) {
                        outPackageStartTime = 0; 
                    } else if (outPackageStartTime == 0) {
                        outPackageStartTime = new Date().getTime();
                    } else {
                        let outTime = (new Date().getTime() - outPackageStartTime) / 1000;
                        if (outTime > 25) {
                            l_warn("在起点外停留超过25秒(" + Math.floor(outTime) + "s)，正在尝试返回...");
                            launchQidian();
                            outPackageStartTime = 0; // 重置
                        }
                    }
                } else {
                    outPackageStartTime = 0; // 回到起点或安全应用，重置时间
                }

                if (n >= debugDelay) {
                    let st = new Date().getTime();
                    if (debug) writeLog(p, getAppName(p), currentActivity(), wherePage());
                    n = 0;
                    b = new Date().getTime() - st;
                }
                if (b < a) sleep(a - b);
            }
        }
    );
}


// 打开起点
openQidian();
l_log(longdash);
sleep(500);

// 进入福利中心
enterFreeCenter();
l_log(longdash);
sleep(1000);

try {
    // 签到里面的兑换
    if (new Date().getDay() == 0) {
        l_log("开始兑换");
        if (exchange() == 0) l_log("无兑换");
        l_log(longdash);
        sleep(2000);
    }

    // 当日阅读5分钟（含去阅读任务）
    l_log("检查阅读类任务");
    let target1 = ["去阅读", "去完成"]; // 识别“去阅读”以及跳转类的“去完成”
    let expstr1 = ["限时", "当日阅读", "再读"]; // 阅读任务识别关键字（"再读"兼容"限时加点"和"广告加点"）
    
    let foundReadTask = false;
    for (let i = 0; i < target1.length; i++) {
        let target = target1[i];
        if (!text(target).exists()) continue;
        let aa = text(target).find();
        for (let ii = aa.length - 1; ii > -1; ii--) {
            let s = getDescriptionOnLeft(aa[ii]);
            // 阅读任务特征：包含"限时"或"再读"（兼容"限时加点"和"广告加点"两种命名）
            if (s.indexOf("限时") > -1 || s.indexOf("再读") > -1 && strHasArr(s, expstr1)) {
                freeCenterScrolled = scrollShowButton(freeCenterScrolled, aa[ii]);
                aa[ii] = refreshView(aa[ii]);
                do {
                    s = getDescriptionOnLeft(aa[ii]);
                    l_log(s);
                    let s1 = s.split("\n");
                    let num = 0;
                    for (let j = 0; j < s1.length; j++) if (s1[j].indexOf("再读") > -1) num = s1[j].replace(/[^\d.]/g, "") * 1;
                    robustClick(aa[ii]);
                    sleep(2000);

                    // 识别是否跳转到了主页/书架
                    let wp = wherePage();
                    if (wp == "index") {
                        l_info("跳转到了主页/书架，识别书籍《" + targetBookName + "》");
                        let book = text(targetBookName).findOne(2000);
                        if (book) {
                            l_log("找到《" + targetBookName + "》，开始阅读 80 秒");
                            if (book.parent() && book.parent().clickable()) {
                                book.parent().click();
                            } else {
                                click(book.bounds().centerX(), book.bounds().centerY());
                            }
                            sleep(1000);
                            read_book(1.34); // 80秒 ≈ 1.34分钟
                            l_info("阅读完成，正在返回福利中心...");
                            enterMe();
                            enterFreeCenter();
                            sleep(1000);

                            foundReadTask = true;
                            break; 
                        } else {
                            l_warn("未在主页找到《" + targetBookName + "》");
                            enterMe();
                            enterFreeCenter();
                            sleep(1000);
                            foundReadTask = true;
                            break;
                        }
                    }

                    let b = text(target).find();
                    for (let j = 0; j < b.length; j++) {
                        if (b[j].parent().clickable() && !b[j].clickable()) {
                            l_verbose(getTextOfView(b[j].parent(), b[j]));
                            b[j].parent().click();
                            sleep(1000);
                            read_book(num);
                            while (!aa[ii].parent()) {
                                l_verbose("还未返回");
                                if (text("加入书架").exists() && text("取消").exists()) {
                                    let c = text("取消").findOne(500);
                                    if (c) {
                                        l_verbose(c.text());
                                        c.click();
                                        c.parent().click();
                                    }
                                } else {
                                    l_verbose("但无 加入 弹窗");
                                    back();
                                }
                                sleep(2000);
                            }
                            break;
                        }
                    }
                    l_verbose(shortdash);
                    sleep(3000);
                } while (refreshView(aa[ii]).text() == aa[ii].text());
                foundReadTask = true;
                break;
            }
        }
        if (foundReadTask) break;
    }
    l_info("结束阅读类任务检查");
    freeCenterScrolled = scrollShowButton(freeCenterScrolled, 0);
    l_log(longdash);
    sleep(500);

    // 开始看广告
    let targetBtn = ["看视频", "去完成"]; // 目标按钮字符
    let bonusBtnTexts = ["领奖励", "领积分"]; // 可领按钮，与广告同屏处理
    let scrollCount = 0;
    let gameTaskDone = false; // 广告滚动时检测并执行游戏任务
    while (true) {
        // 先检查当前屏幕有无可领奖励，避免后面再单独滚动查找
        for (let bj = 0; bj < bonusBtnTexts.length; bj++) {
            let btnt = bonusBtnTexts[bj];
            if (text(btnt).exists()) {
                let btn = text(btnt).find();
                for (let bi = 0; bi < btn.length; bi++) {
                    l_verbose(shortdash);
                    freeCenterScrolled = scrollShowButton(freeCenterScrolled, btn[bi]);
                    let btn_now = refreshView(btn[bi]);
                    l_verbose(getDescriptionOnLeft(btn_now));
                    robustClick(btn_now);
                    scrollCount = 0; // 领到奖励，重置滚动计数
                    let c1 = 0;
                    for (let ii = 0; ii < 5; ii++) {
                        sleep(200);
                        c1 = clickIknown();
                        if (c1) break;
                    }
                    if (!c1) {
                        btn_now = refreshView(btn[bi]);
                        if (btn_now && btn_now.text() == btnt) {
                            l_verbose("领取按钮仍在，可能失败");
                        }
                    }
                    break; // 领完一个重新扫描，防止UI变化
                }
            }
        }

        let foundOnThisScreen = false;
        let anyValidOnScreen = false;

        for (let i = 0; i < targetBtn.length; i++) {
            let target = targetBtn[i];
            if (!text(target).exists()) continue;
            let aa = text(target).find();
            for (let ii = aa.length - 1; ii > -1; ii--) {
                let s = getDescriptionOnLeft(aa[ii]);
                if (s == "") {
                    // 如果描述为空，尝试直接检查父容器中是否包含“广告”等字样
                    let p = aa[ii].parent();
                    if (p) s = getTextOfView(p);
                }
                
                let c = 0;
                if (s.indexOf("广告") > -1 || s.indexOf("限时") > -1 || s.indexOf("加点") > -1) c = 1;
                if (s.indexOf("市场") > -1) c = 2;
                if (c == 0) continue;

                anyValidOnScreen = true;
                freeCenterScrolled = scrollShowButton(freeCenterScrolled, aa[ii]);

                // 使用强化点击逻辑
                let isClicked = robustClick(aa[ii]);
                
                // 只有点击成功后才执行验证码等待
                if (isClicked && target == "去完成" && isFirstGoComplete) {
                    l_log("点击成功，开始强制等待 10 秒供处理验证码...");
                    device.vibrate(500); // 震动提醒
                    for (let t = 10; t > 0; t--) {
                        l_verbose("等待中... " + t);
                        sleep(1000);
                    }
                    l_info("等待结束，继续任务");
                    isFirstGoComplete = false; // 标记已处理过
                }

                if (target == "去完成") {
                    sleep(2000); 
                } else {
                    sleep(500);
                }
                if (c == 1) video_look(aa[ii]);
                if (c == 2) jumpMarket(aa[ii]);
                foundOnThisScreen = true;
                scrollCount = 0; // 找到了，重置滚动
                break; 
            }
            if (foundOnThisScreen) break;
        }

        if (foundOnThisScreen) continue; 

        if (scrollCount < 3) {
            l_verbose("当前屏幕未发现新广告，尝试向下滑动寻找...");
            swipe(device.width / 2, device.height * 0.8, device.width / 2, device.height * 0.3, 500);
            freeCenterScrolled += (device.height * 0.5);
            scrollCount++;
            // 滚动后检测并执行游戏任务
            if (enableGameTask && !gameTaskDone) {
                if (textContains("再玩").exists() || textContains("玩游戏").exists()) {
                    l_log("检测到游戏任务，直接执行");
                    gameTaskDone = true;
                    runGameTask();
                }
            }
            sleep(700);
        } else {
            break;
        }
    }
    if (adCount > 0) {
        l_verbose(shortdash);
        l_info("结束看广告");
    } else {
        l_log("无广告");
    }
    freeCenterScrolled = scrollShowButton(freeCenterScrolled, 0);
    l_log(longdash);
    sleep(500);

    // 签到里面的抽奖
    if (enableLottery) {
        l_log("开始抽奖");
        if (lottery() == 0) l_log("无抽奖");
    } else {
        l_log("抽奖已关闭");
    }
    l_log(longdash);

    // 玩游戏（若已在广告滚动时执行则跳过）
    if (enableGameTask && !gameTaskDone) {
        // 广告结束后页面已滚回顶部，先尝试找到"再玩"
        let playLabel = textContains("再玩").findOne(500);
        if (!playLabel) {
            l_verbose("'再玩'不可见，向下查找");
            swipe(device.width / 2, device.height * 0.8, device.width / 2, device.height * 0.3, 500);
            freeCenterScrolled += (device.height * 0.5);
            sleep(1000);
            playLabel = textContains("再玩").findOne(500);
        }
        if (playLabel) {
            l_log("开始玩游戏");
            runGameTask();
        } else {
            l_log("未找到游戏任务");
        }
    }

    // 领游戏与看书时长的
    // 确保在福利中心主页，而非签到详情页
    if (wherePage() == "signdetail") {
        l_verbose("当前在签到详情页，返回福利中心");
        back();
        sleep(1000);
    }
    l_log("有无可领");
    let bonusButtonTexts = ["领奖励", "领积分"];
    let bonusNum = 0;
    // 广告滚动已覆盖过页面，这里只需检查当前屏幕（阅读/游戏后新出现的奖励）
    for (let j = 0; j < bonusButtonTexts.length; j++) {
        let btnt = bonusButtonTexts[j];
        if (!text(btnt).exists()) continue;
        let btn = text(btnt).find();
        for (let i = 0; i < btn.length; i++) {
            l_verbose(shortdash);
            freeCenterScrolled = scrollShowButton(freeCenterScrolled, btn[i]);
            let btn_now = refreshView(btn[i]);
            l_verbose(getDescriptionOnLeft(btn_now));
            robustClick(btn_now);
            bonusNum++;
            let c1 = 0;
            for (let ii = 0; ii < 5; ii++) {
                sleep(200);
                c1 = clickIknown();
                if (c1) break;
            }
            if (!c1) {
                btn_now = refreshView(btn[i]);
                if (btn_now && btn_now.text() == btnt) {
                    l_error("似乎领取失败");
                } else {
                    let d1 = getDescriptionOnLeft(btn_now).split("\n");
                    d1.shift();
                    l_verbose(d1.join("\n"));
                }
            }
        }
    }
    if (bonusNum == 0) l_log("无");
    l_log(longdash);
    sleep(1000);

    l_log.apply(null, reviewResults());
    home();
    l_info("脚本正常结束");
    l_verbose("控制台3秒后自动关闭");
    l_log("记得清理Autox.js后台");
    sleep(1000);
    console.hide();
} catch (err) {
    l_error(err.message);
    l_warn(err.stack);
    l_log.apply(null, reviewResults());
    l_error("脚本异常");
} finally {
    if (Object.keys(t_click).length > 0) storage.put(closeCoord_name, JSON.stringify(t_click));
    engines.stopAllAndToast();
    l_exit();
}
