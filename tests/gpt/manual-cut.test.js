// jsc tests/gpt/manual-cut.test.js -- baccarat-cut-gpt.html
// 本体を無改変で読み込み、候補の全選択肢を独立に検査する。
var setup=readFile('tests/gpt/cut-core.test.js').split('// ---- 2. テスト用ヘルパ ----')[0];
eval(setup);
function assert(ok,msg) { if(!ok) throw new Error(msg); }
function bets(values) { return values.map((amount,i)=>({seat:i+1,amount})); }
function combinations(xs,n) {
  if(!n) return [[]];
  if(xs.length<n) return [];
  return combinations(xs.slice(1),n-1).map(a=>[xs[0]].concat(a)).concat(combinations(xs.slice(1),n));
}
function verify(r,L,G) {
  if(r.state==='none'||r.state==='overflow') return;
  var variants=[r.rows.map(x=>({...x}))];
  (r.manualPlan||[]).forEach(p=>{
    assert(p.count>0 && p.count<p.seats.length && p.add>0,'候補人数/金額');
    variants=variants.flatMap(rows=>combinations(p.seats,p.count).map(selected=>rows.map(x=>selected.indexOf(x.seat)>=0 ? {...x,cut:x.cut+p.add,effective:x.effective-p.add}:x)));
  });
  variants.forEach(rows=>{
    var total=0;
    rows.forEach(a=>{
      total+=a.effective;
      assert(a.cut>=0 && a.cut%10===0,'カット単位');
      assert(a.effective===a.amount-a.cut,'保存則');
      assert(a.effective>=Math.min(a.amount,G),'最低保証');
      assert(a.cut%100<=a.amount%100,'チップ分割');
      rows.forEach(b=>{ if(a.amount<b.amount) assert(a.cut<=b.cut && a.effective<=b.effective,'異額席逆転'); });
    });
    assert(total<=L,'調整後上限超過');
    if(r.state==='cut') assert(total===r.finalEffectiveTotal,'調整後合計');
  });
  r.rows.forEach(a=>r.rows.forEach(b=>{if(a.amount===b.amount) assert(a.cut===b.cut,'基準の同額差');}));
}
var a=computeSide(bets(Array(8).fill(400)),3000,300);
assert(a.cutTotal===0 && a.remainder===200,'400×8は共通0、残り200');
assert(a.manualPlan.length===1 && a.manualPlan[0].count===2 && a.manualPlan[0].add===100,'8人のうち2人から100');
verify(a,3000,300);
var b=computeSide(bets(Array(4).fill(1000)),3000,300);
assert(b.rows.every(x=>x.cut===200) && b.remainder===200,'1000×4は共通200');
assert(b.manualPlan[0].count===2 && b.manualPlan[0].add===100,'4人のうち2人から100');
verify(b,3000,300);
var ten=computeSide(bets(Array(8).fill(460)),3260,300);
assert(ten.manualPlan[0].count===2 && ten.manualPlan[0].add===10,'10ドル端数');
verify(ten,3260,300);
var single=computeSide(bets([400]),350,300);
assert(single.cutTotal===100 && single.manualPlan.length===0 && single.finalEffectiveTotal===300,'チップを崩さず到達不能');
verify(single,350,300);
// $10端数を先に全員から切ると余分になる回帰例。
var mixed=computeSide(bets([210,110,210]),470,100);
assert(mixed.cutTotal===0 && mixed.manualCutTotal===100 && mixed.finalEffectiveTotal===430,'端数混在の最小カット');
verify(mixed,470,100);
var seed=928;
function rand(n){seed=(Math.imul(seed,1664525)+1013904223)>>>0;return Math.floor(seed/4294967296*n);}
var manualCases=0;
for(var t=0;t<400;t++) {
  var common=10*(40+rand(100));
  var vals=Array.from({length:1+rand(8)},()=>rand(2)?common:10*(1+rand(300)));
  var L=(50+rand(450))*10,G=rand(6)*100;
  var r=computeSide(bets(vals),L,G);
  if(r.manualPlan && r.manualPlan.length) manualCases++;
  verify(r,L,G);
  var perm=computeSide(bets(vals).reverse(),L,G);
  assert(JSON.stringify((r.rows||[]).slice().sort((a,b)=>a.seat-b.seat))===JSON.stringify((perm.rows||[]).slice().sort((a,b)=>a.seat-b.seat)),'入力順依存');
}
// 独立した全探索で、小額の3席について最小の総カットを照合する。
function oracle(values,L,G) {
  var best=Infinity,cuts=[];
  function visit(i,sum) {
    if(i===values.length) {if(sum>=values.reduce((a,b)=>a+b,0)-L)best=Math.min(best,sum);return;}
    for(var c=0;c<=values[i]-Math.min(values[i],G);c+=10) {
      if(c%100>values[i]%100)continue;
      var safe=true;
      for(var j=0;j<i;j++) {
        if(values[j]<values[i] && (cuts[j]>c || values[j]-cuts[j]>values[i]-c))safe=false;
        if(values[j]>values[i] && (cuts[j]<c || values[j]-cuts[j]<values[i]-c))safe=false;
      }
      if(safe){cuts[i]=c;visit(i+1,sum+c);}
    }
  }
  visit(0,0);return best;
}
var amounts=[100,110,160,200,210,300];
for(var t=0;t<100;t++) {
  var vals=Array.from({length:3},()=>amounts[rand(amounts.length)]);
  var L=(1+rand(50))*10,G=rand(2)*100;
  var r=computeSide(bets(vals),L,G);
  if(r.state!=='cut')continue;
  assert(r.cutTotal+r.manualCutTotal===oracle(vals,L,G),'全探索の最小カットと不一致 '+JSON.stringify({vals,L,G,r}));
  verify(r,L,G);
}
print('✅ 端数計画: 代表例・400ケース（人間判断'+manualCases+'件、候補の全選択）・小額100ケースの全探索比較');
