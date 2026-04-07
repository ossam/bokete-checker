/**
 * ボケて セレクト専用チェックツール — Google Apps Script バックエンド
 *
 * 使い方:
 * 1. Google Apps Script エディタにこのコードを貼り付ける
 * 2. デプロイ → 新しいデプロイ → ウェブアプリ
 *    - 実行するユーザー: 自分
 *    - アクセスできるユーザー: 全員
 * 3. 発行されたURLをフロントエンドの GAS_URL に設定
 */

var SPREADSHEET_ID = '1Jwgs4wXtMtPjKuLu08EwuBX1pZ4X95MF_0n5qiK2akU';
var SHEET_NAME = 'flickrボケ2026';
var HEADER_ROW = 2;
var DATA_START_ROW = 3;

// Column indices (0-based from column A)
var COL_DATE = 1;        // B: 追加日
var COL_RATING = 2;      // C: オススメ
var COL_URL = 3;         // D: URL
var COL_TEXT = 4;         // E: テキスト
var COL_ID = 5;           // F: ID
var COL_JUDGMENT = 8;     // I: 判定 (OK/NG)
var COL_IMAGE_CACHE = 36; // AK: 画像URLキャッシュ（既存データと干渉しない十分右の列）
var COL_PHOTO_BY = 37;    // AL: photo by キャッシュ
var COL_ODAI_BY = 38;     // AM: odai by キャッシュ
var COL_BOKE_BY = 39;     // AN: boke by キャッシュ

/**
 * GET リクエスト処理
 */
function doGet(e) {
  var action = (e && e.parameter && e.parameter.action) ? e.parameter.action : 'getData';
  var result;

  try {
    if (action === 'getData') {
      result = getData();
    } else if (action === 'getImage') {
      var bokeId = e.parameter.bokeId;
      result = getImageUrl(bokeId);
    } else if (action === 'getMeta') {
      var bokeId2 = e.parameter.bokeId;
      result = getMeta(bokeId2);
    } else {
      result = { error: 'Unknown action: ' + action };
    }
  } catch (err) {
    result = { error: err.toString() };
  }

  // JSONP or JSON response
  var callback = (e && e.parameter) ? e.parameter.callback : null;
  var jsonStr = JSON.stringify(result);

  if (callback) {
    return ContentService
      .createTextOutput(callback + '(' + jsonStr + ')')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }

  return ContentService
    .createTextOutput(jsonStr)
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * POST リクエスト処理
 */
function doPost(e) {
  var result;

  try {
    var params = JSON.parse(e.postData.contents);
    var action = params.action;

    if (action === 'updateRating') {
      result = updateRating(params.row, params.rating);
    } else if (action === 'batchUpdateRating') {
      result = batchUpdateRating(params.updates);
    } else if (action === 'updateJudgment') {
      result = updateJudgment(params.row, params.judgment);
    } else {
      result = { error: 'Unknown action: ' + action };
    }
  } catch (err) {
    result = { error: err.toString() };
  }

  return ContentService
    .createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * スプレッドシートからデータ取得
 */
function getData() {
  var sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_NAME);
  var lastRow = sheet.getLastRow();

  if (lastRow < DATA_START_ROW) {
    return { data: [] };
  }

  var range = sheet.getRange(DATA_START_ROW, 1, lastRow - DATA_START_ROW + 1, COL_BOKE_BY + 1);
  var values = range.getValues();
  var data = [];

  for (var i = 0; i < values.length; i++) {
    var row = values[i];
    var bokeId = row[COL_ID];

    if (!bokeId) continue; // IDがない行はスキップ

    var ratingStr = (row[COL_RATING] || '').toString().trim();
    var ratingNum = 0;
    if (ratingStr === '★★★') ratingNum = 3;
    else if (ratingStr === '★★') ratingNum = 2;
    else if (ratingStr === '★') ratingNum = 1;

    // 日付のフォーマット
    var dateStr = '';
    var dateVal = row[COL_DATE];
    if (dateVal instanceof Date) {
      dateStr = Utilities.formatDate(dateVal, 'Asia/Tokyo', 'M/d');
    } else if (dateVal) {
      dateStr = dateVal.toString();
    }

    var imageUrl = row[COL_IMAGE_CACHE] || '';
    var judgment = (row[COL_JUDGMENT] || '').toString().trim().toUpperCase();
    if (judgment !== 'OK' && judgment !== 'NG') judgment = '';

    data.push({
      rowIndex: i + DATA_START_ROW,
      date: dateStr,
      rating: ratingNum,
      ratingRaw: ratingStr,
      judgment: judgment,
      text: (row[COL_TEXT] || '').toString(),
      bokeId: bokeId.toString(),
      bokeUrl: (row[COL_URL] || '').toString(),
      imageUrl: imageUrl.toString(),
      photoBy: (row[COL_PHOTO_BY] || '').toString(),
      odaiBy: (row[COL_ODAI_BY] || '').toString(),
      bokeBy: (row[COL_BOKE_BY] || '').toString()
    });
  }

  return { data: data };
}

/**
 * bokete.jpから画像URLを取得してキャッシュ
 */
function getImageUrl(bokeId) {
  if (!bokeId) return { error: 'bokeId is required' };

  var sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_NAME);
  var lastRow = sheet.getLastRow();
  var idRange = sheet.getRange(DATA_START_ROW, COL_ID + 1, lastRow - DATA_START_ROW + 1, 1);
  var ids = idRange.getValues();

  var targetRow = -1;
  for (var i = 0; i < ids.length; i++) {
    if (ids[i][0].toString() === bokeId.toString()) {
      targetRow = i + DATA_START_ROW;
      break;
    }
  }

  if (targetRow === -1) {
    return { error: 'bokeId not found: ' + bokeId };
  }

  // キャッシュ確認
  var cachedUrl = sheet.getRange(targetRow, COL_IMAGE_CACHE + 1).getValue();
  if (cachedUrl) {
    return { imageUrl: cachedUrl.toString(), cached: true };
  }

  // bokete.jpからスクレイピング
  var imageUrl = scrapeBokeImageUrl(bokeId);

  if (imageUrl) {
    sheet.getRange(targetRow, COL_IMAGE_CACHE + 1).setValue(imageUrl);
    return { imageUrl: imageUrl, cached: false };
  }

  return { error: 'Could not fetch image for bokeId: ' + bokeId };
}

