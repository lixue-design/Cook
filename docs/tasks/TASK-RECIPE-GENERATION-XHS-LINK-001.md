# TASK-RECIPE-GENERATION-XHS-LINK-001 小红书公开链接导入

## 目标

用户粘贴小红书公开 HTTPS 链接后，服务端只提取页面公开声明的标题和正文摘要，交由现有 AI 生成可编辑菜谱草稿。

## 边界

- 仅支持 `xiaohongshu.com`、`xhslink.com`、`xhslink.cn` 及子域名；支持包含标题和口令的完整小红书分享文案，从中提取第一个有效链接。
- 不读取登录态、Cookie、评论、图片、视频或用户资料；不保存网页原文。
- 不绕过验证码、访问限制或平台反爬机制。
- 解析失败时保留链接输入，并提示用户复制正文或上传截图。
- 成功结果必须进入编辑页确认，不直接创建正式菜谱。

## 服务端契约

调用个人版 AI 环境的 `cookRecipeTextAi`：

```json
{ "sourceUrl": "https://www.xiaohongshu.com/explore/..." }
```

成功时返回既有的 `{ ok: true, data: { draft } }`；失败时返回 `{ ok: false, error: { code, message } }`。主要失败码：`LINK_INVALID_URL`、`LINK_NOT_SUPPORTED`、`LINK_FETCH_FAILED`、`LINK_FETCH_TIMEOUT`、`LINK_CONTENT_UNAVAILABLE`。

## 验收

- 白名单、HTTPS、端口和跳转目标均在服务端校验。
- 响应体、跳转次数和超时均受限。
- 仅将提取出的标题和正文摘要交给 AI；日志不记录网页正文。
- 小程序沿用原链接半屏弹窗与编辑页，失败时链接不丢失。
- 运行链接解析、AI 客户端、编辑页回归检查。
