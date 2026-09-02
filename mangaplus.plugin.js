/*
 * MANGA Plus by SHUEISHA — Harbor eBook source
 * Target API: Harbor eBook Plugin API
 *
 * Notes:
 * - Uses MANGA Plus' public web API endpoints.
 * - Requests JSON where the endpoint supports ?format=json.
 * - Generates a per-request Session-Token.
 * - Returns absolute HTTPS image URLs.
 * - Does NOT bypass subscriptions, premium access, DRM, or account restrictions.
 *
 * Harbor API reference:
 * EBookProvider = popular/search/detail/chapters/content (+ optional tags)
 */

const API = "https://jumpg-webapi.tokyo-cdn.com/api";
const WEB = "https://mangaplus.shueisha.co.jp";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
  "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";

const PAGE_SIZE = 20;
const LANG = "eng";

function uuid() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  const a = new Uint8Array(16);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(a);
  } else {
    for (let i = 0; i < a.length; i++) a[i] = Math.floor(Math.random() * 256);
  }
  a[6] = (a[6] & 0x0f) | 0x40;
  a[8] = (a[8] & 0x3f) | 0x80;
  const h = [...a].map(x => x.toString(16).padStart(2, "0"));
  return `${h.slice(0,4).join("")}-${h.slice(4,6).join("")}-${h.slice(6,8).join("")}-${h.slice(8,10).join("")}-${h.slice(10,16).join("")}`;
}

function q(path, params) {
  const u = new URL(API + path);
  for (const [k, v] of Object.entries(params || {})) {
    if (v !== undefined && v !== null && v !== "") u.searchParams.set(k, String(v));
  }
  return u.toString();
}

async function httpJson(url) {
  const r = await harbor.http(url, {
    method: "GET",
    responseType: "json",
    timeoutMs: 20000,
    headers: {
      "Accept": "application/json, text/plain, */*",
      "Accept-Language": "en-US,en;q=0.9",
      "Origin": WEB,
      "Referer": WEB + "/",
      "User-Agent": UA,
      "Session-Token": uuid()
    }
  });

  if (!r || !r.ok) {
    throw new Error("MANGA Plus request failed: " + (r && r.status ? r.status : "unknown"));
  }
  return r.body;
}

/* Some deployments return the payload directly; others wrap it in success. */
function success(x) {
  return x && x.success ? x.success : x;
}

function first(obj, keys) {
  if (!obj || typeof obj !== "object") return undefined;
  for (const k of keys) {
    if (obj[k] !== undefined && obj[k] !== null) return obj[k];
  }
  return undefined;
}

function arr(x) {
  return Array.isArray(x) ? x : [];
}

function asString(x) {
  return x === undefined || x === null ? "" : String(x);
}

function normalizeTitle(t) {
  return first(t, ["name", "title", "titleName", "seriesName"]) || "Untitled";
}

function titleId(t) {
  return first(t, ["titleId", "id", "title_id"]);
}

function coverOf(t) {
  return first(t, [
    "portraitImageUrl", "thumbnailUrl", "imageUrl",
    "coverImageUrl", "titleImageUrl", "verticalImageUrl"
  ]);
}

function authorOf(t) {
  const a = first(t, ["author", "authors", "authorName", "artist"]);
  if (Array.isArray(a)) return a.filter(Boolean).join(", ");
  return asString(a);
}

function descriptionOf(t) {
  return first(t, ["description", "overview", "catchCopy", "summary", "introduction"]) || "";
}

function languageName(v) {
  const n = Number(v);
  const map = {
    0: "ja", 1: "en", 2: "es", 3: "fr",
    4: "id", 5: "pt", 6: "ru", 7: "th",
    8: "de", 9: "it", 10: "vi"
  };
  return map[n] || (typeof v === "string" ? v : "en");
}

function chapterId(c) {
  return first(c, ["chapterId", "id", "chapter_id"]);
}

function chapterTitle(c) {
  return first(c, ["subTitle", "subtitle", "name", "title", "chapterName"]) ||
    ("Chapter " + asString(first(c, ["chapter", "chapterNumber", "number"])));
}

function chapterNumber(c) {
  return first(c, ["chapter", "chapterNumber", "number"]);
}

