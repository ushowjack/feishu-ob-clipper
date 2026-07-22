import assert from "node:assert/strict";
import test from "node:test";

import {
  ARTICLE_SOURCE,
  detectArticleSource,
  getImageFetchCredentials,
  isSupportedArticleUrl,
} from "../src/site-rules.js";

test("飞书网址只识别 wiki、docx 和 docs 文档", () => {
  assert.equal(detectArticleSource("https://example.feishu.cn/wiki/token"), ARTICLE_SOURCE.FEISHU);
  assert.equal(detectArticleSource("https://example.feishu.cn/docx/token"), ARTICLE_SOURCE.FEISHU);
  assert.equal(detectArticleSource("https://feishu.cn/docs/token"), ARTICLE_SOURCE.FEISHU);
  assert.equal(detectArticleSource("https://example.feishu.cn/drive/home"), null);
});

test("生财网址只识别 articleDetail 文章", () => {
  assert.equal(
    detectArticleSource("https://scys.com/articleDetail/xq_topic/45544285884128158"),
    ARTICLE_SOURCE.SCYS,
  );
  assert.equal(detectArticleSource("https://scys.com/activity"), null);
});

test("不接受伪造域名、HTTP 和其他网站", () => {
  for (const url of [
    "https://scys.com.evil.example/articleDetail/xq_topic/1",
    "https://feishu.cn.evil.example/wiki/token",
    "http://scys.com/articleDetail/xq_topic/1",
    "http://example.feishu.cn/wiki/token",
    "https://evil.example/articleDetail/xq_topic/1",
  ]) {
    assert.equal(isSupportedArticleUrl(url), false);
  }
});

test("生财三类图片 CDN 不携带凭证，飞书图片保持原有凭证策略", () => {
  assert.equal(
    getImageFetchCredentials(
      "https://article-images.zsxq.com/example.jpg",
      "https://scys.com/articleDetail/xq_topic/45544285884128158",
    ),
    "omit",
  );
  assert.equal(
    getImageFetchCredentials(
      "https://sphere-sh.oss-cn-shanghai.aliyuncs.com/private/xq/images/example.webp",
      "https://scys.com/articleDetail/xq_topic/22255482425242851",
    ),
    "omit",
  );
  assert.equal(
    getImageFetchCredentials(
      "https://sphere-search-mobile.oss-cn-shanghai.aliyuncs.com/article/example.webp",
      "https://scys.com/articleDetail/xq_topic/45544585811455488",
    ),
    "omit",
  );
  assert.equal(
    getImageFetchCredentials(
      "https://internal-api-drive-stream.feishu.cn/image/token",
      "https://example.feishu.cn/wiki/token",
    ),
    "include",
  );
});
