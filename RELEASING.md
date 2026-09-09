# 发布

## 发布状态

代码可构建、可生成 GitHub Release 归档，但尚未上架 Store。

发布前必须将 `package.json` 的 `author` 改成维护者自己的 Raycast 用户名。当前 `lea` 是早期版本的临时值，CLI 校验通过仅代表该账号存在，不代表已经确认所有权。不要在确认前以该账号名提交 Store。

## GitHub Release

1. 将本项目源码上传至你自己的 GitHub 仓库（不要上传 `node_modules`、`release` 或本机 Raycast 配置）。
2. `.github/workflows/release.yml` 可从 Actions → Build Release → Run workflow 手动执行；它会安装锁定依赖、运行测试/lint、构建并保存 ZIP 和校验文件为 workflow artifact。
3. 发布新版本时，更新 `package.json` / `package-lock.json` 的版本号，再推送对应 `v0.2.0` 格式标签。工作流验证标签和版本一致后生成 **Draft Release** 并附上归档，供维护者检查后发布。
4. GitHub Release 的 ZIP 是源码与预编译归档，不应在下载按钮上标注“一键安装”。

工作流尚需上传到实际仓库后才能验证 GitHub 托管环境；本地已验证构建和打包命令。

## Raycast Store 免命令行安装

1. 确认 Raycast 用户名，并更新清单中的 `author`。
2. 在真实 Raycast 中验收：打开 Start Eye Break Reminder 面板并开启提醒；点击暂停后确认不再自动提醒；重新开启后确认本轮归零；完成一次倒计时并确认今日次数增加；从倒计时页面暂停，确认返回面板且不增加次数；提前关闭倒计时后重试；锁屏/唤醒后查看计时；正常使用直到触发自动提醒。
3. 添加实际运行截图到 `metadata/`，按照官方 [Store 准备指南](https://developers.raycast.com/basics/prepare-an-extension-for-store) 核对素材和说明。
4. 在 Git 仓库中提交源码后执行维护者命令 `npm run publish:store`。Raycast CLI 会要求登录，并向 `raycast/extensions` 提交审核 PR；这个命令不是发布到你自己的 GitHub Release。
5. 等 Raycast 审核通过后，从实际 Store 页面复制安装链接，添加到本仓库 README 顶部。不要在上架前放一个尚不存在的安装链接。

上架后，GitHub 用于源码、问题反馈和发布记录，普通用户通过 Store 安装按钮安装和自动更新，不需要运行上述开发命令。
