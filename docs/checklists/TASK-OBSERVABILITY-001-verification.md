# TASK-OBSERVABILITY-001 验证记录

日期：2026-07-31

## 完成

- 每个 Cloud Function action 生成 requestId 并输出一条最小结构化完成日志。
- 日志仅包含 action、结果、稳定错误码、warning codes 和耗时。
- 失败响应附 requestId；意外异常统一为脱敏 `INTERNAL_ERROR`。
- 小程序保留最近 20 条脱敏诊断，不记录 payload、message 或用户内容。
- 计划生成与菜篮同步 warnings 作为成功结果记录并向用户展示，不当作致命错误。
- 新增 `docs/harness/mvp-diagnostics-guide.md` 说明内测收集和定位方法。

## 验证

- `npm run test:diagnostics`
- observability、auth、compliance、basket、plan、recipe、migration 定向测试：57 项通过。
- 日志脱敏测试确认不包含邮箱样例、连接串、token、用户 warning message、SQL 或堆栈。
- recipe、plan、basket remote verifier 回归通过。

## 风险

- MVP 未接商业 APM，检索、保留期和访问控制依赖 CloudBase 环境；发布清单需确认。
- 小程序本地诊断仅用于内测定位，不作为长期审计日志。