/**
 * bokete.jpページから画像URLをスクレイピング
 */
function scrapeBokeImageUrl(bokeId) {
  try {
    var url = 'https://bokete.jp/boke/' + bokeId;
    var response = UrlFetchApp.fetch(url, {
      muteHttpExceptions: true,
      followRedirects: true
    });

    if (response.getResponseCode() !== 200) {
      return null;
    }

    var html = response.getContentText();

    // og:image メタタグから画像URLを抽出
    var ogMatch = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i);
    if (ogMatch && ogMatch[1]) {
      return ogMatch[1];
    }

    // CloudFront画像URLを直接探す（複数CDNドメイン対応）
    var cfMatch = html.match(/(https:\/\/d[a-z0-9]+\.cloudfront\.net\/photo\/[^"'\s]+)/i);
    if (cfMatch && cfMatch[1]) {
      return cfMatch[1];
    }

    // 一般的な画像パターン
    var imgMatch = html.match(/<img[^>]+class=["'][^"']*boke[^"']*["'][^>]+src=["']([^"']+)["']/i);
    if (imgMatch && imgMatch[1]) {
      return imgMatch[1];
    }

    return null;
  } catch (err) {
    Logger.log('Error scraping bokeId ' + bokeId + ': ' + err);
    return null;
  }
}

/**
 * photo by / odai by / boke by を取得（キャッシュ優先）
 */
function getMeta(bokeId) {
  if (!bokeId) return { error: 'bokeId is required' };

  var sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_NAME);
  var lastRow = sheet.getLastRow();
  var idRange = sheet.getRange(DATA_START_ROW, COL_ID + 1, lastRow - DATA_START_ROW + 1, 1);
  var ids = idRange.getValues();

  var targetRow = -1;
  for (var i = 0; i < ids.length; i++) {
    if (ids[i][0].toString() === bokeId.toString()) {
      targetRow = i + DATA_START_ROW;
      break;
    }
  }
  if (targetRow === -1) return { error: 'bokeId not found: ' + bokeId };

  // キャッシュ確認 (AL/AM/AN)
  var metaRange = sheet.getRange(targetRow, COL_PHOTO_BY + 1, 1, 3).getValues()[0];
  var photoBy = (metaRange[0] || '').toString();
  var odaiBy = (metaRange[1] || '').toString();
  var bokeBy = (metaRange[2] || '').toString();

  if (photoBy && odaiBy && bokeBy) {
    return { photoBy: photoBy, odaiBy: odaiBy, bokeBy: bokeBy, cached: true };
  }

  // スクレイピング
  var meta = scrapeBokeMeta(bokeId);
  if (!meta) return { error: 'Could not fetch meta for bokeId: ' + bokeId };

  sheet.getRange(targetRow, COL_PHOTO_BY + 1).setValue(meta.photoBy || '');
  sheet.getRange(targetRow, COL_ODAI_BY + 1).setValue(meta.odaiBy || '');
  sheet.getRange(targetRow, COL_BOKE_BY + 1).setValue(meta.bokeBy || '');

  return { photoBy: meta.photoBy, odaiBy: meta.odaiBy, bokeBy: meta.bokeBy, cached: false };
}

/**
 * bokete.jpページからphoto by / odai by / boke byを抽出
 * HTMLに埋め込まれたJSONから取得
 * 構造: "id":<bokeId>... "odai":{ ..."user":{..."nick":"odai by"}..."photo":{..."ownerName":"photo by"}... }, "user":{..."nick":"boke by"...}
 */
function scrapeBokeMeta(bokeId) {
  try {
    var url = 'https://bokete.jp/boke/' + bokeId;
    var response = UrlFetchApp.fetch(url, {
      muteHttpExceptions: true,
      followRedirects: true,
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    if (response.getResponseCode() !== 200) return null;

    var html = response.getContentText();
    var idx = html.indexOf('"id":' + bokeId);
    if (idx === -1) return null;
    var slice = html.substring(idx);

    // 順序: 最初に出る "nick" が odai.user.nick (= odai by)
    var odaiMatch = slice.match(/"nick":"([^"]*)"/);
    var photoMatch = slice.match(/"ownerName":"([^"]*)"/);
    var bokeBy = '';
    if (photoMatch) {
      var afterPhoto = slice.substring(slice.indexOf('"ownerName"'));
      var bokeMatch = afterPhoto.match(/"nick":"([^"]*)"/);
      if (bokeMatch) bokeBy = decodeUnicodeEscapes(bokeMatch[1]);
    }

    return {
      odaiBy: odaiMatch ? decodeUnicodeEscapes(odaiMatch[1]) : '',
      photoBy: photoMatch ? decodeUnicodeEscapes(photoMatch[1]) : '',
      bokeBy: bokeBy
    };
  } catch (err) {
    Logger.log('Error scraping meta for bokeId ' + bokeId + ': ' + err);
    return null;
  }
}

/**
 * \uXXXX エスケープを実文字に変換
 */
function decodeUnicodeEscapes(str) {
  return str.replace(/\\u([0-9a-fA-F]{4})/g, function(m, hex) {
    return String.fromCharCode(parseInt(hex, 16));
  });
}

/**
 * 一括画像URL取得（初回セットアップ用）
 * GASのスクリプトエディタから手動実行する
 */
function batchFetchImageUrls() {
  var sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_NAME);
  var lastRow = sheet.getLastRow();

  if (lastRow < DATA_START_ROW) return;

  var idRange = sheet.getRange(DATA_START_ROW, COL_ID + 1, lastRow - DATA_START_ROW + 1, 1);
  var cacheRange = sheet.getRange(DATA_START_ROW, COL_IMAGE_CACHE + 1, lastRow - DATA_START_ROW + 1, 1);

  var ids = idRange.getValues();
  var caches = cacheRange.getValues();

  var count = 0;
  var MAX_PER_RUN = 50;

  for (var i = 0; i < ids.length; i++) {
    if (count >= MAX_PER_RUN) {
      Logger.log('Reached max per run (' + MAX_PER_RUN + '). Run again to continue.');
      break;
    }

    var bokeId = ids[i][0];
    if (!bokeId || caches[i][0]) continue;

    var imageUrl = scrapeBokeImageUrl(bokeId.toString());
    if (imageUrl) {
      sheet.getRange(i + DATA_START_ROW, COL_IMAGE_CACHE + 1).setValue(imageUrl);
      count++;
      Logger.log('Fetched image for bokeId ' + bokeId + ': ' + imageUrl);
    }

    Utilities.sleep(500);
  }

  Logger.log('Total fetched: ' + count);
}

