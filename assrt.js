/**
 * ASSRT 字幕搜索模块
 * 支持在播放视频时自动搜索和加载字幕
 */

var WidgetMetadata = {
  id: "forward.assrt.subtitle",
  title: "ASSRT 字幕",
  version: "1.0.0",
  requiredVersion: "0.0.1",
  description: "基于 ASSRT API 的字幕搜索",
  author: "Yuan",
  site: "https://assrt.net",
  globalParams: [
    {
      name: "token",
      title: "API Token",
      type: "input",
      description: "在 assrt.net/usercp.php 获取",
    },
  ],
  modules: [
    {
      id: "loadSubtitle",
      title: "加载字幕",
      functionName: "loadSubtitle",
      type: "subtitle",
      params: [
        {
          name: "customKeyword",
          title: "自定义搜索",
          type: "input",
          description: "留空则自动匹配，填写则使用自定义关键词",
        },
      ],
    },
  ],
};

var API_BASE = "https://api.assrt.net/v1";

function getText(value) {
  return String(value || "").trim();
}

function getLangTag(langDesc) {
  if (!langDesc) return "【字幕】";
  var t = String(langDesc).toLowerCase();
  if (t.includes("简") || t.includes("chs")) return "【简中】";
  if (t.includes("繁") || t.includes("cht")) return "【繁中】";
  if (t.includes("双语") || t.includes("中英")) return "【双语】";
  if (t.includes("英") || t.includes("eng")) return "【英文】";
  return "【字幕】";
}

function getExt(filename) {
  if (!filename) return ".srt";
  var s = String(filename).toLowerCase();
  if (s.endsWith(".srt")) return ".srt";
  if (s.endsWith(".ass")) return ".ass";
  if (s.endsWith(".ssa")) return ".ssa";
  return ".srt";
}

function buildSearchKeys(params) {
  var customKeyword = getText(params.customKeyword);
  
  if (customKeyword) {
    return [customKeyword];
  }
  
  var title = getText(params.title || params.seriesName);
  var season = params.season;
  var episode = params.episode;
  
  if (!title) return [];
  
  var keys = [];
  var hasSeason = !isNaN(season) && season > 0;
  var hasEpisode = !isNaN(episode) && episode > 0;
  
  if (hasSeason && hasEpisode) {
    var sStr = String(season).padStart(2, "0");
    var eStr = String(episode).padStart(2, "0");
    keys.push(title + " S" + sStr + "E" + eStr);
    keys.push(title + " " + sStr + "x" + eStr);
  } else if (hasEpisode) {
    var eStr = String(episode).padStart(2, "0");
    keys.push(title + " E" + eStr);
  }
  
  if (hasSeason) {
    var sStr = String(season).padStart(2, "0");
    keys.push(title + " S" + sStr);
  }
  
  keys.push(title);
  
  return keys;
}

async function searchSub(token, keyword) {
  var url = API_BASE + "/sub/search?token=" + encodeURIComponent(token) + "&q=" + encodeURIComponent(keyword) + "&cnt=10&is_file=1";
  
  try {
    var response = await Widget.http.get(url, {
      headers: {
        "User-Agent": "ForwardWidgets/1.0.0",
      },
    });
    
    var data = response.data;
    
    if (data.status !== 0) {
      console.warn("[ASSRT] 搜索失败: " + data.status);
      return [];
    }
    
    if (!data.sub || !data.sub.subs) {
      return [];
    }
    
    return data.sub.subs;
  } catch (error) {
    console.warn("[ASSRT] 搜索错误: " + error.message);
    return [];
  }
}

async function getSubtitleDetail(token, subtitleId) {
  var url = API_BASE + "/sub/detail?token=" + encodeURIComponent(token) + "&id=" + subtitleId;
  
  try {
    var response = await Widget.http.get(url, {
      headers: {
        "User-Agent": "ForwardWidgets/1.0.0",
      },
    });
    
    var data = response.data;
    
    if (data.status !== 0 || !data.sub || !data.sub.subs || !data.sub.subs[0]) {
      return null;
    }
    
    return data.sub.subs[0];
  } catch (error) {
    console.warn("[ASSRT] 获取详情错误: " + error.message);
    return null;
  }
}

async function loadSubtitle(params) {
  var token = params.token;
  
  if (!token) {
    console.warn("[ASSRT] 未配置 Token");
    return [];
  }
  
  var searchKeys = buildSearchKeys(params);
  
  if (searchKeys.length === 0) {
    return [];
  }
  
  var allSubs = [];
  
  for (var i = 0; i < searchKeys.length; i++) {
    var keyword = searchKeys[i];
    var list = await searchSub(token, keyword);
    
    if (list.length > 0) {
      allSubs = list;
      break;
    }
  }
  
  if (allSubs.length === 0) {
    return [];
  }
  
  var result = [];
  var existKey = new Set();
  var maxResultCount = 10;
  
  for (var i = 0; i < allSubs.length && result.length < maxResultCount; i++) {
    var sub = allSubs[i];
    var subtitleId = String(sub.id);
    
    var dedupeKey = subtitleId;
    if (existKey.has(dedupeKey)) continue;
    existKey.add(dedupeKey);
    
    var detail = await getSubtitleDetail(token, subtitleId);
    
    if (!detail || !detail.url) continue;
    
    var langDesc = detail.lang && detail.lang.desc ? detail.lang.desc : "";
    var langTag = getLangTag(langDesc);
    var filename = detail.filename || sub.native_name || "字幕";
    var ext = getExt(filename);
    
    var subtitleUrl = detail.url;
    var title = langTag + filename.replace(/\.(srt|ass|ssa|zip|rar|7z)$/i, "") + ext;
    
    result.push({
      id: subtitleId,
      title: title,
      lang: langDesc || "未知",
      count: sub.vote_score || 0,
      url: subtitleUrl,
    });
    
    if (detail.filelist && detail.filelist.length > 0) {
      for (var j = 0; j < detail.filelist.length && result.length < maxResultCount; j++) {
        var file = detail.filelist[j];
        var fileExt = getExt(file.f);
        var fileTitle = langTag + file.f.replace(/\.(srt|ass|ssa)$/i, "") + fileExt;
        
        result.push({
          id: subtitleId + "_" + j,
          title: fileTitle,
          lang: langDesc || "未知",
          count: 0,
          url: file.url,
        });
      }
    }
  }
  
  return result;
}
