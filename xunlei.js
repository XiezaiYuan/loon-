WidgetMetadata = {
  id: "xunlei.subtitle",
  title: "迅雷看看 字幕",
  version: "1.0.0",
  requiredVersion: "0.0.1",
  description: "基于迅雷看看接口的字幕搜索 - 仅支持按片名搜索",
  author: "EL",
  site: "https://www.xunlei.com/",
  globalParams: [],
  modules: [
    {
      id: "loadSubtitle",
      title: "加载字幕",
      functionName: "loadSubtitle",
      type: "subtitle",
      params: [],
    },
  ],
};

const API_BASE = "https://api-shoulei-ssl.xunlei.com";

function getText(value) {
  return String(value || "").trim();
}

function getLangTag(langStr) {
  if (!langStr) return "【其他】";
  const t = String(langStr).toLowerCase();
  if (t.includes("简") || t.includes("chs") || t.includes("zho") || t.includes("chi")) return "【简中】";
  if (t.includes("繁") || t.includes("cht")) return "【繁中】";
  if (t.includes("双语") || t.includes("中英")) return "【双语】";
  if (t.includes("英") || t.includes("eng")) return "【英文】";
  return "【字幕】";
}

function formatDownload(num) {
  const n = Number(num) || 0;
  if (n >= 10000) return (n / 10000).toFixed(1) + "w";
  if (n >= 1000) return (n / 1000).toFixed(1) + "k";
  return String(n);
}

function getExt(name) {
  if (!name) return "";
  const s = String(name).toLowerCase();
  if (s.endsWith(".srt")) return ".srt";
  if (s.endsWith(".ass")) return ".ass";
  if (s.endsWith(".ssa")) return ".ssa";
  return "";
}

function extractSearchCode(text) {
  const s = getText(text).toUpperCase();
  if (!s) return "";

  const normalized = s
    .replace(/\./g, " ")
    .replace(/_/g, "-")
    .replace(/\s+/g, " ")
    .trim();

  const patterns = [
    /\bFC2(?:[- ]?PPV)?[- ]?\d{5,8}\b/,
    /\bCARIB[- ]?\d{6,8}\b/,
    /\b1PONDO[- ]?\d{6,8}\b/,
    /\bHEYZO[- ]?\d{3,6}\b/,
    /\bT28[- ]?\d{6,8}\b/,
    /\b(?:S2M|MIAA|SSNI|SNIS|IPX|IPZZ|SSIS|JUQ|MIDE|MIDE|MIDV|STARS|ABW|RKI|DVAJ|WANZ|LULU|DLDSS|VRTM|SDMU|SDDE|MKMP|HMN|MUDR|ADN|CAWD|PPPE|PRED|MGR|SHKD|MXGS|FSDSS|JUL|KTB|MIAB|GVH|MIMK|JUY|JUTA|IDBD|HND|DASD|CLO|BF|HONB|ROE|CEMD|MIUM|NITR|RCTD|RCT|IPVR|MIBD|JUR|JURD|SOE|ORE|PYO)\s*[-_ ]?\d{2,6}[A-Z]?(?:[-_ ]?[A-Z]{0,4})?\b/,
    /\b[A-Z]{2,10}\s*[-_ ]?\d{2,8}[A-Z]?\b/,
    /\b\d{6,8}\b/
  ];

  for (const reg of patterns) {
    const match = normalized.match(reg);
    if (match?.[0]) {
      return match[0]
        .replace(/\s+/g, "")
        .replace(/_/g, "-")
        .replace(/-+/g, "-")
        .toUpperCase();
    }
  }
  return "";
}

function detectMediaType(params) {
  const explicit = getText(params?.mediaType).toLowerCase();
  if (explicit === "movie" || explicit === "film") return "movie";
  if (explicit === "tv" || explicit === "series" || explicit === "episode") return "tv";

  const season = Number(params?.season);
  const episode = Number(params?.episode);
  if ((!Number.isNaN(season) && season > 0) || (!Number.isNaN(episode) && episode > 0)) {
    return "tv";
  }

  const title = getText(params?.title) || getText(params?.seriesName);
  if (/S\d{1,2}E\d{1,2}/i.test(title) || /Season\s*\d+\s*Episode\s*\d+/i.test(title) || /第\s*\d+\s*集/.test(title)) {
    return "tv";
  }

  return "movie";
}

function buildSearchKeys(params, mediaType) {
  const { title, seriesName, season, episode } = params;
  const mainName = getText(title || seriesName);
  if (!mainName) return [];

  const keys = [];
  const avCode = extractSearchCode(mainName);
  if (avCode) {
    const titlePart = mainName.replace(new RegExp(avCode.replace(/[-_]/g, "[-_]?"), "i"), "").replace(/^[\s\-_:]+|[\s\-_:]+$/g, "").trim();
    const compactCode = avCode.replace(/[-_ ]/g, "");
    keys.push(avCode);
    keys.push(compactCode);
    if (titlePart && titlePart !== avCode) keys.push(`${avCode} ${titlePart}`);
    if (titlePart && titlePart !== compactCode) keys.push(`${compactCode} ${titlePart}`);
  }

  if (mediaType === "tv") {
    const s = Number(season);
    const e = Number(episode);
    const hasSeason = !Number.isNaN(s) && s > 0;
    const hasEpisode = !Number.isNaN(e) && e > 0;
    const keys = [];

    if (hasSeason && hasEpisode) {
      const sStr = String(s).padStart(2, "0");
      const eStr = String(e).padStart(2, "0");
      keys.push(`${mainName} S${sStr}E${eStr}`);
      keys.push(`${mainName} ${sStr}x${eStr}`);
    } else if (hasEpisode) {
      const eStr = String(e).padStart(2, "0");
      keys.push(`${mainName} E${eStr}`);
    }
    if (hasSeason) {
      const sStr = String(s).padStart(2, "0");
      keys.push(`${mainName} S${sStr}`);
    }
    keys.push(mainName);
    return [...new Set(keys)].filter(k => k.length >= 2);
  }

  keys.push(mainName);
  return [...new Set(keys)].filter(k => k.length >= 2);
}

