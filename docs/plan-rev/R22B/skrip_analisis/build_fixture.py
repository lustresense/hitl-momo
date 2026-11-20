"""Build a numeric-only weak-label fixture (no images) from the Owner's NUI Lab export.
Usage: python3 -I build_fixture.py <export.json> <out.json>"""
import json,sys,collections
d=json.load(open(sys.argv[1]))
S={s['meta']['sessionId']:s for s in d['sessions']}
MRP={'extended':'E','curled':'.','between':'b'}
def strokes(s,tid):
    st={}
    for e in s['events']:
        if e.get('trialId')!=tid: continue
        sid=(e.get('data') or {}).get('strokeId')
        if e['type']=='STROKE_START': st.setdefault(sid,{})['a']=e['t']
        if e['type']=='STROKE_END': st.setdefault(sid,{}).update(b=e['t'],n=(e.get('data') or {}).get('points'))
    return st
def spans(s,tid,a,b):
    out=[];cur=None
    for e in s['events']:
        if e.get('trialId')!=tid: continue
        if e['type']==a: cur=e['t']
        if e['type']==b and cur is not None: out.append((cur,e['t'])); cur=None
    return out
rows=[]
def add(f,sid,tid,pose,contact,variant,prov,conf,note):
    rows.append(dict(sessionId=sid,trialId=tid,t=f['t'],captureFrameId=f.get('captureFrameId'),aspect=f.get('aspect') or 1.7778,
        lm=[[round(p[0],4),round(p[1],4)] for p in f['lm']],
        rule=dict(rawPose=f['rawPose'],pinchRatio=f.get('pinchRatio'),fingerStates=f.get('fingerStates'),thumbOpen=bool((f.get('thumb') or {}).get('open'))),
        label=dict(pose=pose,contact=contact,variant=variant),labelProvenance=prov,confidence=conf,note=note))
# --- S-970f4cb0-T002 (R22 1bb1a71, Owner laptop, backlit room, screen-recorded) ---
sid='S-970f4cb0'; tid=sid+'-T002'; s=S[sid]
F=[f for f in s['frames'] if f['trialId']==tid and f.get('lm')]
st=strokes(s,tid); er=spans(s,tid,'ERASE_START','ERASE_END')
for f in F:
    t=f['t']; rp=f['rawPose']
    if 155800<=t<=168000:   # undo attempts window (video 01:08-01:20), Owner never intended to draw here
        if rp=='fist': add(f,sid,tid,'FIST','NONE',None,'protocol-window+video-review','high','undo arming fist')
        elif rp=='one-finger': add(f,sid,tid,'ONE','OPEN',None,'protocol-window+video-review','high','undo confirm')
        elif rp=='pinch': add(f,sid,tid,'FIST_OR_TRANSITION','NOT_PINCH',None,'protocol-window+video-review','high','HARD NEGATIVE: rule said pinch, hand was fist/fist<->one transition (video v=69.4, 76.6)')
        else: add(f,sid,tid,'TRANSITION','NOT_PINCH',None,'protocol-window','medium','rotation/transition frame')
        continue
    inlong=[k for k,v in st.items() if v.get('a',1e15)<=t<=v.get('b',-1) and (v.get('n') or 0)>=20]
    if rp=='pinch' and inlong:
        m=''.join(MRP.get(x,'?') for x in (f.get('fingerStates') or ['?']*4)[1:])
        var='OK' if m=='EEE' else ('CLOSED' if m=='...' else None)
        add(f,sid,tid,'PINCH','TOUCH',var,'deliberate-long-stroke(>=20pts)','medium',f'stroke {inlong[0]}; mrp={m}')
        continue
    if rp=='open-palm' and any(a<=t<=b for a,b in er):
        add(f,sid,tid,'FIVE','OPEN',None,'user-action(erase accepted)','medium','erase span')
# --- S-07ba0cde-T004 (R20 0.27.0, other device) : positives only, cross-session check ---
sid='S-07ba0cde'; tid=sid+'-T004'; s=S[sid]
F=[f for f in s['frames'] if f['trialId']==tid and f.get('lm')]
st=strokes(s,tid)
for f in F:
    inlong=[k for k,v in st.items() if v.get('a',1e15)<=f['t']<=v.get('b',-1) and (v.get('n') or 0)>=20]
    if f['rawPose']=='pinch' and inlong:
        m=''.join(MRP.get(x,'?') for x in (f.get('fingerStates') or ['?']*4)[1:])
        var='OK' if m=='EEE' else ('CLOSED' if m=='...' else None)
        add(f,sid,tid,'PINCH','TOUCH',var,'deliberate-long-stroke(>=20pts)','medium',f'stroke {inlong[0]}; mrp={m}')
out=dict(schema='r22b-handstate-weaklabel-fixture/1',
  note='Numeric-only 21x2 landmarks + weak labels. No video/images/PII. Labels are NOT ground truth: protocol windows, deliberate long strokes, accepted erase spans, and spot video review by Claude (auditor). Use as hard-negative + regression set, never as the only training source.',
  sources={'S-970f4cb0-T002':'app 0.29.1-alpha, commit 1bb1a71, Windows Chromium 12 threads/16 GB, backlit room, ~14.5 fps, video offset t_session = t_video + 87.85 s',
           'S-07ba0cde-T004':'app 0.27.0-alpha (R20), other device'},
  labelSchema={'pose':['FIST','ONE','FIVE','PINCH','FIST_OR_TRANSITION','TRANSITION'],'contact':['TOUCH','NOT_PINCH','OPEN','NONE'],'variant':['CLOSED','OK',None]},
  counts=collections.Counter(f"{r['trialId']}:{r['label']['pose']}/{r['label']['contact']}/{r['label']['variant']}" for r in rows),
  frames=rows)
json.dump(out,open(sys.argv[2],'w'))
for k,v in sorted(out['counts'].items()): print(f'{v:5d}  {k}')
print('total',len(rows))
