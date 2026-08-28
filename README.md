# Bob 上下文词卡

一个用于 [Bob](https://bobtranslate.com/) 的 Anki 上下文词卡插件。

翻译整句时，插件会按 CEFR-J 等级列出值得学习的候选词。只有显式点击某个候选词后，插件才会生成释义，并将该词作为主词、原句作为上下文写入 Anki。

## 特点

- 默认只显示 CEFR-J B2 词汇和词表外术语，减少基础词干扰。
- 支持 A1、A2、B1、B2 和“仅词表外”五档筛选。
- 支持个人“已认识词”排除列表。
- 单词和原句通过一次显式点击绑定，普通翻译不会自动建卡。
- 写入前使用 AnkiConnect 检查重复卡片；完整重复卡不请求注释服务。
- 可补全本插件此前创建的空注释卡，不修改其他来源的重复卡片。
- 为新词生成音标、英文释义、中文释义、语境义和整句翻译。
- 优先使用词典中明确标记为美音的真人 MP3，没有可用美音时才使用 MiniMax 兜底。
- API Key 由 Bob 的安全输入项保存，不写入插件文件。
- 不读取 Bob 数据库，不运行后台扫描服务。

## 工作流程

1. 使用 Bob 翻译一整句英文。
2. 在“上下文词卡”结果中点击需要学习的候选词。
3. Bob 会对该词发起一次新查询；插件在两分钟内匹配刚才的原句。
4. AnkiConnect 先检查重复；只有新词或本插件创建的不完整卡片才会调用所需服务。
5. 新卡的注释和发音会并行生成；发音先查询目标词的真人美音，并优先从词典条目指向的 Wikimedia Commons 原始录音获取 MP3，找不到或下载失败才请求 MiniMax。
6. MP3 成功写入 Anki 媒体库后才会创建完整卡片。真人录音的来源、录音者和许可会追加到 `Source` 字段；旧卡只补缺失内容，不会覆盖自定义音频。
7. `0.5.x` 生成的旧版 MiniMax 音频会在再次点击该词时迁移一次，以重新按当前来源顺序选择发音。

如果只翻译句子、没有点击候选词，插件不会请求远程服务或写入 Anki。注释、发音或媒体写入失败时也不会创建新的半成品卡片。

## 环境要求

- macOS 上的 Bob 1.20.0 或更高版本。
- Anki Desktop。
- Anki 插件 [AnkiConnect](https://ankiweb.net/shared/info/2055492159)。
- 牌组 `English::Vocabulary`。
- 笔记类型 `Vocabulary Modern`。

首次使用前，请按 [Anki 配置说明](docs/anki-setup.md) 创建牌组、笔记类型和字段。

## 安装

1. 从 [Releases](https://github.com/geekhuashan/bob-context-anki/releases) 下载最新的 `context-anki-v*.bobplugin`。
2. 双击 `.bobplugin` 文件完成安装。
3. 在 Bob 的“设置 -> 服务 -> 文本翻译”中启用“上下文词卡”。
4. 保持 Anki 已启动，确保 AnkiConnect 正在监听本机 `127.0.0.1:8765`。

## 插件设置

| 设置 | 默认值 | 作用 |
| --- | --- | --- |
| 注释 API Key | 空 | OpenAI 兼容服务的密钥，使用安全输入框保存 |
| 注释 API 地址 | `https://api.minimaxi.com` | 服务根地址、`/v1` 地址或完整 `chat/completions` 地址 |
| 注释模型 | `MiniMax-M2.1` | 生成结构化词卡注释，固定关闭推理 |
| MiniMax 兜底 Key | 空 | 真人美音不可用时才使用；留空复用注释 Key |
| MiniMax 兜底地址 | `https://api.minimaxi.com` | MiniMax 根地址、`/v1` 或完整 `t2a_v2` 地址 |
| MiniMax 兜底模型 | `speech-2.8-hd` | 真人美音不可用时生成 MP3 |
| MiniMax 兜底音色 | `English_Graceful_Lady` | 兜底音色，语速固定为 0.85 |
| 最低词汇等级 | B2 及以上 | 控制候选词的最低 CEFR-J 等级 |
| 已认识词 | 空 | 排除已经掌握的词，支持空格、逗号和分号分隔 |

CEFR-J 1.6 只覆盖 A1 到 B2。未收录内容会标记为“词表外 / 专业词”，不会被冒充为 C1 或 C2。

注释服务使用 OpenAI 兼容的 `chat/completions` 接口。发音先匿名查询 Free Dictionary API 的目标词条，只接受明确标记为 US English 的 HTTPS MP3；若词条提供 Wikimedia Commons 原始录音页，插件会从该页的 MP3 转码地址下载同一录音。以上请求都不携带任何 API Key。没有可用真人美音时，插件才调用 MiniMax `t2a_v2`，并通过标准的 `Authorization: Bearer` 请求头发送 MiniMax Key。

## 当前限制

- 牌组、笔记类型和字段结构目前固定，必须先按文档配置 Anki。
- 候选词会话两分钟后失效，且成功匹配一次后立即清除。

## 本地开发

需要 Node.js 20 或更高版本以及 pnpm 10。

```bash
pnpm install --frozen-lockfile
pnpm check
pnpm release:build
```

安装包生成在 `release/context-anki-v<version>.bobplugin`。`pnpm verify:release` 会检查包内文件、版本、插件标识、本地 AnkiConnect 地址和凭据特征。

## 发布

仓库的 GitHub Actions 会先运行测试、类型检查、构建和安装包审计。推送与 `package.json` 版本一致的 `v<version>` tag 后，Release 工作流才会创建 GitHub Release，并附上 `.bobplugin` 与 SHA-256 校验文件。

## 安全与隐私

插件只在用户点击一个尚未收录的新词，或本插件此前创建的不完整卡片时，将完成缺失内容所需的数据发送到对应服务：注释服务接收目标词和原句；Free Dictionary API 匿名接收目标词；Wikimedia Commons 只接收词典返回的媒体页 ID；只有词典没有可用真人美音时，MiniMax 发音服务才接收目标词。生成或下载的 MP3 以 base64 通过本机 `http://127.0.0.1:8765` 写入 Anki 媒体库。API Key 由 Bob 的安全设置保存，不包含在源码、构建产物或 Release 中。插件不读取其他 Bob 插件的数据。

## 致谢与代码来源

本项目由 [robbinhan/bob-anki](https://github.com/robbinhan/bob-anki) 派生而来。感谢原作者 [robbinhan](https://github.com/robbinhan) 开源 Bob 插件的工程结构、打包流程和 AnkiConnect 集成实现，为本插件提供了基础。

本仓库在此基础上重新实现了显式选词、短时上下文匹配、CEFR-J 分级、已认识词过滤以及面向自定义笔记类型的 Anki 写入流程。

代码继续按 [MIT License](LICENSE) 发布，并在许可证中保留原作者的版权声明。更完整的原项目引用和 CEFR-J 数据来源见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