function chapterViews(c) {
  return first(c, ["viewCount", "views", "view_count"]);
}

function chapterDate(c) {
  return first(c, ["startTimeStamp", "publishAt", "publishedAt", "date"]);
}

function isExpired(c) {
  return Boolean(first(c, ["isExpired", "expired", "is_expired"])) ||
    String(first(c, ["status"]) || "").toLowerCase() === "expired";
}

function canonicalTitle(t) {
  const id = titleId(t);
  const lang = languageName(first(t, ["language", "lang"]));
  return {
    id: asString(id),
    title: normalizeTitle(t),
    seriesTitle: normalizeTitle(t),
    altTitle: first(t, ["englishName", "altTitle", "alternativeTitle"]),
    author: authorOf(t),
    cover: coverOf(t),
    description: descriptionOf(t),
    year: Number(first(t, ["year", "startYear"])) || undefined,
    status: first(t, ["status", "serializationStatus"]),
    originalLanguage: lang,
    genres: arr(first(t, ["genres", "genreList", "genre"])).map(x =>
      typeof x === "string" ? x : asString(first(x, ["name", "label"]))
    ).filter(Boolean),
    siteUrl: `${WEB}/titles/${asString(id)}`,
    isFanMade: false
  };
}

/*
 * Extract all likely title objects from a response. This is deliberately
 * tolerant because MANGA Plus has changed V2/V3 response nesting over time.
 */
function collectTitles(node, out = []) {
  if (!node || typeof node !== "object") return out;
  if (Array.isArray(node)) {
    for (const x of node) collectTitles(x, out);
    return out;
  }

  const looksLikeTitle =
    titleId(node) !== undefined &&
    (node.name !== undefined || node.title !== undefined);

  if (looksLikeTitle) out.push(node);

  for (const [k, v] of Object.entries(node)) {
    if (k === "pages" || k === "mangaPage") continue;
    if (v && typeof v === "object") collectTitles(v, out);
  }
  return out;
}

function uniqueById(items) {
  const seen = new Set();
  const out = [];
  for (const x of items) {
    if (!x || !x.id || seen.has(x.id)) continue;
    seen.add(x.id);
    out.push(x);
  }
  return out;
}

function chapterList(detail) {
  const d = success(detail);
  const td = first(d, ["titleDetailView", "title_detail_view"]) || d;

  let raw = [];
  raw.push(...arr(first(td, ["firstChapterList", "first_chapter_list"])));
  raw.push(...arr(first(td, ["lastChapterList", "last_chapter_list"])));

  /*
   * Newer responses may expose chapterList directly.
   * Only use it if the two explicit lists were absent.
   */
  if (!raw.length) {
    raw = arr(first(td, ["chapterList", "chapters", "chapter_list"]));
  }

  const seen = new Set();
  const result = [];

  for (const c of raw) {
    const id = chapterId(c);
    if (id === undefined || isExpired(c) || seen.has(String(id))) continue;
    seen.add(String(id));

    result.push({
      id: String(id),
      chapter: chapterNumber(c) !== undefined ? String(chapterNumber(c)) : undefined,
      title: chapterTitle(c),
      position: undefined,
      publishAt: chapterDate(c) !== undefined ? String(chapterDate(c)) : undefined,
      views: chapterViews(c)
    });
  }

  /*
   * MANGA Plus commonly supplies first/last lists in newest-first form.
   * We keep the source order unless explicit numeric chapter labels are
   * available, then sort numerically. This avoids inventing an order.
   */
  const allNumbered = result.length > 0 &&
    result.every(x => x.chapter !== undefined && /^-?\d+(\.\d+)?$/.test(x.chapter));

  if (allNumbered) {
    result.sort((a, b) => Number(a.chapter) - Number(b.chapter));
    result.forEach((x, i) => x.position = i);
  }

  return result;
}

function pageObjects(viewer) {
  const v = success(viewer);
  const mv = first(v, ["mangaViewer", "manga_viewer"]) || v;
  return arr(first(mv, ["pages", "pageList"]));
}

