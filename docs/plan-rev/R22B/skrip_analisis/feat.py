import json,sys,math,collections
d=json.load(open(sys.argv[1]))
s=[x for x in d['sessions'] if x['meta']['sessionId']=='S-970f4cb0'][0]
F=[f for f in s['frames'] if f['trialId']=='S-970f4cb0-T002']
E=[e for e in s['events'] if e.get('trialId')=='S-970f4cb0-T002']
# stroke spans
st={};
for e in E:
    sid=(e.get('data') or {}).get('strokeId')
    if e['type']=='STROKE_START': st.setdefault(sid,{})['a']=e['t']
    if e['type']=='STROKE_END': st.setdefault(sid,{}).update(b=e['t'],n=e['data'].get('points'),why=e['data'].get('endReason'))
def D(a,b): return math.hypot(a[0]-b[0],a[1]-b[1])
def ang(a,b,c):
    v1=(a[0]-b[0],a[1]-b[1]); v2=(c[0]-b[0],c[1]-b[1])
    n=math.hypot(*v1)*math.hypot(*v2)
    return math.degrees(math.acos(max(-1,min(1,(v1[0]*v2[0]+v1[1]*v2[1])/n)))) if n else float('nan')
def feats(f):
    L=f['lm']; asp=f.get('aspect') or 1.7778
    L=[(p[0]*asp,p[1]) for p in L]            # undo x squash so distances are isotropic
    scale=D(L[0],L[9])                         # wrist -> middle MCP
    pc=tuple(sum(L[i][k] for i in (0,5,9,13,17))/5 for k in (0,1))
    return dict(
      pr=f['pinchRatio'],
      thumbOpen=int(bool((f.get('thumb') or {}).get('open'))),
      idx=(f.get('fingerStates') or ['?'])[0],
      mrp=''.join({'extended':'E','curled':'.','between':'b'}.get(v,'?') for v in (f.get('fingerStates') or ['?']*4)[1:]),
      idxReach=D(L[8],pc)/scale,              # index tip distance from palm centre
      thumbReach=D(L[4],pc)/scale,
      t2iPIP=D(L[4],L[6])/scale,               # thumb tip to index PIP
      t2iTip=D(L[4],L[8])/scale,
      tipVsPip=D(L[4],L[8])/max(1e-6,D(L[4],L[6])),
      t2iMCP=D(L[4],L[5])/scale,
      idxPIPang=ang(L[5],L[6],L[7]),
      idxDIPang=ang(L[6],L[7],L[8]),
      tipToMCP=D(L[8],L[5])/scale,
    )
grp=collections.defaultdict(list)
for f in F:
    if not f.get('lm') or f.get('pinchRatio') is None: continue
    t=f['t']; rp=f['rawPose']
    insid=[k for k,v in st.items() if v.get('a',1e12)<=t<=v.get('b',-1)]
    long_=[k for k in insid if (st[k].get('n') or 0)>=20]
    if rp=='pinch' and long_: grp['TRUE_PINCH(long stroke)'].append(feats(f))
    if 155800<=t<=168000:
        if rp=='pinch': grp['FALSE_PINCH(undo window)'].append(feats(f))
        if rp=='fist': grp['FIST(undo window)'].append(feats(f))
        if rp=='one-finger': grp['ONE(undo window)'].append(feats(f))
for g,rows in grp.items():
    print(f'== {g}: n={len(rows)}')
    print('   thumbOpen',collections.Counter(r['thumbOpen'] for r in rows),' index',collections.Counter(r['idx'] for r in rows),' mrp',collections.Counter(r['mrp'] for r in rows).most_common(4))
    for k in ('pr','idxReach','thumbReach','t2iPIP','t2iTip','tipVsPip','t2iMCP','idxPIPang','idxDIPang','tipToMCP'):
        v=sorted(r[k] for r in rows if r[k]==r[k])
        q=lambda p: v[min(len(v)-1,int(p*len(v)))]
        print(f'   {k:10s} p10 {q(.1):6.2f}  p50 {q(.5):6.2f}  p90 {q(.9):6.2f}')
json.dump({g:rows for g,rows in grp.items()},open('/home/claude/vid/feat_groups.json','w'))
