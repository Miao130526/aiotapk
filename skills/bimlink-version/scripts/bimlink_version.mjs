#!/usr/bin/env node

import { open, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const DEFAULT_BASE_URL = 'https://aiot.aibims.com';
const ENTRY_PATH = '/admin.php?s=/Message/add&model=158&fid=716&mid=717.html';
const ADD_PATH = '/admin.php?s=/Message/add/model/158/fid/716/mid/717.html';
const LOGIN_PATH = '/admin.php?s=/Public/login.html';
const UPLOAD_PATH = '/admin.php?s=/File/uploadFile.html';
const LIST_PATH = '/admin.php?s=/Message/lists/fid/716/mid/716.html';
const CHUNK_SIZE = 1024 * 1024;
const MAX_FILE_SIZE = 300 * 1024 * 1024;

const FLAG_MAP = new Map([
  ['--input', 'input'],
  ['--product-id', 'productId'],
  ['--version', 'version'],
  ['--version-code', 'versionCode'],
  ['--summary', 'summary'],
  ['--release-note', 'releaseNote'],
  ['--version-type', 'versionType'],
  ['--hardware', 'hardware'],
  ['--file', 'file'],
]);

function fail(stage, message, details) {
  const error = new Error(message);
  error.stage = stage;
  if (details !== undefined) error.details = details;
  throw error;
}

function parseArgs(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === '--help' || flag === '-h') {
      result.help = true;
      continue;
    }
    if (flag === '--check-only') {
      result.checkOnly = true;
      continue;
    }
    const key = FLAG_MAP.get(flag);
    if (!key) fail('arguments', `未知参数：${flag}`);
    if (index + 1 >= argv.length) fail('arguments', `参数 ${flag} 缺少值`);
    result[key] = argv[index + 1];
    index += 1;
  }
  return result;
}

function printHelp() {
  console.log(`Bimlink 新增软件版本

用法：
  node bimlink_version.mjs --input request.json
  node bimlink_version.mjs --check-only
  node bimlink_version.mjs --product-id P00000277 --version v1.0.0 \\
    --version-code 100 --summary '概要' --release-note '版本说明' \\
    --file /absolute/path/app.apk

环境变量：
  BIMLINK_USERNAME       登录账号（必填）
  BIMLINK_PASSWORD       登录密码（必填）
  BIMLINK_BASE_URL       站点地址，默认 ${DEFAULT_BASE_URL}

版本类型：1=测试完整，2=发布完整，3=测试增量，4=发布增量，5=固件升级。`);
}

