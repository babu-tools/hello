// ============================================================
// 公平版（computeSideFair / $10単位カット）のブルートフォース検証（jsc で実行）
//
//   実行:
//     jsc tests/gpt/fair-core.test.js -- baccarat-cut-gpt.html
//
// 仕組み: アプリ本体(HTML)から computeSideFair() だけを取り出し、2000通りの入力と少額150ケースの独立全探索で
//         「壊れてはいけないルール（不変条件）」をランダム検証で確認する。
//         ※既存の cut-core.test.js が見る「$100チップ非分割」は新版では撤廃が目的なので
//           ここでは検査しない。代わりに「上限以内・率の順序」を必須にする。
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
var seed=130928;
function random() { seed=(Math.imul(seed,1664525)+1013904223)>>>0; return seed/4294967296; }
function randInt(a, b) { return a + Math.floor(random() * (b - a + 1)); }

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

  // ★端数の扱い: 同額・率順序で残せない分 rateRemainder を除けば上限ちょうど
  if (res.state === 'cut') {
    var tie = res.rateRemainder || 0;
    check(tie >= 0 && tie % INPUT_UNIT === 0, label + ': rateRemainder が不正 (' + tie + ')');
    check(effTotal === L - tie, label + ': ★上限-rateRemainder と不一致 (eff=' + effTotal + ', L=' + L + ', tie=' + tie + ')');
    check(cutTotal === betTotal - L + tie, label + ': カット合計が required+tie と不一致');
    check(res.rateOrdered === true, label + ': 率順序モード');
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
    check(ord[i].cut * ord[i-1].amount >= ord[i-1].cut * ord[i].amount, label + ': カット率逆転');
    check(ord[i].cut >= ord[i - 1].cut,
      label + ': カット逆転 (席' + ord[i].seat + '$' + ord[i].amount + ' のカットが 席' + ord[i - 1].seat + '$' + ord[i - 1].amount + ' より少ない)');
    check(ord[i].effective >= ord[i - 1].effective,
      label + ': 有効ベット逆転 (席' + ord[i].seat + '$' + ord[i].amount + ' の有効が 席' + ord[i - 1].seat + '$' + ord[i - 1].amount + ' より少ない)');
  }
}

// ---- ランダム検証（2000通り）----
var GUARS = [300, 400, 500];
var TRIALS = 2000;
for (var t = 0; t < TRIALS; t++) {
  var n = randInt(1, 8);
  var L = randInt(5, 80) * UNIT100;                 // 上限（$100単位, 500〜8000）
  var G = GUARS[randInt(0, GUARS.length - 1)];      // 最低保証 ∈ {300,400,500}
  var arr = [];
  for (var s = 1; s <= n; s++) {
    if (random() < 0.12) continue;             // たまに空席
    arr.push([s, randInt(1, 500) * INPUT_UNIT]);    // ベット（$10単位, 10〜5000）
  }
  if (arr.length === 0) continue;
  invariantCheck(computeSideFair(bets(arr), L, G), L, G, '公平#' + t);
  if (failures.length >= 50) break;
}

// 写真の回帰例、率順序だけで割り切れない異額席、同額席。
var photo=bets([[1,1000],[2,400],[3,1800],[4,800],[5,1600],[6,400],[7,500]]);
var result=computeSideFair(photo,3000,300);
check(JSON.stringify(result.rows.map(r=>r.cut))===JSON.stringify([590,100,1080,470,960,100,200]),'写真の回帰例');
[[[[1,400],[2,400]],790,300,780],[[[1,100],[2,110]],190,0,180]].forEach(example=>{
  var r=computeSideFair(bets(example[0]),example[1],example[2]);
  invariantCheck(r,example[1],example[2],'端数例');
  check(r.effectiveTotal===example[3] && r.rateRemainder===10,'不足$10を正しく表示');
  check(!r.tieRemainder && !r.candSeats.length,'率を破る手動戻しを案内しない');
});
// 独立全探索: 全ての$10単位のカットを列挙し、最小総カットと照合する。
function oracle(values,L,G) {
  var best=Infinity;
  function visit(i,cuts,total) {
    if(i===values.length) {
      if(total<values.reduce((s,a)=>s+a,0)-L) return;
      for(var x=0;x<values.length;x++) for(var y=0;y<values.length;y++) {
        if(values[x]===values[y] && cuts[x]!==cuts[y]) return;
        if(values[x]<values[y] && (cuts[x]*values[y]>cuts[y]*values[x] || values[x]-cuts[x]>values[y]-cuts[y])) return;
      }
      best=Math.min(best,total); return;
    }
    for(var c=0;c<=values[i]-Math.min(values[i],G);c+=10) visit(i+1,cuts.concat(c),total+c);
  }
  visit(0,[],0); return best;
}
for(var t=0;t<150;t++) {
  var values=Array.from({length:3},()=>randInt(1,12)*10);
  var L=randInt(1,values.reduce((s,a)=>s+a,0)/10)*10, G=t%2?100:0;
  var input=values.map((amount,i)=>({seat:i+1,amount}));
  var r=computeSideFair(input,L,G), optimal=oracle(values,L,G);
  invariantCheck(r,L,G,'独立全探索'+t);
  if(r.state==='overflow') check(optimal===Infinity,'保証不能の独立確認');
  else check(r.cutTotal===optimal,'独立全探索の最小カットと一致');
  var reverse=computeSideFair(input.slice().reverse(),L,G);
  check(JSON.stringify(r.rows)===JSON.stringify(reverse.rows && reverse.rows.reverse()),'入力順不変');
}

// ---- 出力 ----
print('');
print('実行: ' + htmlPath + '（computeSideFair）');
print('ランダム検証: ' + TRIALS + ' 通り（G∈{300,400,500}, ベット$10刻み≤$5000, 上限$500〜$8000）');
print('検査: カット率/額/残額の逆転0・同額同カット・保証・上限・$10単位。写真と端数例・少額150ケースの独立全探索・入力順不変。');
print('-----------------------------------------');
if (failures.length === 0) {
  print('✅ 全テスト通過');
} else {
  print('❌ 失敗 ' + failures.length + ' 件:');
  failures.slice(0, 20).forEach(function (f) { print('   - ' + f); });
  if (failures.length > 20) print('   ...他 ' + (failures.length - 20) + ' 件');
  throw new Error('テスト失敗 ' + failures.length + ' 件');
}
