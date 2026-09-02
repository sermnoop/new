// Harbor eBook source plugin for Project Gutenberg
const BASE = "https://www.gutenberg.org";

async function getDoc(path) {
  const res = await harbor.http(BASE + path, { responseType: "text" });
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

function clean(val) {
  return (val || "").replace(/\s+/g, " ").trim();
}

function cardToSummary(el) {
  const link = el.querySelector("a.link");
  if (!link) return null;
  const href = link.attr("href") || "";
  const match = href.match(/\/ebooks\/(\d+)/);
  if (!match) return null;

  const id = match[1];
  const title = el.querySelector(".title")?.text() || "Book " + id;
  const author = el.querySelector(".subtitle")?.text();
  const img = el.querySelector("img.cover-thumb");

  return {
    id,
    title: clean(title),
    author: author ? clean(author) : undefined,
    cover: abs(img?.attr("src")),
    siteUrl: BASE + "/ebooks/" + id,
  };
}

const plugin = {
  id: "gutenberg-source",
  name: "Project Gutenberg",

  async popular(offset) {
    const page = Math.floor(offset / 25) + 1;
    const doc = await getDoc("/browse/scores/history/recent?page=" + page);
    const items = doc.querySelectorAll("li.booklink").map(cardToSummary).filter(Boolean);
    return items;
  },

  async search(query, offset) {
    const startIdx = offset || 0;
    const doc = await getDoc("/ebooks/search/?query=" + encodeURIComponent(query) + "&start_index=" + startIdx);
    const items = doc.querySelectorAll("li.booklink").map(cardToSummary).filter(Boolean);
    return items;
  },

  async detail(id) {
    const doc = await getDoc("/ebooks/" + id);
    const title = doc.querySelector("h1[itemprop='name']")?.text() || "Book " + id;
    const author = doc.querySelector("a[itemprop='creator']")?.text();
    const cover = doc.querySelector("img.cover-art")?.attr("src");

    return {
      id,
      title: clean(title),
      author: author ? clean(author) : undefined,
      cover: abs(cover),
      siteUrl: BASE + "/ebooks/" + id,
    };
  },

  async chapters(id) {
    return [
      {
        id,
        chapter: "1",
        title: "Full Text",
        position: 0,
      },
    ];
  },

  async content(id) {
    const res = await harbor.http(BASE + "/cache/epub/" + id + "/pg" + id + ".txt", { responseType: "text" });
    if (res.ok && res.body) {
      return res.body;
    }
    const htmlDoc = await harbor.http(BASE + "/files/" + id + "/" + id + "-h/" + id + "-h.htm", { responseType: "text" });
    if (htmlDoc.ok && htmlDoc.body) {
      const parsed = harbor.parseHtml(htmlDoc.body);
      const paragraphs = parsed.querySelectorAll("p").map((p) => p.text().trim()).filter(Boolean);
      return paragraphs.join("\n\n");
    }
    return "Failed to load content for this book.";
  },
};

if (typeof harbor !== "undefined" && harbor.register) {
  harbor.register(plugin);
}
