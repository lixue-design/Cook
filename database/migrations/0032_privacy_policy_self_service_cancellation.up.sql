-- The cancellation flow now deletes data automatically after a seven-day
-- withdrawal period, so users must see and accept this material policy update.
UPDATE agreement_versions
SET required = false
WHERE required;

INSERT INTO agreement_versions (
  version, required, service_title, service_content, privacy_title, privacy_content, effective_at
) VALUES (
  '2026-11-06',
  true,
  '用户服务协议',
  '半勺提供菜谱、用餐计划与采购清单管理服务。用户应合法使用服务并对自行录入的内容负责。',
  '隐私政策',
  '更新日期：2026年11月6日\n生效日期：2026年11月6日\n\n一、适用范围与联系我们\n“半勺”由李雪（以下简称“我们”）运营。本政策说明我们如何处理你使用半勺小程序时提供或产生的个人信息。如有隐私相关问题、查阅、更正、删除或注销请求，请发送邮件至 recipe001@163.com。\n\n二、我们处理的信息及用途\n1. 微信账户标识：你登录时，微信会向我们提供 OpenID；如微信提供，也可能包含 UnionID。我们使用这些标识完成登录、识别账户、隔离不同用户的数据和保障账号安全。我们不获取你的手机号、微信好友关系、通讯录或精确位置信息。\n2. 你主动录入的内容：包括菜谱名称、分类、食材、用量、制作步骤、耗时、热量、计划安排、菜篮清单、勾选状态及你主动提交的注销原因。我们使用这些内容提供菜谱管理、周计划生成和采购清单功能。\n3. 你主动选择的图片：当你选择菜谱封面时，我们会读取你选中的图片并上传至云端保存，以在菜谱列表和详情中展示。\n4. 本地存储信息：为保持登录状态、保存未完成菜谱草稿、页面缓存和计划视图偏好，我们会在你的设备本地保存必要信息。\n\n三、文字生成、图片识别与链接导入\n仅在你主动发起时，我们才会将菜谱文本、文字菜谱截图或公开小红书链接发送至腾讯云开发的 AI、OCR 或公开链接读取服务，用于生成可编辑草稿。OCR 临时图片在流程结束后会尝试删除。我们不会登录你的小红书账号或读取非公开内容，也不会将这些内容用于广告定向或自行训练个人画像。\n\n四、信息的存储、共享与保护\n你的业务数据和菜谱封面存储在腾讯云开发提供的中国境内云服务中。除为提供微信小程序、云存储、OCR、AI 解析及访问公开链接所必需外，我们不会出售你的个人信息，也不会向其他第三方提供你的个人信息。\n\n五、保存期限与账号注销\n账户与菜谱、计划、菜篮数据在你使用服务期间保存。你可在“我的—账号注销”自主发起注销；确认后进入 7 天可撤回期。在撤回期内，你可在小程序自行撤回。期满后，系统自动删除账号、菜谱、计划、菜篮和已上传菜谱封面；删除任务发生临时故障时会自动重试，未完成前不会显示注销完成。为记录删除已完成，系统仅保留不含菜谱、计划、菜篮、图片、OpenID 或注销原因的最小完成记录。法律法规另有保存要求的除外。\n\n六、你的权利\n你可以在小程序内查看、修改或删除菜谱、计划和菜篮内容；可退出登录；可在“我的—账号注销”行使注销权利。你也可以通过本政策公布的邮箱提出查阅、更正、删除或撤回同意请求。\n\n七、未成年人保护\n本服务主要面向成年人。如你是未成年人，请在监护人同意和指导下使用。\n\n八、政策更新\n当产品功能或信息处理规则发生重大变化时，我们会更新本政策，并通过小程序页面或登录确认等方式提示你。',
  '2026-11-06T00:00:00+08:00'
)
ON CONFLICT (version) DO UPDATE
SET required = excluded.required,
    service_title = excluded.service_title,
    service_content = excluded.service_content,
    privacy_title = excluded.privacy_title,
    privacy_content = excluded.privacy_content,
    effective_at = excluded.effective_at;
