// Harbor eBook source plugin for MangaPlus by Shueisha
const BASE = "https://mangaplus.shueisha.co.jp";

async function getDoc(path) {
  const res = await harbor.http(BASE + path, {
    responseType: "text",
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    },
  });
  if (!res.ok) throw new Error("HTTP " + res.status + " for " + path);
  return harbor.parseHtml(res.body);
}

function abs(url) {
  if (!url) return undefined;
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith("//")) return "https:" + url;
  if (url.startsWith("/")) return BASE + url;
  return BASE + "/" + url;
}

function cleanTitle(value) {
  return (value || "")
    .replace(/[^\p{L}\p{N}'’]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cardToSummary(el) {
  const link = el.querySelector("a") || el;
  const href = link.attr("href") || "";
  const match = href.match(/\/titles\/(\d+)/);
  if (!match) return null;

  const id = match[1];
  const titleEl = el.querySelector(".title, .Title-module_title__") || el.querySelector("h3, h4");
  const rawTitle = (titleEl?.text() || link.attr("title") || "").trim();
  const img = el.querySelector("img");
  const coverUrl = img?.attr("src") || img?.attr("data-src");

  return {
    id,
    title: cleanTitle(rawTitle) || "Title " + id,
    cover: abs(coverUrl),
    siteUrl: BASE + "/titles/" + id,
    status: "ongoing",
    originalLanguage: "ja",
  };
}

const plugin = {
  id: "mangaplus-shueisha",
  name: "MangaPlus by Shueisha",

  async popular(offset, tagId) {
    try {
      const doc = await getDoc("/updates");
      const cards = doc.querySelectorAll(".title-list .title-list-item, .AllTitles-module_item__");
      const items = cards.map(cardToSummary).filter(Boolean);
      return items.slice(offset, offset + 48);
    } catch {
      return [];
    }
  },

  async search(query, offset, tagId) {
    try {
      const doc = await getDoc("/search?query=" + encodeURIComponent(query));
      const cards = doc.querySelectorAll(".search-results .item, .AllTitles-module_item__");
      const items = cards.map(cardToSummary).filter(Boolean);
      return items.slice(offset, offset + 48);
    } catch {
      return [];
    }
  },

  async detail(id) {
    try {
      const doc = await getDoc("/titles/" + id);
      const title = doc.querySelector("h1, .TitleDetail-module_title__")?.text();
      const author = doc.querySelector(".TitleDetail-module_author__")?.text();
      const overview = doc.querySelector(".TitleDetail-module_overview__, .description")?.text();
      const cover = doc.querySelector(".TitleDetail-module_cover__ img, .poster img")?.attr("src");

      return {
        id,
        title: cleanTitle(title || "Title " + id),
        author: author?.trim(),
        description: overview?.trim(),
        cover: abs(cover),
        siteUrl: BASE + "/titles/" + id,
        status: "ongoing",
        originalLanguage: "ja",
      };
    } catch {
      return {
        id,
        title: "Title " + id,
        siteUrl: BASE + "/titles/" + id,
      };
    }
  },

  async chapters(id) {
    try {
      const doc = await getDoc("/titles/" + id);
      const chapterLinks = doc.querySelectorAll("a[href*='/viewer/']");
      const list = chapterLinks
        .map((a, position) => {
          const href = a.attr("href") || "";
          const match = href.match(/\/viewer\/(\d+)/);
          if (!match) return null;

          const chapterId = match[1];
          const numText = a.querySelector(".chapter-number, .ChapterListItem-module_name__")?.text() || "";
          const titleText = a.querySelector(".chapter-title, .ChapterListItem-module_subTitle__")?.text() || "";

          return {
            id: chapterId,
            chapter: numText.replace(/^[#\s]+/, "").trim() || String(position + 1),
            title: titleText.trim() || undefined,
            position,
            siteUrl: BASE + "/viewer/" + chapterId,
          };
        })
        .filter(Boolean);

      return list;
    } catch {
      return [];
    }
  },

  async content(chapterId) {
    try {
      const doc = await getDoc("/viewer/" + chapterId);
      const images = doc
        .querySelectorAll(".viewer-pages img, .Viewer-module_page__ img")
        .map((img) => img.attr("src") || img.attr("data-src"))
        .filter(Boolean)
        .map(abs);

      return { images };
    } catch {
      return { images: [] };
    }
  },
};

if (typeof harbor !== "undefined" && harbor.register) {
  harbor.register(plugin);
}
