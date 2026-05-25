/**
 * ASSRT 字幕搜索下载模块
 * 
 * 功能：
 * 1. 根据关键词或视频文件名搜索字幕
 * 2. 查看字幕详情和下载链接
 * 3. 支持下载压缩包内的单个文件
 * 
 * 使用前需要在全局参数中配置 ASSRT API Token
 * Token 获取地址：https://assrt.net/usercp.php
 */

const API_BASE = "https://api.assrt.net/v1";

WidgetMetadata = {
  id: "forward.assrt",
  title: "ASSRT 字幕",
  version: "1.0.0",
  requiredVersion: "0.0.1",
  description: "从 ASSRT.net 搜索和下载字幕。支持智能文件名匹配，显示字幕详情，下载压缩包内的单个文件",
  author: "Forward",
  site: "https://assrt.net",
  detailCacheDuration: 300,
  
  globalParams: [
    {
      name: "token",
      title: "API Token",
      type: "input",
      description: "在 assrt.net/usercp.php 获取你的 API Token",
      value: "",
    },
  ],
  
  modules: [
    {
      id: "searchSubtitle",
      title: "搜索字幕",
      description: "根据关键词搜索字幕",
      functionName: "searchSubtitle",
      cacheDuration: 600,
      params: [
        {
          name: "keyword",
          title: "搜索关键词",
          type: "input",
          description: "输入视频名称或关键词",
          value: "",
          placeholders: [
            { title: "示例：Inception", value: "Inception" },
            { title: "示例：Breaking Bad S01", value: "Breaking Bad S01" },
          ],
        },
        {
          name: "searchMode",
          title: "搜索模式",
          type: "enumeration",
          description: "选择搜索模式",
          value: "normal",
          enumOptions: [
            { title: "普通搜索", value: "normal", description: "使用关键词直接搜索" },
            { title: "文件名匹配", value: "filename", description: "智能识别视频文件名" },
            { title: "忽略压制组", value: "no_muxer", description: "忽略文件名中的压制组信息" },
          ],
        },
        {
          name: "page",
          title: "页码",
          type: "page",
          value: 1,
        },
      ],
    },
    {
      id: "getSubtitleDetail",
      title: "字幕详情",
      description: "获取字幕详细信息",
      functionName: "getSubtitleDetail",
      cacheDuration: 300,
      params: [
        {
          name: "subtitleId",
          title: "字幕ID",
          type: "input",
          description: "字幕的ID",
          value: "",
        },
      ],
    },
  ],
  
  search: {
    title: "搜索字幕",
    functionName: "searchSubtitle",
    params: [
      {
        name: "keyword",
        title: "搜索关键词",
        type: "input",
        description: "输入视频名称或关键词",
        placeholders: [
          { title: "Inception", value: "Inception" },
          { title: "Breaking Bad", value: "Breaking Bad" },
        ],
      },
      {
        name: "searchMode",
        title: "搜索模式",
        type: "enumeration",
        value: "normal",
        enumOptions: [
          { title: "普通搜索", value: "normal" },
          { title: "文件名匹配", value: "filename" },
          { title: "忽略压制组", value: "no_muxer" },
        ],
      },
    ],
  },
};

async function searchSubtitle(params = {}) {
  const token = params.token || Widget.storage.get("assrt_token");
  
  if (!token) {
    throw new Error("请先配置 ASSRT API Token");
  }
  
  const keyword = (params.keyword || "").trim();
  if (!keyword) {
    throw new Error("请输入搜索关键词");
  }
  
  if (keyword.length < 3) {
    throw new Error("搜索关键词长度必须大于3个字符");
  }
  
  const page = params.page || 1;
  const cnt = 15;
  const pos = (page - 1) * cnt;
  
  const searchMode = params.searchMode || "normal";
  
  try {
    let url = `${API_BASE}/sub/search?token=${encodeURIComponent(token)}&q=${encodeURIComponent(keyword)}&cnt=${cnt}&pos=${pos}`;
    
    if (searchMode === "filename") {
      url += "&is_file=1";
    } else if (searchMode === "no_muxer") {
      url += "&no_muxer=1";
    }
    
    const response = await Widget.http.get(url, {
      headers: {
        "User-Agent": "ForwardWidgets/1.0.0",
        "Accept": "application/json",
      },
    });
    
    const data = response.data;
    
    if (data.status !== 0) {
      throw new Error(_getErrorMessage(data.status));
    }
    
    if (!data.sub || !data.sub.subs || data.sub.subs.length === 0) {
      return [];
    }
    
    return data.sub.subs.map(sub => _formatSubtitleItem(sub));
    
  } catch (error) {
    console.error("[ASSRT] 搜索失败:", error.message || error);
    throw error;
  }
}

