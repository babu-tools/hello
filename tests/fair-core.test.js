// ============================================================
// 公平版（computeSideFair / $10単位カット）のブルートフォース検証（jsc で実行）
//
//   実行:
//     jsc tests/fair-core.test.js -- baccarat-cut-work.html
//
// 仕組み: アプリ本体(HTML)から computeSideFair() だけを取り出し、約20万通りの入力で
//         「壊れてはいけないルール（不変条件）」を総当りで確認する。
//         ※既存の cut-core.test.js が見る「$100チップ非分割」は新版では撤廃が目的なので
//           ここでは検査しない。代わりに「端数0＝上限ちょうど」を必須にする。
// ============================================================

var htmlPath = arguments[0];

var src = readFile(htmlPath);

function grabConst(name) {
  var m = src.match(new RegExp('const\\s+' + name + '\\s*=\\s*(\\d+)'));
  if (!m) throw new Error('定数が見つかりません: ' + name);
  return Number(m[1]);
}
var INPUT_UNIT = grabConst('INPUT_UNIT');
var UNIT100 = grabConst('UNIT100');

// function NAME(...) { ... } を波括弧の対応で抜き出す（文字列・コメント内の { } は数えない）
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

var fnSrc = extractFunction(src, 'computeSideFair');
var computeSideFair = eval(
  '(function(INPUT_UNIT, UNIT100){ ' + fnSrc + ' return computeSideFair; })'
)(INPUT_UNIT, UNIT100);

// ---- ヘルパ ----
var failures = [];
function check(cond, label) { if (!cond && failures.length < 50) failures.push(label); }
function bets(arr) { return arr.map(function (x) { return { seat: x[0], amount: x[1] }; }); }
function randInt(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }

function invariantCheck(res, L, G, label) {
  if (res.state === 'none' || res.state === 'overflow') return;
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

  // ★端数の扱い: 同額で割り切れない分 tieRemainder を除けば上限ちょうど
  if (res.state === 'cut') {
    var tie = res.tieRemainder || 0;
    check(tie >= 0 && tie % INPUT_UNIT === 0, label + ': tieRemainder が不正 (' + tie + ')');
    check(effTotal === L - tie, label + ': ★上限-tieRemainder と不一致 (eff=' + effTotal + ', L=' + L + ', tie=' + tie + ')');
    check(cutTotal === betTotal - L + tie, label + ': カット合計が required+tie と不一致');
    if (tie > 0) check((res.candSeats || []).length >= 2, label + ': tieRemainder>0 なのに候補席(同額)が無い');
  }

  // ★同額席は全員同じカット（機械が同額の中で勝手に差をつけない）
  var byAmt = {};
  rows.forEach(function (r) { (byAmt[r.amount] = byAmt[r.amount] || []).push(r.cut); });
  Object.keys(byAmt).forEach(function (a) {
    var cuts = byAmt[a];
    for (var k = 1; k < cuts.length; k++) {
      check(cuts[k] === cuts[0], label + ': 同額席($' + a + ')でカットが不一致 (' + cuts.join('/') + ')');
    }
  });

  // ★逆転禁止: ベット昇順で cut・有効ベットとも非減少
  var ord = rows.slice().sort(function (a, b) { return a.amount - b.amount; });
  for (var i = 1; i < ord.length; i++) {
    if (ord[i].amount === ord[i - 1].amount) continue;
    check(ord[i].cut >= ord[i - 1].cut,
      label + ': カット逆転 (席' + ord[i].seat + '$' + ord[i].amount + ' のカットが 席' + ord[i - 1].seat + '$' + ord[i - 1].amount + ' より少ない)');
    check(ord[i].effective >= ord[i - 1].effective,
      label + ': 有効ベット逆転 (席' + ord[i].seat + '$' + ord[i].amount + ' の有効が 席' + ord[i - 1].seat + '$' + ord[i - 1].amount + ' より少ない)');
  }
}

// ---- 総当り（約20万通り）----
var GUARS = [300, 400, 500];
var TRIALS = 200000;
for (var t = 0; t < TRIALS; t++) {
  var n = randInt(1, 8);
  var L = randInt(5, 80) * UNIT100;                 // 上限（$100単位, 500〜8000）
  var G = GUARS[randInt(0, GUARS.length - 1)];      // 最低保証 ∈ {300,400,500}
  var arr = [];
  for (var s = 1; s <= n; s++) {
    if (Math.random() < 0.12) continue;             // たまに空席
    arr.push([s, randInt(1, 500) * INPUT_UNIT]);    // ベット（$10単位, 10〜5000）
  }
  if (arr.length === 0) continue;
  invariantCheck(computeSideFair(bets(arr), L, G), L, G, '公平#' + t);
  if (failures.length >= 50) break;
}

// ---- 出力 ----
print('');
print('実行: ' + htmlPath + '（computeSideFair）');
print('総当り: ' + TRIALS + ' 通り（G∈{300,400,500}, ベット$10刻み≤$5000, 上限$500〜$8000）');
print('検査: (上限-tieRemainder)ちょうど・同額席は同カット・保証床維持・逆転0・$10単位・ベット保存');
print('-----------------------------------------');
if (failures.length === 0) {
  print('✅ 全テスト通過');
} else {
  print('❌ 失敗 ' + failures.length + ' 件:');
  failures.slice(0, 20).forEach(function (f) { print('   - ' + f); });
  if (failures.length > 20) print('   ...他 ' + (failures.length - 20) + ' 件');
  throw new Error('テスト失敗 ' + failures.length + ' 件');
}
