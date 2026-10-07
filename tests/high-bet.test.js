// jsc tests/high-bet.test.js -- baccarat-cut-work.html
var core = readFile('tests/cut-core.test.js');
eval(core.split('// ---- 2. テスト用ヘルパ ----')[0]);
var failures = [];
function check(condition, label) { if (!condition) failures.push(label); }
eval(extractFunction(core, 'invariantCheck'));
function bets(values) { return values.map((amount, i) => ({seat:i+1, amount})); }
function compare(values, L, G) {
  var input = bets(values), standard = computeSide(input,L,G), high = computeSide(input,L,G,'high');
  invariantCheck(high,L,G,JSON.stringify(values));
  return {standard, high};
}
var example = compare([500,500,1000,10000],3000,300);
check(example.high.rows[2].cut < example.standard.rows[2].cut, '中額席の負担軽減');
check(example.high.rows[3].cut > example.standard.rows[3].cut, '高額席の負担増加');
check(example.high.effectiveTotal === 3000, '上限ちょうど');
var two = compare([1000,10000],5000,300);
check(two.high.rows[0].cut < two.standard.rows[0].cut && two.high.rows[1].cut > two.standard.rows[1].cut, '2席の負担移動');
[[1000,1000,1000,1000],[1000,1500,2000],[1500,1500,3000],[10000]].forEach(values => {
  var pair = compare(values,3000,300);
  check(JSON.stringify(pair.standard) === JSON.stringify(pair.high),'基準以下は最新版と同じ');
});
check(computeSide([],3000,300,'high').state === 'none','空席');
check(computeSide(bets([100,100,1000]),3000,300,'high').state === 'nocut','上限内');
check(computeSide(bets([500,500,5000]),500,300,'high').state === 'overflow','保証不能');
var seed = 130928;
function rand(n) { seed = (Math.imul(seed,1664525)+1013904223)>>>0; return Math.floor(seed/4294967296*n); }
for(var t=0;t<700;t++) {
  var values=Array.from({length:2+rand(7)},()=>10*(1+rand(180)));
  values[values.length-1]=10*(500+rand(2500));
  var L=(50+rand(750))*10, G=rand(11)*100, pair=compare(values,L,G);
  if(pair.high.rows) {
    var rows=pair.high.rows.slice().sort((a,b)=>a.amount-b.amount);
    for(var i=1;i<rows.length;i++) if(rows[i].amount===rows[i-1].amount) check(rows[i].cut===rows[i-1].cut,'同額同カット');
    var reversed=computeSide(bets(values).reverse(),L,G,'high');
    check(JSON.stringify(pair.high.rows)===JSON.stringify(reversed.rows.reverse()),'入力順に依存しない');
  }
}
print('高額配慮: 代表例・境界・700ケース ' + (failures.length ? '失敗 '+failures.length : '全テスト通過'));
if(failures.length) throw new Error(failures.slice(0,20).join('\n'));