function scoreItem(item, params, mediaType) {
  const title = getText(params?.title || params?.seriesName).toLowerCase();
  const season = Number(params?.season);
  const episode = Number(params?.episode);
  const sStr = !Number.isNaN(season) && season > 0 ? String(season).padStart(2, "0") : "";
  const eStr = !Number.isNaN(episode) && episode > 0 ? String(episode).padStart(2, "0") : "";
  const text = (getText(item?.name) + " " + getText(item?.langs) + " " + getText(item?.ext)).toLowerCase();
  let score = Number(item?.cid_match ? 100000 : 0) + (Number(item?.down_count) || 0) / 10000;

  if (mediaType === "tv") {
    if (sStr && eStr && text.includes(`s${sStr}e${eStr}`)) score += 10000;
    else if (sStr && eStr && text.includes(`${sStr}x${eStr}`)) score += 9000;
    else if (sStr && text.includes(`s${sStr}`)) score += 5000;
  } else if (title && text.includes(title)) {
    score += 1000;
  }

  return score;
}

async function searchSub(key) {
  const url = `${API_BASE}/oracle/subtitle?name=${encodeURIComponent(key)}`;
  try {
    const res = await Widget.http.get(url, {
      headers: {
        "User-Agent": "ForwardWidgets/1.0.2",
        Accept: "*/*",
      }
    });
    const data = res?.data;
    if (!data || Number(data.code) !== 0 || !Array.isArray(data.data)) {
      console.warn(`[xunlei] search "${key}" failed: code=${data?.code} msg=${data?.msg || data?.message}`);
      return [];
    }
    return data.data;
  } catch (err) {
    console.warn(`[xunlei] search "${key}" error:`, err?.message || err);
    return [];
  }
}

function normalizeResult(item) {
  return {
    id: item?.url || item?.id || item?.name || Math.random().toString(36).slice(2),
    name: getText(item?.name || item?.title || item?.filename || "迅雷字幕"),
    langs: getText(item?.langs || item?.lang || item?.language || ""),
    ext: getText(item?.ext || item?.format || getExt(item?.name) || ".srt"),
    url: getText(item?.url),
    down_count: Number(item?.down_count || item?.download || item?.downloads || 0),
    cid_match: Boolean(item?.cid_match),
  };
}

async function loadSubtitle(params) {
  const mediaType = detectMediaType(params);
  const searchKeys = buildSearchKeys(params, mediaType);
  if (searchKeys.length === 0) return [];

  let allSubs = [];
  for (const word of searchKeys) {
    const list = await searchSub(word);
    if (list.length > 0) {
      allSubs = list;
      break;
    }
  }

  if (allSubs.length === 0) return [];

  const titleLower = getText(params?.title || params?.seriesName).toLowerCase();
  const avCode = titleLower ? extractSearchCode(titleLower) : "";
  if (titleLower) {
    const avCodeLoose = avCode ? avCode.replace(/[-_ ]/g, "").toLowerCase() : "";
    const matched = allSubs.filter(item => {
      const text = (getText(item?.name) + " " + getText(item?.langs) + " " + getText(item?.ext)).toLowerCase();
      const textLoose = text.replace(/[-_ ]/g, "");
      if (avCode && (text.includes(avCode.toLowerCase()) || textLoose.includes(avCodeLoose))) return true;
      return text.includes(titleLower) || titleLower.includes(text);
    });
    if (matched.length === 0) {
      return [];
    }
    allSubs = matched;
  }

  const scored = allSubs.map(raw => {
    const item = normalizeResult(raw);
    return { item, score: scoreItem(item, params, mediaType) };
  });
  scored.sort((a, b) => b.score - a.score);

  const result = [];
  const existKey = new Set();
  const maxResultCount = 10;

  for (const { item } of scored) {
    if (result.length >= maxResultCount) break;
    if (!item.url) continue;

    const dedupeKey = `${item.name.toLowerCase()}|${item.url}`;
    if (existKey.has(dedupeKey)) continue;
    existKey.add(dedupeKey);

    const langTag = avCode ? "【简中】" : getLangTag(item.langs);
    const cleanName = item.name.replace(/\.(srt|ass|ssa|zip|rar|7z)$/i, "");
    const ext = getExt(item.name) || item.ext || ".srt";

    result.push({
      id: item.id,
      title: `${langTag}${cleanName}${ext}`,
      lang: avCode ? "简中" : (item.langs || "未知"),
      count: item.cid_match ? 100000 : 0,
      url: item.url
    });
  }

  return result;
}
