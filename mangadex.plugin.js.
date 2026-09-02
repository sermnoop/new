// Harbor eBook source plugin for MangaDex
const API = "https://api.mangadex.org";
const CDN = "https://uploads.mangadex.org";

async function getJson(endpoint) {
  const res = await harbor.http(API + endpoint, {
    method: "GET",
    responseType: "json",
    timeoutMs: 20000,
    headers: {
      "User-Agent": "Harbor-eBook-Plugin/1.0",
      "Accept": "application/json",
    },
  });
  if (!res || !res.ok) {
    throw new Error("MangaDex HTTP " + (res?.status || "error") + " on " + endpoint);
  }
  return res.body;
}

function parseManga(manga) {
  if (!manga || !manga.id) return null;
  const attr = manga.attributes || {};
  const rels = manga.relationships || [];

  // Title preference: English -> Japanese romaji -> first available
  const title =
    attr.title?.en ||
    attr.title?.["ja-ro"] ||
    Object.values(attr.title || {})[0] ||
    "Untitled";

  // Cover art filename from relationships
  const coverRel = rels.find((r) => r.type === "cover_art");
  const coverFileName = coverRel?.attributes?.fileName;
  const cover = coverFileName
    ? `${CDN}/covers/${manga.id}/${coverFileName}.512.jpg`
    : undefined;

  // Author from relationships
  const authorRel = rels.find((r) => r.type === "author" || r.type === "artist");
  const author = authorRel?.attributes?.name;

  return {
    id: manga.id,
    title,
    author,
    description: attr.description?.en || Object.values(attr.description || {})[0] || undefined,
    cover,
    status: attr.status || "ongoing",
    year: attr.year || undefined,
    originalLanguage: attr.originalLanguage || "ja",
    siteUrl: `https://mangadex.org/title/${manga.id}`,
  };
}

const plugin = {
  id: "mangadex-source",
  name: "MangaDex",

  async popular(offset) {
    const limit = 32;
    const off = Number(offset) || 0;
    const data = await getJson(
      `/manga?limit=${limit}&offset=${off}&includes[]=cover_art&includes[]=author&order[followedCount]=desc&contentRating[]=safe&contentRating[]=suggestive`
    );
    return (data?.data || []).map(parseManga).filter(Boolean);
  },

  async search(query, offset) {
    const limit = 32;
    const off = Number(offset) || 0;
    const data = await getJson(
      `/manga?limit=${limit}&offset=${off}&title=${encodeURIComponent(query)}&includes[]=cover_art&includes[]=author&contentRating[]=safe&contentRating[]=suggestive`
    );
    return (data?.data || []).map(parseManga).filter(Boolean);
  },

  async detail(id) {
    const data = await getJson(`/manga/${id}?includes[]=cover_art&includes[]=author`);
    return parseManga(data?.data);
  },

  async chapters(id) {
    // Fetches translated chapters in English, sorted ascending
    const data = await getJson(
      `/manga/${id}/feed?translatedLanguage[]=en&order[chapter]=asc&limit=100&contentRating[]=safe&contentRating[]=suggestive`
    );
    const list = data?.data || [];

    return list.map((item, idx) => {
      const attr = item.attributes || {};
      return {
        id: item.id,
        chapter: attr.chapter || String(idx + 1),
        title: attr.title || undefined,
        position: idx,
        publishAt: attr.publishAt || undefined,
        volume: attr.volume ?? undefined,
      };
    });
  },

  async content(chapterId) {
    // Resolves standard MangaDex@Home direct image nodes
    const data = await getJson(`/at-home/server/${chapterId}`);
    const host = data?.baseUrl;
    const hash = data?.chapter?.hash;
    const fileNames = data?.chapter?.data || [];

    if (!host || !hash || !fileNames.length) {
      throw new Error("No readable pages found for this chapter.");
    }

    const images = fileNames.map((file) => `${host}/data/${hash}/${file}`);
    return { images };
  },
};

if (typeof harbor !== "undefined" && harbor.register) {
  harbor.register(plugin);
}
