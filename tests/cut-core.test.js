// ============================================================
// カット計算ロジックのテスト（jsc で実行）
//
//   実行: テスト実行.command をダブルクリック
//   または:
//     jsc tests/cut-core.test.js -- baccarat-cut-work.html tests/snapshot.json
//     jsc tests/cut-core.test.js -- baccarat-cut-work.html tests/snapshot.json generate
//
// 仕組み: アプリ本体(HTML)は一切いじらず、その中の computeSide() だけを
//         取り出して実行し、「壊れてはいけないルール（不変条件）」と
//         「以前と同じ答えを出すか（スナップショット）」を自動でチェックする。
// ============================================================

var htmlPath = arguments[0];
var snapPath = arguments[1];
var mode = arguments[2] || ''; // 'generate' で基準データを標準出力に出す

// ---- 1. HTML本体を読み、computeSide と定数を取り出す ----
var src = readFile(htmlPath);

function grabConst(name) {
  var m = src.match(new RegExp('const\\s+' + name + '\\s*=\\s*(\\d+)'));
  if (!m) throw new Error('定数が見つかりません: ' + name);
  return Number(m[1]);
}
var INPUT_UNIT = grabConst('INPUT_UNIT');
var UNIT100 = grabConst('UNIT100');

// function computeSide(...) { ... } を波括弧の対応で抜き出す
// （文字列・コメント内の { } は数えない）
function extractFunction(source, name) {
  var sig = 'function ' + name;
  var at = source.indexOf(sig);
  if (at < 0) throw new Error('関数が見つかりません: ' + name);
  var i = source.indexOf('{', at);
  if (i < 0) throw new Error('関数本体が見つかりません: ' + name);
  var depth = 0;
  var inS = false, sQ = '', inLine = false, inBlock = false;
  for (; i < source.length; i++) {
    var c = source[i], n = source[i + 1];
    if (inLine) { if (c === '\n') inLine = false; continue; }
    if (inBlock) { if (c === '*' && n === '/') { inBlock = false; i++; } continue; }
    if (inS) {
      if (c === '\\') { i++; continue; }
      if (c === sQ) inS = false;
      continue;
    }
    if (c === '/' && n === '/') { inLine = true; i++; continue; }
    if (c === '/' && n === '*') { inBlock = true; i++; continue; }
    if (c === '"' || c === "'" || c === '`') { inS = true; sQ = c; continue; }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return source.slice(at, i + 1); }
  }
  throw new Error('波括弧の対応が取れません: ' + name);
}

var computeSideSrc = extractFunction(src, 'computeSide');
// 定数を与えたうえで関数を生成（本体は無改変のまま評価）
var computeSide = eval(
  '(function(INPUT_UNIT, UNIT100){ ' + computeSideSrc + ' return computeSide; })'
)(INPUT_UNIT, UNIT100);

// ---- 2. テスト用ヘルパ ----
var failures = [];
function check(cond, label) { if (!cond) failures.push(label); }
function bets(arr) { return arr.map(function (x) { return { seat: x[0], amount: x[1] }; }); }
function randInt(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }

// ---- 3. 不変条件テスト（ランダム入力を多数生成して毎回チェック）----
//
//  ★最重要ルール: 有効ベット合計は上限を絶対に超えない（客に上限超で残さない）
//
//  注意: 最低保証は「$100単位」で振る。これは実務のプリセット(A〜D)が全て
//        $100単位($300/$500/$1000)で、これが正しい使い方だから。
//        （保証を$10単位にすると上限超過が起きうる＝「既知の制限」で別途記録）
function invariantCheck(res, L, G, label) {
  if (res.state === 'none' || res.state === 'overflow') return; // 数値検証の対象外
  var rows = res.rows;
  var effTotal = 0, cutTotal = 0, betTotal = 0;
  rows.forEach(function (r) {
    betTotal += r.amount; effTotal += r.effective; cutTotal += r.cut;
    check(r.cut >= 0, label + ': カットが負 (席' + r.seat + ')');
    check(r.effective >= 0, label + ': 有効ベットが負 (席' + r.seat + ')');
    check(r.cut % INPUT_UNIT === 0, label + ': カットが$10単位でない (席' + r.seat + ')');
    check(r.effective === r.amount - r.cut, label + ': 有効=ベット-カット が崩れ (席' + r.seat + ')');
    check(r.effective >= Math.min(r.amount, G), label + ': 最低保証を下回る (席' + r.seat + ')');
  });
  check(effTotal <= L, label + ': ★有効ベット合計が上限を超過 (' + effTotal + ' > ' + L + ')');
  check(effTotal + cutTotal === betTotal, label + ': ベット保存則が崩れ');
  check((L - effTotal) % INPUT_UNIT === 0, label + ': 上限との差が$10単位でない');

  // ★$100チップを割らない: カットの「$100未満の端数」がベットの「$100未満の端数」を超えない
  rows.forEach(function (r) {
    check(r.cut % UNIT100 <= r.amount % UNIT100,
      label + ': $100チップ割れ (席' + r.seat + ' cut=' + r.cut + ' bet=' + r.amount + ')');
  });
  // ★逆転禁止: ベット昇順で、カットも有効ベットも非減少（大ベットが小ベットより不利にならない）
  var ord = rows.slice().sort(function (a, b) { return a.amount - b.amount; });
  for (var i = 1; i < ord.length; i++) {
    if (ord[i].amount === ord[i - 1].amount) continue; // 同額は対象外
    check(ord[i].cut >= ord[i - 1].cut,
      label + ': カット逆転 (席' + ord[i].seat + '$' + ord[i].amount + ' のカットが 席' + ord[i - 1].seat + '$' + ord[i - 1].amount + ' より少ない)');
    check(ord[i].effective >= ord[i - 1].effective,
      label + ': 有効ベット逆転 (席' + ord[i].seat + '$' + ord[i].amount + ' の有効が 席' + ord[i - 1].seat + '$' + ord[i - 1].amount + ' より少ない)');
  }
}

