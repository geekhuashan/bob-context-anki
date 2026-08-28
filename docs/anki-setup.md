# Anki 配置说明

插件当前使用固定的牌组、笔记类型和字段名。这样可以保证写入结果与卡片模板稳定一致，但首次使用前需要完成一次配置。

## 1. 安装 AnkiConnect

在 Anki 中打开“工具 -> 附加组件 -> 获取附加组件”，输入代码 `2055492159`，安装 [AnkiConnect](https://ankiweb.net/shared/info/2055492159) 后重启 Anki。

插件只连接本机默认地址 `http://127.0.0.1:8765`。

## 2. 创建牌组

创建牌组：

```text
English::Vocabulary
```

`::` 表示 Anki 的分层牌组。也可以先创建 `English`，再在其中创建 `Vocabulary`。

## 3. 创建笔记类型

复制一个现有笔记类型或新建笔记类型，并命名为：

```text
Vocabulary Modern
```

按以下名称创建字段，大小写必须一致：

1. `Word`
2. `Phonetic`
3. `Definition`
4. `DefinitionZH`
5. `ContextMeaning`
6. `ExampleSentence`
7. `SentenceTranslation`
8. `Source`
9. `Audio`

插件会写入 `Word`、`ExampleSentence` 和 `Source`，其他字段保持空白，可由其他 Anki 工作流后续补全。

## 4. 最小卡片模板

正面模板：

```html
<div class="word">{{Word}}</div>
{{#Phonetic}}<div class="phonetic">{{Phonetic}}</div>{{/Phonetic}}
{{Audio}}
{{#ExampleSentence}}<div class="sentence">{{ExampleSentence}}</div>{{/ExampleSentence}}
```

背面模板：

```html
{{FrontSide}}
<hr id="answer">
{{#Definition}}<div>{{Definition}}</div>{{/Definition}}
{{#DefinitionZH}}<div>{{DefinitionZH}}</div>{{/DefinitionZH}}
{{#ContextMeaning}}<div>{{ContextMeaning}}</div>{{/ContextMeaning}}
{{#SentenceTranslation}}<div>{{SentenceTranslation}}</div>{{/SentenceTranslation}}
{{#Source}}<div class="source">{{Source}}</div>{{/Source}}
```

基础样式：

```css
.card {
  color: #202124;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  font-size: 18px;
  line-height: 1.5;
  padding: 24px;
  text-align: left;
}

.word {
  font-size: 32px;
  font-weight: 700;
}

.phonetic,
.source {
  color: #6b7280;
}

.sentence {
  margin-top: 20px;
}
```

## 5. 验证连接

保持 Anki 运行后，在终端执行：

```bash
curl http://127.0.0.1:8765 \
  -X POST \
  -H 'Content-Type: application/json' \
  -d '{"action":"version","version":6}'
```

看到 `"error": null` 即表示 AnkiConnect 可用。