function requiredText(value, name) {
  const text = String(value ?? '').trim();
  if (!text) fail('arguments', `缺少必填项：${name}`);
  return text;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

class BimlinkClient {
  constructor(baseUrl, username, password) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.username = username;
    this.password = password;
    this.cookies = new Map();
  }

  cookieHeader() {
    return [...this.cookies.entries()].map(([name, value]) => `${name}=${value}`).join('; ');
  }

  captureCookies(response) {
    const headers = response.headers;
    const cookies = typeof headers.getSetCookie === 'function'
      ? headers.getSetCookie()
      : (headers.get('set-cookie') ? [headers.get('set-cookie')] : []);
    for (const cookie of cookies) {
      const pair = cookie.split(';', 1)[0];
      const separator = pair.indexOf('=');
      if (separator > 0) {
        this.cookies.set(pair.slice(0, separator).trim(), pair.slice(separator + 1).trim());
      }
    }
  }

  async request(url, options = {}) {
    const headers = new Headers(options.headers || {});
    const cookie = this.cookieHeader();
    if (cookie) headers.set('Cookie', cookie);
    const response = await fetch(url, { ...options, headers, redirect: 'follow' });
    this.captureCookies(response);
    return response;
  }

  async readJson(response, stage) {
    const text = await response.text();
    if (!response.ok) fail(stage, `HTTP ${response.status}`, text.slice(0, 300));
    try {
      return JSON.parse(text);
    } catch {
      fail(stage, '服务器未返回 JSON', text.slice(0, 300));
    }
  }

  async ensureAuthenticated() {
    const entry = await this.request(`${this.baseUrl}${ENTRY_PATH}`);
    const entryHtml = await entry.text();
    if (entryHtml.includes('name="version_code"') && entryHtml.includes('id="select_pid"')) return;

    const body = new URLSearchParams({ username: this.username, password: this.password });
    const login = await this.request(`${this.baseUrl}${LOGIN_PATH}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: body.toString(),
    });
    const loginResult = await this.readJson(login, 'login');
    if (!loginResult.status) fail('login', loginResult.info || '登录失败');

    const check = await this.request(`${this.baseUrl}${ENTRY_PATH}`);
    const checkHtml = await check.text();
    if (!checkHtml.includes('name="version_code"') || !checkHtml.includes('id="select_pid"')) {
      fail('login', '登录接口成功，但新增软件版本页面仍不可访问', check.url);
    }
  }

  async uploadFile(filePath, fileSize) {
    const fileName = path.basename(filePath);
    const handle = await open(filePath, 'r');
    let fileId = '';
    let lastResult = null;
    const uploadDate = String(Math.floor(Date.now() / 1000));
    let index = 1;
    try {
      for (let start = 0; start < fileSize; start += CHUNK_SIZE) {
        const end = Math.min(start + CHUNK_SIZE, fileSize);
        const length = end - start;
        const chunk = Buffer.allocUnsafe(length);
        const { bytesRead } = await handle.read(chunk, 0, length, start);
        if (bytesRead !== length) fail('upload', `读取安装包分片失败：${start}-${end}`);

        const form = new FormData();
        form.append('file', new Blob([chunk]), fileName);
        const query = new URLSearchParams({
          filesize: String(fileSize),
          start: String(start),
          end: String(end),
          index: String(index),
          date: uploadDate,
          extra: '',
        });
        const response = await this.request(`${this.baseUrl}${UPLOAD_PATH}&${query}`, {
          method: 'POST',
          body: form,
        });
        const result = await this.readJson(response, 'upload');
        lastResult = result;
        if (result.code === 'error') fail('upload', result.msg || '上传分片失败', { index, lastResult });
        if (result.id) fileId = String(result.id);
        console.error(JSON.stringify({ stage: 'upload', uploaded: end, total: fileSize }));
        index += 1;
      }
    } finally {
      await handle.close();
    }
    if (!fileId) fail('upload', '上传完成，但服务器没有返回文件 ID', { lastResult });
    return fileId;
  }

  async addVersion(data, fileId) {
    const payload = new URLSearchParams({
      pid: data.productId,
      version: data.version,
      version_code: data.versionCode,
      title: data.summary,
      release_note: data.releaseNote,
      version_type: data.versionType,
      file: fileId,
      update_hardware: data.hardware,
    });
    const response = await this.request(`${this.baseUrl}${ADD_PATH}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: payload.toString(),
    });
    const result = await this.readJson(response, 'submit');
    if (!result.status) fail('submit', result.info || '新增软件版本失败');
    return result;
  }

  async findRecord(productId, version) {
    const response = await this.request(`${this.baseUrl}${LIST_PATH}`);
    const html = await response.text();
    if (!response.ok) return { found: false, reason: `列表请求返回 HTTP ${response.status}` };
    const rows = html.match(/<tr\b[\s\S]*?<\/tr>/gi) || [];
    const escapedVersion = escapeHtml(version);
    const row = rows.find((item) =>
      (item.includes(productId) || item.includes(escapeHtml(productId))) &&
      (item.includes(version) || item.includes(escapedVersion))
    );
    if (!row) return { found: false, reason: '提交成功，但列表首页未找到记录，请人工核对' };
    const id = row.match(/<td\b[^>]*>\s*(\d+)\s*<\/td>/i)?.[1] || null;
    const text = row
      .replace(/<script\b[\s\S]*?<\/script>/gi, '')
      .replace(/<style\b[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/\s+/g, ' ')
      .trim();
    return { found: true, id, text };
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }
  if (Number(process.versions.node.split('.')[0]) < 22) {
    fail('environment', `需要 Node.js 22.20 或更高版本，当前为 ${process.version}`);
  }

  let input = {};
  if (args.input) {
    const inputPath = path.resolve(args.input);
    try {
      input = JSON.parse(await readFile(inputPath, 'utf8'));
    } catch (error) {
      fail('arguments', `无法读取请求 JSON：${inputPath}`, error.message);
    }
  }
  const data = { ...input };
  for (const key of FLAG_MAP.values()) {
    if (key !== 'input' && args[key] !== undefined) data[key] = args[key];
  }

  const username = requiredText(process.env.BIMLINK_USERNAME, '环境变量 BIMLINK_USERNAME');
  const password = requiredText(process.env.BIMLINK_PASSWORD, '环境变量 BIMLINK_PASSWORD');
  const client = new BimlinkClient(process.env.BIMLINK_BASE_URL || DEFAULT_BASE_URL, username, password);

  if (args.checkOnly) {
    await client.ensureAuthenticated();
    console.log(JSON.stringify({ ok: true, checkOnly: true, message: '登录及新增页面访问检查成功' }, null, 2));
    return;
  }

  const normalized = {
    productId: requiredText(data.productId, 'productId'),
    version: requiredText(data.version, 'version'),
    versionCode: requiredText(data.versionCode, 'versionCode'),
    summary: requiredText(data.summary, 'summary'),
    releaseNote: requiredText(data.releaseNote, 'releaseNote'),
    versionType: String(data.versionType ?? '1'),
    hardware: String(data.hardware ?? ''),
    file: requiredText(data.file, 'file'),
  };
  if (!/^\d+$/.test(normalized.versionCode)) fail('arguments', 'versionCode 必须是纯数字');
  if (!['1', '2', '3', '4', '5'].includes(normalized.versionType)) {
    fail('arguments', 'versionType 只能是 1、2、3、4 或 5');
  }

  const filePath = path.resolve(normalized.file);
  const fileInfo = await stat(filePath).catch((error) => fail('file', `安装包不存在或不可读：${filePath}`, error.message));
  if (!fileInfo.isFile()) fail('file', `安装包路径不是文件：${filePath}`);
  if (fileInfo.size <= 0) fail('file', '安装包是空文件');
  if (fileInfo.size > MAX_FILE_SIZE) fail('file', '安装包超过 300 MiB 限制');

  await client.ensureAuthenticated();
  const fileId = await client.uploadFile(filePath, fileInfo.size);
  const submitResponse = await client.addVersion(normalized, fileId);
  const record = await client.findRecord(normalized.productId, normalized.version);

  console.log(JSON.stringify({
    ok: true,
    productId: normalized.productId,
    version: normalized.version,
    versionCode: normalized.versionCode,
    fileId,
    submitResponse,
    record,
  }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({
    ok: false,
    stage: error.stage || 'unknown',
    error: error.message,
    ...(error.details !== undefined ? { details: error.details } : {}),
  }, null, 2));
  process.exitCode = 1;
});