function imageFromPage(p) {
  const m = first(p, ["mangaPage", "manga_page"]);
  if (!m) return null;

  const url = first(m, ["imageUrl", "imageURL", "image_url"]);
  if (!url || !/^https?:\/\//i.test(String(url))) return null;

  return {
    url: String(url),
    encryptionKey: first(m, ["encryptionKey", "encryption_key"]),
    type: first(m, ["type", "pageType"])
  };
}

async function allTitles() {
  const data = await httpJson(q("/title_list/all_v3", {
    type: "serializing",
    lang: LANG,
    clang: LANG,
    format: "json"
  }));

  return uniqueById(collectTitles(success(data))).map(canonicalTitle);
}

async function detailRaw(id) {
  return httpJson(q("/title_detailV3", {
    title_id: id,
    clang: LANG,
    format: "json"
  }));
}

async function viewerRaw(id) {
  return httpJson(q("/manga_viewer_v3", {
    chapter_id: id,
    split: "yes",
    img_quality: "super_high",
    clang: LANG,
    format: "json"
  }));
}

async function popularRaw() {
  /*
   * Ranking V2 is used when available. If the source changes the ranking
   * response shape, fall back to the complete serializing directory.
   */
  try {
    const data = await httpJson(q("/title_list/rankingV2", {
      clang: LANG,
      format: "json"
    }));
    const titles = uniqueById(collectTitles(success(data))).map(canonicalTitle);
    if (titles.length) return titles;
  } catch (_) {}

  return allTitles();
}

const provider = {
  id: "mangaplus-shueisha",
  name: "MANGA Plus by SHUEISHA",

  async popular(offset, tagId) {
    const start = Number(offset) || 0;
    const source = await popularRaw();

    /*
     * Harbor passes offsets. Keep the source list stable and paginate locally.
     */
    return source.slice(start, start + PAGE_SIZE);
  },

  async search(query, offset, tagId) {
    const start = Number(offset) || 0;
    const qtext = String(query || "").trim().toLowerCase();

    /*
     * MANGA Plus does not expose a simple public text-search endpoint in the
     * API surface used here, so search is performed against the official
     * title directory returned by all_v3.
     */
    let source = await allTitles();

    if (qtext) {
      source = source.filter(x => {
        const fields = [
          x.title, x.seriesTitle, x.altTitle, x.author,
          ...(x.genres || [])
        ].filter(Boolean);
        return fields.some(v => String(v).toLowerCase().includes(qtext));
      });
    }

    return source.slice(start, start + PAGE_SIZE);
  },

  async detail(id) {
    const raw = await detailRaw(id);
    const d = success(raw);
    const td = first(d, ["titleDetailView", "title_detail_view"]) || d;
    const t = first(td, ["title"]) || td;

    if (!titleId(t) && id) t.titleId = id;
    return canonicalTitle(t);
  },

  async chapters(id) {
    const raw = await detailRaw(id);
    return chapterList(raw);
  },

  async content(chapterIdValue) {
    const raw = await viewerRaw(chapterIdValue);
    const d = success(raw);
    const mv = first(d, ["mangaViewer", "manga_viewer"]) || d;

    const pages = pageObjects(raw)
      .map(imageFromPage)
      .filter(Boolean);

    if (!pages.length) {
      throw new Error("No readable pages were returned by MANGA Plus.");
    }

    /*
     * Harbor's content() contract accepts absolute HTTP(S) image URLs.
     * For pages where MANGA Plus marks an encryptionKey, the official viewer
     * applies additional image handling/cookie state. We intentionally do
     * not bypass that protection here. Raw pages are passed through directly.
     */
    const images = pages
      .filter(p => !p.encryptionKey)
      .map(p => p.url);

    if (!images.length) {
      throw new Error(
        "MANGA Plus returned protected image pages. " +
        "Harbor's source API cannot decrypt/proxy those pages without a " +
        "supported authenticated image transport."
      );
    }

    return { images };
  },

  async tags() {
    return [
      { id: "sort:popular", name: "Popular", group: "Sort" },
      { id: "status:ongoing", name: "Ongoing", group: "Status" },
      { id: "status:completed", name: "Completed", group: "Status" }
    ];
  }
};

/*
 * Harbor accepts either a top-level provider object or harbor.register().
 */
if (typeof harbor !== "undefined" && typeof harbor.register === "function") {
  harbor.register(provider);
} else {
  provider;
}