var TRIALS = 5000;
for (var t = 0; t < TRIALS; t++) {
  var n = randInt(1, 8);
  var L = randInt(5, 80) * UNIT100;          // 上限（$100単位, 500〜8000）
  var G = randInt(0, 10) * UNIT100;          // 最低保証（$100単位, 0〜1000）★実務に合わせる
  var arr = [];
  for (var s = 1; s <= n; s++) {
    if (Math.random() < 0.15) continue;       // たまに空席
    arr.push([s, randInt(1, 300) * INPUT_UNIT]); // ベット（$10単位, 10〜3000）
  }
  if (arr.length === 0) continue;
  invariantCheck(computeSide(bets(arr), L, G), L, G, '不変#' + t);
}

// ---- 3b. バグ修正の番人（再発防止）----
// 半端な最低保証($210等)を許すと、$100チップを割らないカット制約のせいで
// 十分に削れず上限を超えてしまう。本体側で「保証は$100単位のみ」に固定して直したので、
// その固定がうっかり元に戻されていないかをソースから直接確認する。
check(/GUARANTEE % UNIT100 !== 0/.test(src),
  '本体の最低保証チェックが$100単位でない（バグ再発の恐れ。validateLGを確認）');
check(/class="p-guar"[\s\S]*?step="100"/.test(src),
  '設定画面の最低保証入力が$100刻みでない（step="100" に戻してください）');
// 参考: 直接 computeSide に半端な保証を渡せばまだ超過しうる（=本体UIで入口を塞ぐ設計）。
// なので「直接呼び出しの超過」はバグ扱いせず、UI固定で防ぐ方針であることを明記。

// ---- 4. 代表ケースのスナップショット（現状の答えを基準に固定）----
//  ※ 保証はすべて$100単位（実務の正しい使い方）
var CASES = [
  { name: 'カットなし(合計<上限)', L: 3000, G: 300, b: [[1, 500], [2, 800], [3, 1000]] },
  { name: '上限ちょうど',          L: 3000, G: 300, b: [[1, 1000], [2, 1000], [3, 1000]] },
  { name: '1席だけ超過',           L: 3000, G: 300, b: [[1, 5000]] },
  { name: '全席同額で超過',        L: 3000, G: 300, b: [[1, 1000], [2, 1000], [3, 1000], [4, 1000]] },
  { name: '$10端数あり',           L: 3000, G: 300, b: [[1, 460], [2, 1230], [3, 2110]] },
  { name: '最低保証で固定が発生',  L: 3000, G: 300, b: [[1, 100], [2, 150], [3, 2000], [4, 2500]] },
  { name: '保証合計が上限超過',    L: 3000, G: 500, b: [[1, 600], [2, 600], [3, 600], [4, 600], [5, 600], [6, 600]] },
  { name: 'ベットなし',            L: 3000, G: 300, b: [] },
  { name: '8席フル・端数まじり',   L: 5000, G: 500, b: [[1, 460], [2, 1230], [3, 2110], [4, 880], [5, 90], [6, 1500], [7, 330], [8, 720]] },
];

function snapshotOf() {
  var out = {};
  CASES.forEach(function (c) { out[c.name] = computeSide(bets(c.b), c.L, c.G); });
  return out;
}
var current = snapshotOf();

// ---- 5. 出力 ----
if (mode === 'generate') {
  // 基準データを標準出力へ（シェル側でファイルに保存する）。他は何も出さない。
  print(JSON.stringify(current, null, 2));
} else {
  var baseRaw = null;
  try { baseRaw = readFile(snapPath); } catch (e) { baseRaw = null; }
  if (!baseRaw) {
    failures.push('スナップショット基準が無い: ' + snapPath + '（先に generate してください）');
  } else {
    var base = JSON.parse(baseRaw);
    CASES.forEach(function (c) {
      if (JSON.stringify(base[c.name]) !== JSON.stringify(current[c.name]))
        failures.push('スナップショット不一致: ' + c.name);
    });
  }

  print('');
  print('実行: ' + htmlPath);
  print('不変条件テスト: ランダム ' + TRIALS + ' 通り（保証=$100単位＝本体が強制）');
  print('修正ガードテスト: 2 件（最低保証の$100単位固定が外れていないか）');
  print('スナップショット: ' + CASES.length + ' ケース');
  print('-----------------------------------------');
  if (failures.length === 0) {
    print('✅ 全テスト通過');
  } else {
    print('❌ 失敗 ' + failures.length + ' 件:');
    failures.slice(0, 20).forEach(function (f) { print('   - ' + f); });
    if (failures.length > 20) print('   ...他 ' + (failures.length - 20) + ' 件');
    throw new Error('テスト失敗 ' + failures.length + ' 件');  // 終了コードを非ゼロに
  }
}