/**
 * 評価を更新
 */
function updateRating(row, rating) {
  if (!row || rating === undefined) {
    return { error: 'row and rating are required' };
  }

  var sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_NAME);
  var ratingStr = ratingToString(rating);
  sheet.getRange(row, COL_RATING + 1).setValue(ratingStr);

  return { success: true, row: row, rating: rating, ratingStr: ratingStr };
}

/**
 * 一括評価更新
 */
function batchUpdateRating(updates) {
  if (!updates || !Array.isArray(updates)) {
    return { error: 'updates array is required' };
  }

  var sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_NAME);

  for (var i = 0; i < updates.length; i++) {
    var ratingStr = ratingToString(updates[i].rating);
    sheet.getRange(updates[i].row, COL_RATING + 1).setValue(ratingStr);
  }

  return { success: true, count: updates.length };
}

/**
 * I列の判定（OK/NG）を更新
 */
function updateJudgment(row, judgment) {
  if (!row) {
    return { error: 'row is required' };
  }

  var val = (judgment || '').toString().trim().toUpperCase();
  if (val !== 'OK' && val !== 'NG' && val !== '') {
    return { error: 'judgment must be OK, NG, or empty' };
  }

  var sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_NAME);
  sheet.getRange(row, COL_JUDGMENT + 1).setValue(val);

  return { success: true, row: row, judgment: val };
}

/**
 * 数値の評価を★文字列に変換
 */
function ratingToString(rating) {
  var r = parseInt(rating);
  if (r === 3) return '★★★';
  if (r === 2) return '★★';
  if (r === 1) return '★';
  return '';
}

/**
 * K列のヘッダーを設定（初回セットアップ用）
 */
function setupImageCacheColumn() {
  var sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_NAME);
  sheet.getRange(HEADER_ROW, COL_IMAGE_CACHE + 1).setValue('画像URL');
  sheet.getRange(HEADER_ROW, COL_PHOTO_BY + 1).setValue('photo by');
  sheet.getRange(HEADER_ROW, COL_ODAI_BY + 1).setValue('odai by');
  sheet.getRange(HEADER_ROW, COL_BOKE_BY + 1).setValue('boke by');
  Logger.log('Setup complete: AK〜AN列にヘッダーを追加しました。');
}
