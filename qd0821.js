    var title = "260720起点自动";
    var logFile = false; // 是否将日志保存到文件中

    // --- 用户配置项 ---
    var targetBookName = "盖世双谐"; // 去阅读任务需要搜索的书名
    var enableGameTask = false;      // 是否执行玩游戏任务（true: 开启, false: 关闭）
    var enableLottery = false;       // 是否执行转盘抽奖（true: 开启, false: 关闭）
    var enableAdBufferWait = false;  // 是否开启无障碍缓冲等待（true: 开启5秒无障碍等待, false: 默认关闭，直接走OCR识别）
    // -----------------

    var closeButtonBottom = 550; // 新广告右上角的X的下沿高度，控制台也放这么高
    // X按钮固定坐标（一加Ace 5）
    var fixedCloseXPos = { x: 1182, y: 280 };
    var t_click_step = 30;      // 循环扫描点击时，每步移这么远再点下一次
    var t_click_x_left = 110;   // 循环扫描点击区域的左边框，到屏幕右边的距离（device.width-110≈1110）
    var t_click_x_right = 90;   // 循环扫描点击区域的右边框，到屏幕右边的距离（device.width-90≈1130）
    var t_click_y_top = 330;     // 循环扫描点击区域的上边框，在closeButtonBottom上方这么多（550-330=220）
    var t_click_y_bottom = 0;  // 循环扫描点击区域的下边框，在closeButtonBottom下方这么多（550+0=550）

    var startTime = new Date().getTime();
    var t_click = new Object(); // 用于存储扫描点击成功的坐标
    // 默认直接加入固定坐标 (1182, 280)，优先点击
    t_click["1182,280"] = fixedCloseXPos;
    var debug = false; // 开启debug循环
    var c_pos = [[0, closeButtonBottom], [device.width / 2, device.height - 500]]; // 控制台位置切换
    var qidianPackageName = "com.qidian.QDReader";
    var autojsPackage = currentPackage();
    var longdash = "————————————";
    var shortdash = "——————";
    var freeCenterScrolled = 0;
    var adCount = 0, lotteryCount = 0, exchangeCount = 0, readTime = 0, gamePlayTime = 0;
    var ADReceive = new Object();
    var ad_raw = -1, ad_clicknewpage = -1; // 广告识别结果（供调用方判断是否识别成功）
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

    function isIgnoredOrFloatingApp(pkg) {
        if (!pkg) return false;
        if (pkg == qidianPackageName || pkg == autojsPackage || pkg == "android" || pkg == "com.android.settings") return true;
        if (pkg.indexOf("permission") > -1 || pkg.indexOf("packageinstaller") > -1) return true;
        let appName = "";
        try { appName = getAppName(pkg) || ""; } catch (e) {}
        let floatingKeywords = ["李跳跳", "游戏助手", "悬浮", "输入法", "SystemUI", "systemui", "Gboard", "录屏", "助手", "弹窗"];
        for (let i = 0; i < floatingKeywords.length; i++) {
            if (appName.indexOf(floatingKeywords[i]) > -1 || pkg.indexOf(floatingKeywords[i]) > -1) return true;
        }
        return false;
    }

    function wherePage() {
        let cp = currentPackage();
        let ca = currentActivity();
        
        // 权限管理弹窗快速识别
        if (cp.indexOf("permission") > -1 || cp.indexOf("packageinstaller") > -1) {
            return "permission";
        }

        // 优先判断是否跳出起点 App：若已在前台其他应用（如微信、淘宝、浏览器等），绝不误判为起点界面
        if (cp != qidianPackageName && !isIgnoredOrFloatingApp(cp)) {
            return "isNotQidain";
        }

        // 广告 Activity 识别（最快）
        if (ca.indexOf("RewardvideoPortraitADActivity") > -1 || ca.indexOf("RewardVideoActivity") > -1 || ca.indexOf("AdActivity") > -1) {
            return "adframe";
        }

        // 福利中心（秒级极速识别：只要在Browser页面且有福利中心标题或规则或限时加点，即为福利中心）
        if (ca.indexOf("QDBrowserActivity") > -1 || ca.indexOf("Browser") > -1 || ca.indexOf("Web") > -1) {
            if (text("福利中心").exists() || text("规则").exists() || textContains("限时加点").exists() || textContains("加点").exists()) {
                return "freecenter";
            }
        }
        if (text("福利中心").exists() || (text("规则").exists() && textContains("任务").exists())) {
            return "freecenter";
        }
        if (textContains("完成任务得奖励").exists() || textContains("限时加点").exists()) {
            return "freecenter";
        }

        // 网页/内嵌广告特征（在起点内部打开了商品落地页、H5网页、内置浏览器）
        if (ca.indexOf("Web") > -1 || ca.indexOf("Browser") > -1 || ca.indexOf("H5") > -1 || ca.indexOf("LandPage") > -1 || ca.indexOf("AdLandingPage") > -1) {
            return "internal_web";
        }

        // 广告页面特征合并判断（减少多轮重复 exists 遍历）
        if (text("跳过").exists() || textContains("观看视频").exists() || textContains("后看广告").exists() || textContains("秒后获取奖励").exists() || textContains("点击后看").exists() || (textContains("秒").exists() && textContains("奖励").exists()) || (textContains("点击后").exists() && textContains("任务").exists()) || textContains("恭喜你已获得奖励").exists()) {
            return "adframe";
        }

        // 首页
        if (text("书架").exists() && text("精选").exists()) {
            return "index";
        }

        // 阅读页面
        if (ca.indexOf("QDReader") > -1 || ca.indexOf("chapter") > -1 || ca.indexOf("ReadActivity") > -1) {
            return "read";
        }

        // 签到详情
        if (text("签到详情").exists() || text("连签有礼").exists()) {
            return "signdetail";
        }

        // 游戏中心
        if (text("阅游戏").exists() && text("在线玩").exists()) {
            return "gamecenter";
        }

        // 浏览器容器
        if (id("browser_container").exists()) {
            return "browser";
        }

        return "";
    }
    function launchQidian(force) {
        let p = currentPackage();
        if (!force && p == qidianPackageName) {
            let wp = wherePage();
            if (wp == "adframe" || wp == "freecenter" || wp == "index" || wp == "signdetail") {
                return;
            }
        }

        // 离开起点且不是悬浮窗辅助软件时，退回桌面重新拉起
        let isExternal = (p != qidianPackageName && !isIgnoredOrFloatingApp(p));
        if (isExternal) {
            let name = "";
            try { name = getAppName(p) || p; } catch (e) { name = p; }
            l_info("正在从外部应用 [" + name + "] 切回起点...");
            home();
            sleep(500);
        }
        app.launchPackage(qidianPackageName);
        
        // 如果是从外部应用强切回起点，等待确认起点已到前台
        let waitCount = 0;
        while (waitCount < 6) {
            sleep(500);
            let cur = currentPackage();
            if (cur == qidianPackageName) {
                break;
            }
            waitCount++;
            if (waitCount == 3) {
                // 1.5秒仍未切换成功，再次拉起
                app.launchPackage(qidianPackageName);
            }
        }
        sleep(500);
    }
    function openQidian() {
        // 如果已在福利中心/签到页，直接跳过启动逻辑
        let wp_init = wherePage();
        if (wp_init == "freecenter" || wp_init == "signdetail") {
            l_info("当前已在已知页面：" + wp_init);
            l_info("起点已就绪");
            return true;
        }

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
            } else if (wp == "permission") {
                l_verbose("检测到权限弹窗，尝试返回");
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
        } while (wp == "" || wp == "isNotQidain" || wp == "permission");
        
        // 如果已经在福利中心相关页面，跳过等待和后续逻辑
        if (wp == "freecenter" || wp == "signdetail") {
            l_info("起点已就绪");
            return true;
        }

        sleep(600);

        if (!enterMe()) {
            l_error("无法进入‘我’界面，请手动复原到首页");
            l_warn(wherePage(), currentPackage(), currentActivity());
            l_exit();
        }
        l_info("起点已就绪");
        return false;
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
        // 快速检测“福利中心”按钮是否出现（每 200ms 检查一次，最多等 6 秒，出现立即进入下一步）
        let waited = 0;
        while (!text("福利中心").exists() && waited < 30) {
            sleep(200);
            waited++;
            if (waited % 5 == 0) closeDialogs();
        }
        if (!text("福利中心").exists()) return false;

        if (id("tvName").exists() || id("userInfo").exists()) {
            let tv = id("tvName").findOne(300);
            nickname = tv ? tv.text() : "";
            l_log("当前账号：", nickname);
            return true;
        }
        l_warn("未找到昵称，可能版本不一样");
        l_warn(wherePage(), currentPackage(), currentActivity());
        return true; // 即使昵称未抓到，但已在“我”界面且找到了福利中心，允许继续
    }
    function enterFreeCenter() {
        if (wherePage() == "freecenter") {
            l_info("已进入福利中心");
            return;
        }
        let n = 0;
        do {
            click("福利中心", 0);
            let m = 0;
            while (m < 10 && wherePage() != "freecenter") {
                sleep(200);
                m++;
            }
            if (wherePage() == "freecenter") break;
            n++;
        } while (n < 4 && wherePage() != "freecenter");
        if (wherePage() != "freecenter") {
            l_warn("超时未识别到福利中心，跳过等待，继续下个步骤");
            l_warn("当前页面：", wherePage(), currentPackage(), currentActivity());
        } else {
            l_info("已进入福利中心");
        }
    }
    function returnToFreeCenterFromReading() {
        l_info("阅读完成，正在返回福利中心...");
        // 1. 关闭阅读可能留下的退出弹窗（如加入书架、签到提醒等）
        closeDialogs();
        if (text("加入书架").exists() && text("取消").exists()) {
            let c = text("取消").findOne(500);
            if (c) { c.click(); sleep(500); }
        }

        // 2. 优先通过返回键快速回退福利中心（福利中心原本就在栈底）
        let backCount = 0;
        while (wherePage() != "freecenter" && backCount < 4) {
            closeDialogs();
            if (text("加入书架").exists() && text("取消").exists()) {
                let c = text("取消").findOne(500);
                if (c) { c.click(); sleep(500); }
            }
            back();
            sleep(600);
            if (wherePage() == "freecenter") {
                l_info("已快速退回福利中心");
                return true;
            }
            backCount++;
        }

        // 3. 若返回键未能回到福利中心（例如栈被清空），才走导航重新进入
        if (wherePage() != "freecenter") {
            l_info("返回键未命中，通过主导航重进福利中心...");
            enterMe();
            enterFreeCenter();
        }
        return wherePage() == "freecenter";
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
        if (e && e.parent() && e.parent().clickable()) {
            freeCenterScrolled = scrollShowButton(freeCenterScrolled, e);
            e.parent().click();
            l_verbose("点进签到日历");
            sleep(1000);
            scrollShowButton(device.height, 0); // 进入后它会自动向下滚，滚回
            sleep(500);
        } else {
            l_error("没找到链接，无法进入签到日历");
        }
        let d = className("android.widget.Button").text("去兑换 今日").findOne(1000);
        if (d) {
            // 今日是周日兑换
            l_verbose(shortdash);
            l_log(d.text());
            d.click();
            sleep(1200);
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
                    } while (refreshView(btns[bigIndex]) && refreshView(btns[bigIndex]).text() == btns[bigIndex].text() && n1 < 5);
                    if (!refreshView(btns[bigIndex]) || refreshView(btns[bigIndex]).text() != btns[bigIndex].text()) {
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

        // 兑换成功后可能弹出“兑换成功/恭喜获得”弹窗，先处理弹窗
        clickIknown();

        // 页面层级恢复：从“兑换中心”或“签到日历”稳妥返回到福利中心
        // 第一层：如果是点进“去兑换 今日”打开了新弹窗/页面，先退出兑换子页
        l_verbose("退出兑换页面，返回签到日历...");
        back();
        sleep(1000);
        clickIknown();

        // 第二层：如果当前仍在签到日历或非福利中心页面，继续退回福利中心
        let backCount = 0;
        while (wherePage() != "freecenter" && backCount < 4) {
            l_verbose("当前未在福利中心，执行返回 (" + (backCount + 1) + "/4)...");
            back();
            sleep(1000);
            clickIknown();
            backCount++;
        }

        if (wherePage() != "freecenter") {
            l_warn("返回福利中心失败，尝试重新进入福利中心");
            enterFreeCenter();
        }

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
                    let refV = refreshView(v);
                    while (v != null && refV != null && v.text() == refV.text()) {
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

        try {
            // 引入外层大循环：用于处理滑动任务后的状态重置
            // 当发生滑动任务需要重新识别时，通过 continue ad_main_loop; 跳回这里
            ad_main_loop: while (true) {
            ad_raw = -1; ad_clicknewpage = -1; // 每次循环重置
            let m = 0;
            has_slide_reset = false; // 每次进入主循环重置标记
            let a1 = ["查看", "详情", "立即", "继续", "下载", "了解", "更多", "领取", "去", "秒杀"];
            let btnBlacklist = ["点击后", "任务中", "已成功", "获得奖励", "秒后", "看完", "抽奖机会"];
            let failedCoords = []; // 记录本广告内已点击但未跳转的无效死坐标（防止死磕同一个点）

            function clickAdButton(isResume, onlyExactMatch) {
                let stageTag = isResume ? "续看阶段" : "初次识别";
                let clicked = false;
                let lastTappedPoint = null;
                l_verbose(stageTag + "开始识别并点击激活按钮...");

                // 辅助函数：判断坐标是否落在历史失败死穴附近（80像素内）
                let isDeadCoord = function(x, y) {
                    for (let i = 0; i < failedCoords.length; i++) {
                        if (Math.hypot(x - failedCoords[i].x, y - failedCoords[i].y) < 80) return true;
                    }
                    return false;
                };
                
                // 1. 区域限制：底部浮层卡片通常在屏幕 62% 以下，优先扫描底部区间，彻底避开上方活动规则背景
                let startY = parseInt(device.height * 0.62);
                let res_new = cappad([0, startY, device.width, device.height - startY]);
                
                // 如果未扫到文字，再向下稍微扩大到 50%
                if (!res_new || res_new.length == 0) {
                    l_verbose("首次OCR未识别到文字，稍微扩大区域重试...");
                    sleep(400);
                    startY = parseInt(device.height * 0.50);
                    res_new = cappad([0, startY, device.width, device.height - startY]);
                }

                // ==================== 历史真实样本库（成功与错误对照记录） ====================
                // 【实测成功点击样本（正样本库）】
                // 1. "查看详情" @ (631, 2365)  -> 京东生鲜广告底部蓝色大胶囊按钮（注意：Y坐标在2300+，排除了2067处的标题文本）
                // 2. "去微信畅玩小游戏" @ (540, 2010) -> 微信小游戏全屏落地页底部的绿色大胶囊按钮
                // 3. "立即体验" @ (540, 2080)  -> 京东小游戏广告底部的蓝色长条按钮
                // 4. "去微信看看" @ (540, 2090)  -> 京东活动广告底部的蓝色长条按钮
                // 5. "去微信玩" / "立即玩" / "开始玩" / "免费领取" -> 常见跳转第三方微信小游戏/小程序主CTA
                let exactButtons = [
                    "去微信立即开玩", "去微信立即玩小游戏", "去微信畅玩小游戏", "去微信玩小游戏", "去微信玩", "去微信小游戏", "去微信体验", "去微信看看", "去微信", 
                    "查看详情", "立即体验", 
                    "立即试玩", "立即玩", "开始玩", "马上玩", "试玩小游戏", "畅玩小游戏", 
                    "在线玩", "立即下载", "立即获得", "去完成", "立即抢购", "立即查看", 
                    "免费领取", "立即领取", "立即打开", "去看看", "立即参与", "立即秒杀", 
                    "了解详情", "查看商品"
                ];

                // 【实测错误点击样本（负样本库 / 避坑历史记录）】
                // 1. "1.新下载APP的用户" -> 误因包含“下载”被识别，实为背景里的活动细则/规则说明
                // 2. "京东小游戏" / "京东生鲜" -> 实为卡片顶部的应用名称/商家标题，不是激活按钮
                // 3. "3亿玩家推荐游戏" -> 误因包含“游戏”被识别，实为中间带有数据噱头的宣传副标题
                // 4. "查看详情" @ Y=2067 / 2097 -> 京东生鲜卡片上方的副标题展示文字（不可点击），非底部大按钮
                // 5. "在玩10万人+" / "人气榜Top10" -> 实为应用展示的数据指标标签，非按钮
                // 6. "仅需¥19.9/箱" / "包邮!0.01限一单[机智][勾引]" -> 实为商品价格促销文案或带表情符号的广告语
                // 7. "帮宝适" @ (628, 1799) -> 实为商品品牌名称，距离底部真实按钮达560像素，不可作为按钮点击
                let historicalErrorSamples = [
                    "1.新下载APP的用户", "新下载APP的用户", "京东小游戏", "京东生鲜", 
                    "3亿玩家推荐游戏", "在玩10万人+", "人气榜Top10", "仅需¥19.9/箱", 
                    "包邮!0.01限一单[机智][勾引]", "新人评判标准", "活动仅限新人参加",
                    "帮宝适"
                ];

                // 辅助函数：强化版穿透点击（解决防作弊过滤、手势遮挡、坐标偏移）
                let robustTapCTA = function(tag, txt, posX, posY) {
                    l_log(stageTag + tag + "：", txt, "@ (" + posX + "," + posY + ")");
                    lastTappedPoint = { x: posX, y: posY };
                    
                    // 1. 无障碍节点原生点击尝试（穿透能力最强）
                    let accNode = null;
                    try {
                        let nodes = text(txt).find();
                        for (let i = 0; i < nodes.length; i++) {
                            if (nodes[i].bounds().top >= parseInt(device.height * 0.55)) {
                                accNode = nodes[i];
                                break;
                            }
                        }
                    } catch (e) {}

                    if (accNode) {
                        l_verbose("尝试无障碍节点原生触发...");
                        if (accNode.click() || (accNode.parent() && accNode.parent().click())) {
                            sleep(200);
                        }
                    }

                    // 2. 真实物理触摸模拟（持续按压120ms，绕过广告SDK防自动化脚本的0ms过滤）
                    // 优先点击屏幕水平绝对中心（device.width / 2），完全避开右下角摇摆的手势动画图层干扰
                    let centerX = parseInt(device.width / 2);
                    press(centerX, posY, 120);
                    sleep(80);

                    // 3. 如果识别到的坐标偏离中心，在原坐标处补按一次，形成双保险
                    if (Math.abs(posX - centerX) > 80) {
                        press(posX, posY, 100);
                    }
                };

                // 2. 文本有效性检测（过滤非按钮文字：与错误样本库比对、过滤数据指标、规则、标题、应用名、标点、序号等）
                let isInvalidBtn = function(txt, bounds) {
                    if (!txt) return true;
                    let clean = txt.replace(/\s+/g, "");

                    // 核心几何门槛：真正的底部/中间卡片CTA大胶囊按钮在屏幕 55% 以下
                    // （兼容一加Ace 5等居中浮层卡片大按钮约在 63% 处，同时彻底拦截 50% 以上的顶部商品图文、规则说明）
                    if (bounds && bounds.top < parseInt(device.height * 0.55)) {
                        return true;
                    }

                    // 与实测错误历史样本库精准比对拦截
                    for (let e = 0; e < historicalErrorSamples.length; e++) {
                        if (clean.indexOf(historicalErrorSamples[e]) > -1 || historicalErrorSamples[e].indexOf(clean) > -1) {
                            return true;
                        }
                    }

                    // 如果直接命中按钮白名单：只要位置在 68% 以下，立即通过
                    if (exactButtons.indexOf(clean) > -1) {
                        return false;
                    }

                    if (clean.length < 2 || clean.length > 12) return true; // 按钮通常2-12个字（适配“去微信立即玩小游戏”等较长按钮）
                    // 包含标点符号、数字编号或特定符号直接排除（按钮绝不包含这些，如 1.、3亿、¥19.9、[机智] 等）
                    if (/[\d\.\-\!\！\[\]\(\)\（\）\,\，\。\、\:\：\?\？\<\>\《\》\￥\¥\+\/]/.test(clean)) return true;
                    
                    // 严格排除应用名、规则、背景说明、数据指标、宣传语等黑名单
                    let blacklist = [
                        "点击后", "任务中", "已成功", "获得奖励", "可得奖励", "秒后", "看完", "抽奖机会", 
                        "详情页", "第三方应用", "第三方", "广告", "版权", "用户", "新人", "活动", "规则", 
                        "标准", "评判", "下载APP", "下载App", "京东", "淘宝", "拼多多",
                        "包邮", "谁懂", "限一单", "购买", "商品", "当场", "享受", "福利", "复购", "单人", 
                        "秒杀", "立减", "可获得",
                        // 排除宣传噱头与数据指标（针对“3亿玩家推荐游戏”、“在玩10万人+”、“人气榜Top10”等）
                        "亿", "万", "玩家", "推荐", "极品", "条目", "人气", "排行榜", "在玩", "榜", "箱", "斤"
                    ];
                    for (let i = 0; i < blacklist.length; i++) {
                        if (clean.indexOf(blacklist[i]) > -1) return true;
                    }

                    // 如果带有“小游戏”或“游戏”，必须带有动作前缀（如“去微信/试玩/畅玩/玩/在线”），否则视为应用名排除
                    if (clean.indexOf("游戏") > -1) {
                        let hasAction = false;
                        let actionWords = ["去微信", "试玩", "畅玩", "玩", "在线"];
                        for (let a = 0; a < actionWords.length; a++) {
                            if (clean.indexOf(actionWords[a]) > -1) {
                                hasAction = true;
                                break;
                            }
                        }
                        if (!hasAction) return true;
                    }

                    return false;
                };

                // 3. 优先级匹配
                // 策略1：精确匹配完整的典型CTA按钮文本
                // 注意：要求在屏幕 68% 以下，并选最靠下且非死坐标的真实大按钮
                let matchedBtn = null;
                for (let i = 0; i < res_new.length; i++) {
                    let clean = res_new[i].text.replace(/\s+/g, "");
                    let b = res_new[i].bounds;
                    if (exactButtons.indexOf(clean) > -1) {
                        if (b.top >= parseInt(device.height * 0.55) && !isDeadCoord(b.centerX(), b.centerY())) {
                            if (!matchedBtn || b.top > matchedBtn.bounds.top) {
                                matchedBtn = { text: clean, bounds: b };
                            }
                        }
                    }
                }
                if (matchedBtn) {
                    let b = matchedBtn.bounds;
                    robustTapCTA("策略1-精准匹配按钮（命中成功样本库）", matchedBtn.text, b.centerX(), b.centerY());
                    clicked = true;
                }

                // 策略2：前缀动词短语匹配（以“立即/去微信/去/开始/点击/免费”开头且通过严格过滤与负样本比对）
                if (!clicked && !onlyExactMatch) {
                    let prefixes = ["立即", "去微信", "去", "开始", "点击", "免费"];
                    let prefixBtn = null;
                    for (let i = 0; i < res_new.length; i++) {
                        let clean = res_new[i].text.replace(/\s+/g, "");
                        let b = res_new[i].bounds;
                        if (isInvalidBtn(clean, b)) continue;
                        if (isDeadCoord(b.centerX(), b.centerY())) continue;
                        
                        let hasPrefix = false;
                        for (let p = 0; p < prefixes.length; p++) {
                            if (clean.startsWith(prefixes[p])) {
                                hasPrefix = true;
                                break;
                            }
                        }
                        if (hasPrefix) {
                            if (b.top >= parseInt(device.height * 0.55)) {
                                if (!prefixBtn || b.top > prefixBtn.bounds.top) {
                                    prefixBtn = { text: clean, bounds: b };
                                }
                            }
                        }
                    }
                    if (prefixBtn) {
                        let b = prefixBtn.bounds;
                        robustTapCTA("策略2-前缀动词匹配", prefixBtn.text, b.centerX(), b.centerY());
                        clicked = true;
                    }
                }

                // 策略3：距离标准底部大按钮黄金位置最近的候选文本（严格限制距离 < 120px 且必须含动词动作，杜绝帮宝适等商品名）
                if (!clicked && !onlyExactMatch) {
                    let candidates = [];
                    let targetX = parseInt(device.width / 2);
                    let targetY = parseInt(device.height * 0.85); // 胶囊按钮黄金高度，一加ace5的位置就是这样（0.85更准，其他机型先不管）
                    let actionKeywords = ["查", "看", "点", "去", "领", "玩", "试", "抢", "开", "享", "下", "购", "参", "完"];

                    for (let i = 0; i < res_new.length; i++) {
                        let clean = res_new[i].text.replace(/\s+/g, "");
                        let b = res_new[i].bounds;
                        if (isInvalidBtn(clean, b)) continue;
                        if (isDeadCoord(b.centerX(), b.centerY())) continue;

                        // 距离门槛：垂直差距必须在 120 像素以内，严禁把几百像素外的品牌词当按钮
                        if (Math.abs(b.centerY() - targetY) > 120) continue;

                        // 词性门槛：必须包含动作意向词
                        let hasActionWord = false;
                        for (let k = 0; k < actionKeywords.length; k++) {
                            if (clean.indexOf(actionKeywords[k]) > -1) {
                                hasActionWord = true;
                                break;
                            }
                        }
                        if (!hasActionWord) continue;

                        let dist = Math.hypot(b.centerX() - targetX, b.centerY() - targetY);
                        candidates.push({ text: clean, bounds: b, dist: dist });
                    }

                    if (candidates.length > 0) {
                        candidates.sort((a, b) => a.dist - b.dist);
                        let best = candidates[0];
                        robustTapCTA("策略3-严格空间邻近动词匹配", best.text, best.bounds.centerX(), best.bounds.centerY());
                        clicked = true;
                    }
                }

                // 策略4：保底固定大按钮按压与多点动态偏移避让（若中心死穴则自动偏移）
                // 关键修正：初次识别阶段卡片尚未滑出（或处于落地页刚加载），不能盲目按压浮层黄金位；
                // 只有在续看阶段（挽留浮层已完全弹出）才允许跌入浮层黄金位置按压
                // 注意：一加Ace 5全屏弹窗卡片（如寻道大千微信小游戏）大按钮在 Y ≈ 0.635（约1778px），而底部常驻大按钮在 Y ≈ 0.85（约2380px）
                if (!clicked && !onlyExactMatch) {
                    if (isResume) {
                        let centerX = parseInt(device.width / 2);
                        // 优先检查屏幕偏中间（约0.635）是否有小游戏绿色大按钮，否则使用底部 0.85 处
                        let targetY = parseInt(device.height * 0.635); // 居中小游戏弹窗按钮位置（约1778）

                        // 多点动态偏移候选（居中卡片按钮 -> 底部常驻按钮 -> 偏左 -> 偏右）
                        let offsetCandidates = [
                            { x: centerX, y: targetY, desc: "居中卡片大按钮" },
                            { x: centerX, y: parseInt(device.height * 0.85), desc: "底部常驻大按钮" },
                            { x: centerX - 180, y: targetY, desc: "居中卡片左半部" },
                            { x: centerX + 180, y: targetY, desc: "居中卡片右半部" }
                        ];

                        let chosen = null;
                        for (let c = 0; c < offsetCandidates.length; c++) {
                            if (!isDeadCoord(offsetCandidates[c].x, offsetCandidates[c].y)) {
                                chosen = offsetCandidates[c];
                                break;
                            }
                        }
                        if (!chosen) chosen = offsetCandidates[0]; // 全试过则重试

                        l_log(stageTag + "策略4-保底固定大按钮位置按压 [" + chosen.desc + "] @ (" + chosen.x + "," + chosen.y + ")");
                        press(chosen.x, chosen.y, 150);
                        lastTappedPoint = { x: chosen.x, y: chosen.y };
                        clicked = true;
                    } else {
                        l_verbose("初次识别阶段暂未明确匹配到CTA按钮，不盲点浮层黄金位，交由倒计时等待");
                    }
                }

                if (clicked) {
                    l_verbose("等待 3.5 秒检测跳转状态...");
                    sleep(3500);

                    let wp_now = wherePage();
                    let curr_pkg = currentPackage();

                    if (curr_pkg == qidianPackageName && (wp_now == "adframe" || wp_now == "freecenter")) {
                        l_log("仍留在起点 App 内，此点击坐标可能无效，记录避坑");
                        if (lastTappedPoint) failedCoords.push(lastTappedPoint);
                    } else if (curr_pkg == qidianPackageName && wp_now == "internal_web") {
                        l_info("检测到已打开起点内嵌落地页/商详页，激活成功");
                    } else if (curr_pkg.indexOf("permission") > -1 || curr_pkg.indexOf("packageinstaller") > -1) {
                        l_log("检测到权限管理弹窗，继续等待广告倒计时结束");
                    } else {
                        l_info("检测到已成功跳转至第三方应用：", getAppName(curr_pkg));
                    }
                    // 跳转检测等待的时间从总倒计时中扣除
                    if (ad_clicknewpage > -1) ad_clicknewpage -= 3.5;
                }
                return clicked;
            }
            // 广告识别状态机：最多识别 7 轮（约 5-6 秒），彻底避免因页面残留“完成/任务”导致单次退出
            let maxOcrRounds = 7;
            for (let round = 0; round < maxOcrRounds; round++) {
                sleep(600);
                let wp = wherePage();
                
                // 全局验证码检测：任何一轮检测到验证码立即暂停供用户处理
                let hasCaptcha = false;
                let res_chap = cappad([0, 110, device.width, 740]); // 850-110=740
                for (let i = 0; i < res_chap.length; i++) {
                    if (res_chap[i].text.indexOf("验证") > -1 || res_chap[i].text.indexOf("依次点击") > -1 || res_chap[i].text.indexOf("安全") > -1) {
                        hasCaptcha = true;
                        break;
                    }
                }
                
                if (hasCaptcha) {
                    let c_count = 0;
                    while (hasCaptcha) {
                        c_count++;
                        l_log("检测到安全验证，请手动完成 (" + c_count + ")");
                        device.vibrate(500); // 震动提醒
                        sleep(2000);
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
                    round = 0;
                    continue;
                }

                // 若检测到已直接跳转到第三方应用（如微信 com.tencent.mm、小游戏、外部应用等），按跳转/试玩类任务处理
                let curPkg = currentPackage();
                if (curPkg != qidianPackageName && !isIgnoredOrFloatingApp(curPkg)) {
                    let externalName = "";
                    try { externalName = getAppName(curPkg) || curPkg; } catch (e) { externalName = curPkg; }
                    l_info("检测到已直接进入外部应用/小游戏：[" + externalName + "]，按试玩跳转类广告处理");
                    ad_clicknewpage = 15; // 微信小游戏/外部跳转任务试玩15秒
                    break;
                }

                // 若刚点击后还在福利中心，多等一会儿过渡进入广告
                if (wp == "freecenter" && round < 3) {
                    l_verbose("等待进入广告页面... (" + (round + 1) + ")");
                    sleep(600);
                    continue;
                }

                // 核心区域快速识别
                let res_fast = ocrTopRegion();
                for (let i = 0; i < res_fast.length; i++) {
                    let txt = res_fast[i].text;
                    let fast_match = txt.match(/(\d+(?:\.\d+)?)\s*秒/);
                    if (fast_match) {
                        let fast_sec = parseFloat(fast_match[1]);
                        if (fast_sec > 0 && fast_sec < 200) {
                            l_log("核心区识别到时长：", txt, fast_sec, "秒，等待2.5秒确认类型...");
                            sleep(2500);
                            let res_check = ocrTopRegion();
                            let sec_after = -1;
                            for (let k = 0; k < res_check.length; k++) {
                                let match2 = res_check[k].text.match(/(\d+(?:\.\d+)?)\s*秒/);
                                if (match2) {
                                    sec_after = parseFloat(match2[1]);
                                    break;
                                }
                            }
                            if (sec_after >= 0 && sec_after < fast_sec) {
                                l_log("倒计时递减（" + fast_sec + "→" + sec_after + "），确认为观看类型");
                                ad_raw = fast_sec;
                            } else {
                                l_log("倒计时未变（" + fast_sec + "→" + sec_after + "），确认为点击后看类型");
                                ad_clicknewpage = fast_sec;
                                clickAdButton();
                            }
                            break;
                        }
                    }
                    
                    if (txt.indexOf("滑动") > -1 && res_fast[i].bounds.top < 1000) {
                        let sec = txt.replace(/[^\d.]/g, "") * 1 || 15;
                        l_log("优先识别到滑动任务：", sec);
                        isSlideTask = true;
                        ad_raw = sec;
                        break;
                    }

                    if (txt.indexOf("点击") > -1 || txt.indexOf("玩") > -1 || txt.indexOf("开玩") > -1 || txt.indexOf("小游戏") > -1) {
                        let sec = txt.replace(/[^\d.]/g, "") * 1 || 15;
                        l_log("点/玩/小游戏类型：", sec);
                        ad_clicknewpage = sec;
                        clickAdButton();
                        break;
                    }
                }

                if (ad_raw > -1 || ad_clicknewpage > -1) {
                    break;
                }

                // 无障碍兜底检测
                if (textContains("秒").exists() && (textContains("奖励").exists() || textContains("得").exists())) {
                    l_log("无障碍兜底识别到广告特征文字");
                    ad_raw = 15;
                    break;
                }
            }

            // 识别结果处理
            if (ad_raw == -1 && ad_clicknewpage == -1) {
                l_warn("未能通过倒计时识别广告类型，尝试判断是否处于旧版视频播放页");
            }

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
                sleep(1000);
                let curPkg = currentPackage();
                let wpCur = wherePage();
                // 权限管理弹窗：直接 back 关闭
                if (curPkg.indexOf("permission") > -1 || curPkg.indexOf("packageinstaller") > -1) {
                    l_verbose("广告结束，检测到权限管理弹窗，直接 back 关闭");
                    back();
                    sleep(800);
                } else if (curPkg != qidianPackageName && !isIgnoredOrFloatingApp(curPkg)) {
                    l_verbose("点击/小游戏试玩结束，执行强制切换回起点");
                    launchQidian(true);
                    sleep(1500);
                }
                // 回到起点后如果存在内嵌落地页/商详页容器，关闭落地页
                wpCur = wherePage();
                if (wpCur == "browser" || wpCur == "internal_web") {
                    l_verbose("广告结束，检测到内嵌落地页，执行返回关闭 (" + wpCur + ")");
                    back();
                    sleep(800);
                }

                if (isSlideTask) {
                    l_verbose("滑动任务，执行切换");
                    swipe(device.width * 0.8, device.height / 2, device.width * 0.2, device.height / 2, 500);
                    sleep(1500);
                }
            }

            // 看完点X
            let n = 0;
            let try_back_time = 1; // 第1轮立即点击固定X坐标，杜绝首轮空等4秒OCR
            let max_click_rounds = 8; // 增加容错轮数，确保外部应用切回有足够轮次完成点X
            let xr = device.width - t_click_x_right, yt = closeButtonBottom - t_click_y_top;
            let xc = xr, yc = yt;
            do {
                n++;
                // 已在福利中心，直接跳出
                if (wherePage() == "freecenter") {
                    l_log("已回到福利中心，跳出点X循环");
                    break;
                }
                if (n > max_click_rounds) {
                    l_warn("点X超过 " + max_click_rounds + " 轮，尝试兜底重返福利中心");
                    if (wherePage() != "freecenter") enterFreeCenter();
                    break;
                }

                let curPkgN = currentPackage();
                let wpN = wherePage();
                // 1. 若仍在外部应用或权限管理中，优先处理切回与关闭
                if (curPkgN.indexOf("permission") > -1 || curPkgN.indexOf("packageinstaller") > -1) {
                    l_verbose("权限管理弹窗，back关闭");
                    back();
                    sleep(500);
                } else if (curPkgN != qidianPackageName && !isIgnoredOrFloatingApp(curPkgN)) {
                    l_verbose("点X阶段检测到当前仍处于外部应用，执行强制切回起点");
                    launchQidian(true);
                    sleep(1500);
                } else if (wpN == "browser" || wpN == "internal_web") {
                    l_verbose("检测到覆盖的落地页，执行 back 关闭落地页");
                    back();
                    sleep(800);
                }

                if (n >= try_back_time) {
                    // 优先固定点击一加Ace5的X位置 (1182, 280)
                    l_verbose("点击固定X坐标 (1182, 280)");
                    click(fixedCloseXPos.x, fixedCloseXPos.y);
                    sleep(300);

                    let n1 = n - try_back_time;
                    if (n1 < Object.keys(t_click).length) {
                        let tmp = t_click[Object.keys(t_click)[n1]];
                        if (tmp.x != fixedCloseXPos.x || tmp.y != fixedCloseXPos.y) {
                            l_verbose("尝试点击", tmp.x, tmp.y);
                            click(tmp.x, tmp.y);
                        }
                    } else {
                        if (xc < device.width - t_click_x_left) {
                            // 若依然没点到，最后再补一次固定点击，避免抛异常中断
                            click(fixedCloseXPos.x, fixedCloseXPos.y);
                            sleep(500);
                        } else {
                            l_verbose("扫描", xc, yc);
                            click(xc, yc);
                            yc += t_click_step;
                            if (yc > closeButtonBottom + t_click_y_bottom) {
                                yc = yt;
                                xc -= t_click_step;
                            }
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
                    // 优先检查是否已经快速回到了福利中心（避免盲目等待和无意义OCR）
                    if (wherePage() == "freecenter") {
                        l_log("已回到福利中心，跳出点X循环");
                        break;
                    }

                    // 点击X后给界面400~600ms的高频探活窗口，一旦检测到回到福利中心立即跳出
                    let isBackToFreeCenter = false;
                    for (let sc = 0; sc < 4; sc++) {
                        sleep(150);
                        let wp_sc = wherePage();
                        if (wp_sc == "freecenter") {
                            isBackToFreeCenter = true;
                            break;
                        }
                        if (btn && btn.parent()) break;
                    }
                    if (isBackToFreeCenter || wherePage() == "freecenter") {
                        l_log("已回到福利中心，跳出点X循环");
                        break;
                    }
                    if (btn && btn.parent()) continue;

                    // 若当前已经不再是广告页面（例如已切回主页或福利中心），直接跳出
                    let currentWp = wherePage();
                    if (currentWp != "adframe" && currentWp != "") {
                        if (currentWp == "freecenter") {
                            l_log("已回到福利中心，跳出点X循环");
                            break;
                        }
                    }

                    // 识别"续"的关键词：聚焦左上角核心区域
                    let res_kw = ocrTopRegion(1200);

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

                        // 识别“续”的按钮：调用精准匹配与点击逻辑
                        clickAdButton(true);

                        debugDelay = 3;
                        while (sec > 0) {
                            sleep(1000);
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
                            // 权限管理弹窗：直接 back 关闭
                            let curPkgResume = currentPackage();
                            let wpResume = wherePage();
                            if (curPkgResume.indexOf("permission") > -1 || curPkgResume.indexOf("packageinstaller") > -1) {
                                l_verbose("续看结束，权限管理弹窗，back关闭");
                                back();
                                sleep(500);
                            } else if (curPkgResume != qidianPackageName && !isIgnoredOrFloatingApp(curPkgResume)) {
                                l_verbose("续看结束，执行强制切换回起点");
                                launchQidian(true);
                                sleep(1500);
                            }
                            // 回到起点后如果存在内嵌落地页，关闭落地页
                            wpResume = wherePage();
                            if (wpResume == "browser" || wpResume == "internal_web") {
                                l_verbose("续看结束，执行返回关闭内嵌落地页 (" + wpResume + ")");
                                back();
                                sleep(800);
                            }
                            isClickNewPage = false; // 执行完后重置
                        }
                        n = 0;
                        continue; // 继续在当前的 do-while !btn.parent() 中检测是否出现真正的关闭按钮
                    }

                    // 检查拦截弹窗并处理
                    // 1. 若已不在广告界面或已在福利中心，直接跳出避免无意义OCR
                    if (wherePage() == "freecenter") {
                        l_log("已回到福利中心，跳出点X循环");
                        break;
                    }

                    // 2. 优先通过控件毫秒级快速匹配拦截弹窗，避免无条件全屏截屏OCR (cappad) 浪费数秒
                    let contWidget = textContains("继续观看").findOne(100) || textContains("继续浏览").findOne(100) || textContains("放弃福利").findOne(100);
                    let hasContinueBtn = false;
                    if (contWidget) {
                        l_log("控件检测到拦截弹窗: " + contWidget.text());
                        robustClick(contWidget);
                        sleep(1000);
                        hasContinueBtn = true;
                    } else if (n >= 2 && wherePage() == "adframe") {
                        // 仅当多轮未关且确认仍在广告内，才执行耗时的全屏 OCR 兜底
                        res = cappad();
                        for (let i = 0; i < res.length; i++) {
                            if (res[i].text.indexOf("继续观看") > -1 || res[i].text.indexOf("继续浏览") > -1 || res[i].text.indexOf("放弃福利") > -1) {
                                hasContinueBtn = true;
                                let b = res[i].bounds;
                                click(parseInt((b.left + b.right) / 2), parseInt((b.top + b.bottom) / 2));
                                l_log("OCR点击拦截弹窗按钮");
                                sleep(1000);
                                break;
                            }
                        }
                    }

                    if (hasContinueBtn) {
                        l_log("检测到拦截弹窗，任务未完成，继续处理");
                        // 重新检查是否包含滑动任务提示
                        let res_check = ocrTopRegion(550);
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
                        if (has_slide_reset) break; // 如果有弹窗并在弹窗后进行了滑动，也跳出关闭按钮检测循环
                        continue; // 重新进入 do-while 循环
                    }

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
            // 检查是否已处于外部应用/小游戏
            let curPkgOld = currentPackage();
            if (curPkgOld != qidianPackageName && !isIgnoredOrFloatingApp(curPkgOld)) {
                let externalName = "";
                try { externalName = getAppName(curPkgOld) || curPkgOld; } catch (e) { externalName = curPkgOld; }
                l_info("检测到当前已处于外部应用/小游戏：[" + externalName + "]，按跳转试玩处理，试玩 15 秒后切回起点");
                sleep(15000);
                launchQidian(true);
                sleep(1500);
                let wpAfter = wherePage();
                if (wpAfter == "browser" || wpAfter == "internal_web") {
                    back();
                    sleep(800);
                }
                click(fixedCloseXPos.x, fixedCloseXPos.y);
                sleep(1000);
                if (wherePage() != "freecenter") enterFreeCenter();
                break ad_main_loop;
            }

            // 兜底校验：确认是否真的在旧版视频广告播放界面
            let isOldVideoAd = textContains("可获得奖励").exists() || textContains("获得奖励").exists() || textContains("跳过").exists() || currentActivity().indexOf("Rewardvideo") > -1;
            if (!isOldVideoAd) {
                l_warn("未能识别广告且非旧版播放界面，执行兜底返回福利中心");
                back();
                sleep(1000);
                if (wherePage() != "freecenter") enterFreeCenter();
                break ad_main_loop;
            }

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
                    let maxOldRounds = 8;
                    do {
                        n++;
                        if (wherePage() == "freecenter") {
                            l_log("已回到福利中心");
                            break;
                        }
                        let curPkgExit = currentPackage();
                        if (curPkgExit != qidianPackageName && !isIgnoredOrFloatingApp(curPkgExit)) {
                            l_verbose("检测到离开起点，执行强制切换回起点");
                            launchQidian(true);
                            sleep(1500);
                        }

                        if (n == 1 && x1 != x2 && y1 != y2) {
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
                        } else {
                            // 尝试点击一加Ace5标准固定X坐标
                            l_verbose("尝试点击固定X坐标 (" + fixedCloseXPos.x + ", " + fixedCloseXPos.y + ")");
                            click(fixedCloseXPos.x, fixedCloseXPos.y);
                            sleep(500);

                            // 若仍未退出且页面是网页落地页，尝试back
                            let wpExit = wherePage();
                            if (wpExit == "browser" || wpExit == "internal_web") {
                                l_verbose("关闭内嵌落地页");
                                back();
                                sleep(800);
                            }
                        }

                        if (n >= maxOldRounds) {
                            l_warn("广告多轮尝试退出未回到福利中心，执行兜底重返福利中心");
                            enterFreeCenter();
                            break;
                        }
                        sleep(1000);
                    } while (!btn.parent());
            }
            // 旧广告结束退出 ad_main_loop
            if (ad_raw == -1 && ad_clicknewpage == -1) ad_raw = 0; // 标记已完成，防止落入异常重试
            break ad_main_loop;
        } 
        if (ad_raw == -1 && ad_clicknewpage == -1) ad_raw = 0; // 标记广告已完成
        clickIknown();
        } finally {
            isClickNewPage = false; // 无论正常结束还是异常退出，强制重置标记
            debugDelay = 1;         // 恢复看护线程正常检测频率
        }
        l_verbose("广告", adCount, "结束");
        sleep(100);
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
            
            // 每 8 秒进行一次活跃滑动
            // 在屏幕靠右侧干净区域执行（远离左侧可能残留的悬浮控件），并且避开顶部通知栏
            if (second % 8 == 0 && second > 0) {
                l_log("执行活跃滑动 (上下滚动，剩余" + second + "s)");
                let swipeX = Math.floor(device.width * 0.75); // 靠右侧区域滑动
                // 向上滑动浏览（从下 75% 处滑到中上 45% 处）
                swipe(swipeX, Math.floor(device.height * 0.75), swipeX, Math.floor(device.height * 0.45), 600);
                sleep(600);
                // 向下滑动回位（从 45% 处滑回 75% 处，全程在屏幕中下部，绝不碰顶部任何悬浮窗区域）
                swipe(swipeX, Math.floor(device.height * 0.45), swipeX, Math.floor(device.height * 0.75), 600);
                sleep(300);
            } else {
                sleep(a);
            }
            second--;
        } while (second > -2);
        l_verbose("时间到");
        readTime += new Date().getTime() - st;
        debugDelay = 1;
        sleep(300);
        back();
        sleep(600);
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
    // 先识别中上部核心区域，无结果时扩大到上半部分兜底
    function ocrTopRegion(fallbackHeight) {
        let h = fallbackHeight || 1600;
        let res = cappad([0, 0, device.width, 1000]);
        if (res.length == 0) res = cappad([0, 0, device.width, h]);
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
        if (!v) return null;
        try {
            let p = v.parent();
            if (!p) return null;
            let idx = v.indexInParent();
            if (idx < 0 || idx >= p.childCount()) return null;
            return p.child(idx);
        } catch (e) {
            return null;
        }
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

        if (v.className() == "android.widget.TextView") {
            // 每个节点只取一次 text()，减少无障碍 IPC 次数（TextView 空文本时继续看子节点，行为与原版一致）
            let txt = v.text();
            if (txt != "") return txt;
        }
        let v1 = v.children();
        if (v1.length > 0) {
            let t = new Array();
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
        let tmp = textContains("恭喜获得").findOne(150) || textContains("获得加点").findOne(150) || textContains("加点成功").findOne(150) || (textContains("恭喜").findOne(150) && !textContains("限时加点").exists());
        if (tmp) {
            let t1 = tmp.text();
            showReceived(t1);
            let a = "恭喜获得";
            if (t1.substring(0, a.length) == a) addReceived(t1.substring(a.length));

            sleep(150);
            // 优先精确匹配"知道了"，再尝试其他常见按钮
            let iknow = text("我知道了").findOne(200) || text("知道了").findOne(150) || text("知道啦").findOne(150) || text("开心收下").findOne(150);
            if (!iknow) iknow = textContains("知道").findOne(150);
            if (!iknow) iknow = text("确认").findOne(150) || text("确定").findOne(150) || text("领取").findOne(150);
            if (iknow) {
                l_verbose("点击弹窗按钮: " + iknow.text());
                robustClick(iknow);
                sleep(200);
                return 1;
            }
            return 1;
        }
        // 孤立弹窗检测（无“恭喜”字样但有明显确认关闭按钮）
        let directBtn = text("我知道了").findOne(100) || text("开心收下").findOne(100) || text("知道了").findOne(100);
        if (directBtn && directBtn.bounds().centerY() > device.height * 0.35 && directBtn.bounds().centerY() < device.height * 0.85) {
            l_verbose("快速点击屏幕中间弹窗按钮: " + directBtn.text());
            robustClick(directBtn);
            sleep(200);
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
                    // 增加权限管理相关的包名白名单及悬浮窗辅助应用过滤，防止误杀
                    let wpGuard = wherePage();
                    if (p != qidianPackageName && !isIgnoredOrFloatingApp(p) && wpGuard != "adframe" && wpGuard != "freecenter") {
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
    let alreadyInFreeCenter = openQidian();
    l_log(longdash);

    // 进入福利中心
    if (!alreadyInFreeCenter) {
        enterFreeCenter();
    } else {
        l_info("当前已在福利中心");
    }
    l_log(longdash);
    sleep(500);

    try {
        // 签到里面的兑换
        if (new Date().getDay() == 0) {
            l_log("开始兑换");
            if (exchange() == 0) l_log("无兑换");
            l_log(longdash);
            sleep(1000);
        }

        // ==================== 1. 优先完成【限时加点】任务（循环直到彻底完成） ====================
        l_log("优先检查并完成【限时加点】任务");
        let limitTaskLoops = 0;
        let isFirstLimitAd = true; // 限时任务专属首次等待验证码标记
        while (limitTaskLoops < 15) {
            limitTaskLoops++;
            // 循环开头先清理可能存在的弹窗（如加点成功、我知道了等）
            clickIknown();

            // 极速快速前置检查：若当前界面根本不包含“限时”和“加点”，说明已无相关任务，毫秒级直接退出
            if (!textContains("限时").exists() && !textContains("加点").exists()) {
                l_info("当前界面未检测到【限时/加点】关键词，直接跳出限时任务");
                break;
            }

            let limitActionBtn = null;
            let limitActionType = ""; // "read" 或 "video"
            let limitBtnText = "";
            let limitDesc = "";
            let limitReadMinutes = 1;

            // 寻找带有“限时”与“加点”的任务区域
            let candidateBtns = ["看视频", "看广告", "去完成", "去阅读"];
            for (let bIndex = 0; bIndex < candidateBtns.length; bIndex++) {
                let btnText = candidateBtns[bIndex];
                let foundBtns = text(btnText).find();
                for (let bi = 0; bi < foundBtns.length; bi++) {
                    let curBtn = foundBtns[bi];
                    // 极速初筛：直接检查父节点与祖父节点文本，避免对无关按钮进行深层遍历
                    let p = curBtn.parent();
                    if (!p) continue;
                    let s = "";
                    let pText = getTextOfView(p);
                    if (pText.indexOf("限时") > -1 || pText.indexOf("加点") > -1) {
                        s = pText;
                    } else {
                        let gp = p.parent();
                        if (gp) {
                            let gpText = getTextOfView(gp);
                            if (gpText.indexOf("限时") > -1 || gpText.indexOf("加点") > -1) {
                                s = gpText;
                            }
                        }
                    }

                    // 如果两级容器都不含限时/加点，说明是其他普通任务，直接跳过
                    if (s == "") continue;

                    if (s.indexOf("限时") > -1 && s.indexOf("加点") > -1) {
                        limitActionBtn = curBtn;
                        limitBtnText = btnText;
                        limitDesc = s;
                        // 核心判断：明确以按钮文字和任务动作区分阅读还是看视频/广告
                        if (btnText == "去阅读" || (s.indexOf("再读") > -1 && s.indexOf("再看") == -1 && s.indexOf("广告") == -1)) {
                            limitActionType = "read";
                            let lines = s.split("\n");
                            for (let j = 0; j < lines.length; j++) {
                                if (lines[j].indexOf("再读") > -1) {
                                    limitReadMinutes = lines[j].replace(/[^\d.]/g, "") * 1;
                                }
                            }
                            if (!limitReadMinutes || limitReadMinutes == 0) limitReadMinutes = 1;
                        } else {
                            limitActionType = "video";
                        }
                        break;
                    }
                }
                if (limitActionBtn) break;
            }

            if (!limitActionBtn) {
                l_info("当前无未完成的【限时加点】任务，继续后续流程");
                break;
            }

            l_info("发现【限时加点】任务，类型：" + (limitActionType == "read" ? "阅读" : "广告视频"));

            freeCenterScrolled = scrollShowButton(freeCenterScrolled, limitActionBtn);
            limitActionBtn = refreshView(limitActionBtn);
            if (!limitActionBtn) continue;

            if (limitActionType == "read") {
                // 执行限时阅读
                robustClick(limitActionBtn);
                sleep(2000);

                let wp = wherePage();
                if (wp == "index") {
                    l_info("跳转到了主页/书架，识别书籍《" + targetBookName + "》");
                    let book = text(targetBookName).findOne(2000);
                    if (book) {
                        l_log("找到《" + targetBookName + "》，开始阅读 " + (limitReadMinutes * 60 + 20) + " 秒");
                        if (book.parent() && book.parent().clickable()) {
                            book.parent().click();
                        } else {
                            click(book.bounds().centerX(), book.bounds().centerY());
                        }
                        sleep(1000);
                        read_book(limitReadMinutes + 0.34);
                    } else {
                        l_warn("未在主页找到《" + targetBookName + "》，默认随机翻阅");
                        read_book(limitReadMinutes);
                    }
                    returnToFreeCenterFromReading();
                } else if (wp == "read") {
                    l_info("已直接进入阅读界面，开始阅读 " + limitReadMinutes + " 分钟");
                    read_book(limitReadMinutes);
                    returnToFreeCenterFromReading();
                } else {
                    // 在福利中心内部弹窗或等待
                    sleep(limitReadMinutes * 60 * 1000);
                    if (wherePage() != "freecenter") enterFreeCenter();
                }
            } else {
                // 执行限时视频广告
                robustClick(limitActionBtn);
                
                // 首次点击任务按钮，保留10秒供处理验证码（专属标记，不受前置任务干扰）
                if (isFirstLimitAd || isFirstGoComplete) {
                    l_log("首次点击限时任务，强制等待 10 秒供处理验证码...");
                    device.vibrate(500); // 震动提醒
                    for (let t = 10; t > 0; t--) {
                        l_verbose("等待验证码... " + t);
                        sleep(1000);
                    }
                    l_info("等待结束，继续广告任务");
                    isFirstLimitAd = false;
                    isFirstGoComplete = false;
                } else {
                    sleep(1000);
                }

                adRetryCount = 0;
                video_look(limitActionBtn);
                
                // 广告异常重试机制（同普通广告）：若失败尝试关闭重新进入
                while (ad_raw == -1 && ad_clicknewpage == -1 && adRetryCount < 2) {
                    adRetryCount++;
                    l_warn("限时广告识别未完成，第" + adRetryCount + "次重试：重新定位并进入...");
                    back();
                    sleep(1000);
                    if (wherePage() != "freecenter") enterFreeCenter();
                    sleep(800);
                    let reBtn = text(limitBtnText).findOne(1000);
                    if (reBtn) {
                        robustClick(reBtn);
                        sleep(1000);
                        video_look(reBtn);
                    } else {
                        break;
                    }
                }

                // 广告播放并点X退出后，快速确认福利中心状态
                sleep(300);
                if (wherePage() != "freecenter") enterFreeCenter();
                clickIknown();
            }

            sleep(300);
        }
        l_info("【限时加点】阶段处理完毕");
        freeCenterScrolled = scrollShowButton(freeCenterScrolled, 0);
        l_log(longdash);
        sleep(500);

        // ==================== 2. 开始常规广告任务 ====================
        let targetBtn = ["看视频", "去完成"]; // 目标按钮字符
        let scrollCount = 0;
        let gameTaskDone = false; // 广告滚动时检测并执行游戏任务
        let adRetryCount = 0; // 广告识别失败重试计数
        let totalAdLoops = 0; // 总循环防护计数
        let noProgressCount = 0; // 连续无有效进展计数
        while (totalAdLoops < 40) {
            totalAdLoops++;
            let foundOnThisScreen = false;
            let currentTaskSuccess = true;

            for (let i = 0; i < targetBtn.length; i++) {
                let target = targetBtn[i];
                let aa = text(target).find();
                if (aa.length == 0) continue;
                for (let ii = aa.length - 1; ii > -1; ii--) {
                    // 快速过滤：先检查按钮自身及父节点的文本，避免对不相关按钮做深度遍历
                    let quickCheck = "";
                    let parent = aa[ii].parent();
                    if (parent) quickCheck = getTextOfView(parent);
                    if (quickCheck.indexOf("广告") == -1 && quickCheck.indexOf("限时") == -1 && quickCheck.indexOf("加点") == -1 && quickCheck.indexOf("市场") == -1) {
                        continue;
                    }

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
                        sleep(500); 
                    } else {
                        sleep(500);
                    }
                    if (c == 1) {
                        adRetryCount = 0; // 每个广告任务独立计数重试次数
                        video_look(aa[ii]);
                        // 广告识别失败重试：关闭广告再重新进入，最多重试2次
                        while (ad_raw == -1 && ad_clicknewpage == -1 && adRetryCount < 2) {
                            adRetryCount++;
                            l_warn("广告识别失败，第" + adRetryCount + "次重试：关闭广告重新进入...");
                            back();
                            sleep(1000);
                            // 重新定位并点击任务按钮
                            let reBtn = text(target).find();
                            let reFound = false;
                            for (let ri = 0; ri < reBtn.length; ri++) {
                                let rs = getDescriptionOnLeft(reBtn[ri]);
                                if (rs == "") {
                                    let rp = reBtn[ri].parent();
                                    if (rp) rs = getTextOfView(rp);
                                }
                                if (rs.indexOf("广告") > -1 || rs.indexOf("限时") > -1 || rs.indexOf("加点") > -1) {
                                    robustClick(reBtn[ri]);
                                    sleep(1000);
                                    video_look(reBtn[ri]);
                                    reFound = true;
                                    break;
                                }
                            }
                            if (!reFound) {
                                l_error("重试失败：未找到任务按钮");
                                break;
                            }
                        }
                        if (ad_raw == -1 && ad_clicknewpage == -1) {
                            l_error("广告识别失败，已重试" + adRetryCount + "次，放弃此任务");
                            currentTaskSuccess = false;
                        }
                    }
                    if (c == 2) jumpMarket(aa[ii]);
                    foundOnThisScreen = true;
                    if (currentTaskSuccess) {
                        scrollCount = 0; // 任务成功，重置滚动
                        noProgressCount = 0;
                    } else {
                        noProgressCount++;
                        if (noProgressCount >= 2) {
                            l_warn("连续任务异常，尝试滑动跳过当前卡点...");
                            scrollCount++;
                        }
                    }
                    sleep(800); // 等待页面列表刷新
                    break; 
                }
                if (foundOnThisScreen) break;
            }

            if (foundOnThisScreen && noProgressCount < 2) continue; 

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
            let btn = text(btnt).find();
            if (btn.length == 0) continue;
            for (let i = 0; i < btn.length; i++) {
                l_verbose(shortdash);
                freeCenterScrolled = scrollShowButton(freeCenterScrolled, btn[i]);
                let btn_now = refreshView(btn[i]);
                l_log("点击:", btnt);
                robustClick(btn_now);
                bonusNum++;
                let c1 = 0;
                for (let ii = 0; ii < 2; ii++) {
                    sleep(300);
                    c1 = clickIknown();
                    if (c1) break;
                }
                if (!c1) {
                    btn_now = refreshView(btn[i]);
                    if (btn_now && btn_now.text() == btnt) {
                        l_error("似乎领取失败");
                    }
                }
            }
        }
        if (bonusNum == 0) l_log("无");
        l_log(longdash);
        sleep(500);

        l_log.apply(null, reviewResults());
        home();
        l_info("脚本正常结束");
        l_verbose("控制台3秒后自动关闭");
        l_log("记得清理Autox.js后台");
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