async function getSubtitleDetail(params = {}) {
  const token = params.token || Widget.storage.get("assrt_token");
  
  if (!token) {
    throw new Error("请先配置 ASSRT API Token");
  }
  
  const subtitleId = params.subtitleId;
  if (!subtitleId) {
    throw new Error("请提供字幕ID");
  }
  
  try {
    const url = `${API_BASE}/sub/detail?token=${encodeURIComponent(token)}&id=${subtitleId}`;
    
    const response = await Widget.http.get(url, {
      headers: {
        "User-Agent": "ForwardWidgets/1.0.0",
        "Accept": "application/json",
      },
    });
    
    const data = response.data;
    
    if (data.status !== 0) {
      throw new Error(_getErrorMessage(data.status));
    }
    
    if (!data.sub || !data.sub.subs || data.sub.subs.length === 0) {
      throw new Error("未找到字幕详情");
    }
    
    const sub = data.sub.subs[0];
    
    return {
      id: sub.id.toString(),
      type: "url",
      title: sub.native_name || sub.title || sub.filename,
      description: _buildDescription(sub),
      videoUrl: sub.url,
      childItems: sub.filelist ? sub.filelist.map(file => ({
        id: `${sub.id}_${file.f}`,
        type: "url",
        title: file.f,
        description: `文件大小: ${file.s}`,
        videoUrl: file.url,
      })) : null,
    };
    
  } catch (error) {
    console.error("[ASSRT] 获取详情失败:", error.message || error);
    throw error;
  }
}

function _formatSubtitleItem(sub) {
  const item = {
    id: sub.id.toString(),
    type: "url",
    title: sub.native_name || sub.videoname || `字幕 ${sub.id}`,
    description: _buildSubtitleDescription(sub),
  };
  
  if (sub.videoname) {
    item.description = `视频: ${sub.videoname}\n${item.description}`;
  }
  
  return item;
}

function _buildSubtitleDescription(sub) {
  const parts = [];
  
  if (sub.lang && sub.lang.desc) {
    parts.push(`语言: ${sub.lang.desc}`);
  }
  
  if (sub.subtype) {
    parts.push(`格式: ${sub.subtype}`);
  }
  
  if (sub.release_site) {
    parts.push(`来源: ${sub.release_site}`);
  }
  
  if (sub.upload_time) {
    parts.push(`上传: ${sub.upload_time}`);
  }
  
  if (sub.vote_score && sub.vote_score > 0) {
    parts.push(`评分: ${sub.vote_score}`);
  }
  
  return parts.join(" | ");
}

function _buildDescription(sub) {
  const parts = [];
  
  if (sub.filename) {
    parts.push(`文件名: ${sub.filename}`);
  }
  
  if (sub.size) {
    parts.push(`大小: ${_formatFileSize(sub.size)}`);
  }
  
  if (sub.lang && sub.lang.desc) {
    parts.push(`语言: ${sub.lang.desc}`);
  }
  
  if (sub.subtype) {
    parts.push(`格式: ${sub.subtype}`);
  }
  
  if (sub.release_site) {
    parts.push(`来源: ${sub.release_site}`);
  }
  
  if (sub.upload_time) {
    parts.push(`上传时间: ${sub.upload_time}`);
  }
  
  if (sub.vote_score !== undefined) {
    parts.push(`评分: ${sub.vote_score}`);
  }
  
  if (sub.view_count) {
    parts.push(`浏览: ${sub.view_count}`);
  }
  
  if (sub.down_count) {
    parts.push(`下载: ${sub.down_count}`);
  }
  
  if (sub.producer) {
    const producerInfo = [];
    if (sub.producer.uploader) {
      producerInfo.push(`上传者: ${sub.producer.uploader}`);
    }
    if (sub.producer.producer) {
      producerInfo.push(`制作: ${sub.producer.producer}`);
    }
    if (sub.producer.source) {
      producerInfo.push(`来源: ${sub.producer.source}`);
    }
    if (producerInfo.length > 0) {
      parts.push(producerInfo.join(" | "));
    }
  }
  
  return parts.join("\n");
}

function _formatFileSize(bytes) {
  if (bytes < 1024) {
    return `${bytes}B`;
  } else if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(2)}KB`;
  } else {
    return `${(bytes / (1024 * 1024)).toFixed(2)}MB`;
  }
}

function _getErrorMessage(status) {
  const errorMessages = {
    1: "用户不存在",
    101: "搜索关键词长度必须大于3个字符",
    20000: "请求缺少参数",
    20001: "Token 无效",
    20400: "API 端点不存在",
    20900: "字幕不存在",
    30000: "服务器错误",
    30001: "数据库不可用",
    30002: "搜索引擎不可用",
    30300: "API 暂时不可用",
    30900: "请求频率超限（每分钟最多20次）",
  };
  
  return errorMessages[status] || `未知错误 (状态码: ${status})`;
}
