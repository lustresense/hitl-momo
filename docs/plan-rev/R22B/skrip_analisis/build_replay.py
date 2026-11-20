"""Numeric-only replay fixture for S-970f4cb0-T002 in the same frame format as tests/fixtures/t004-real-landmarks.json.
Usage: python3 -I build_replay.py <export.json> <out.json>"""
import json,sys
d=json.load(open(sys.argv[1]))
s=[x for x in d['sessions'] if x['meta']['sessionId']=='S-970f4cb0'][0]
tid='S-970f4cb0-T002'
F=[f for f in s['frames'] if f['trialId']==tid]
E=[e for e in s['events'] if e.get('trialId')==tid and e['type'] in ('STROKE_START','STROKE_END','UNDO','REDO','ERASE_START','ERASE_END','HAND_LOST','HAND_REACQUIRED')]
frames=[{'t':f['t'],'aspect':f.get('aspect') or 1.7778,'lm':[[round(p[0],4),round(p[1],4)] for p in f['lm']] if f.get('lm') else None,
         'captureFrameId':f.get('captureFrameId'),'frameAgeMs':f.get('frameAgeMs')} for f in F]
out={'schema':'r22-t004-landmark-fixture/1+r22b',
     'sourceTrialId':tid,
     'note':'Numeric-only 2D landmarks + timestamps from the Owner physical test on R22 1bb1a71 (Windows Chromium, backlit room, ~14.5 fps). No video/images/PII. Same frame format as t004-real-landmarks.json.',
     'build':{'appVersion':'0.29.1-alpha','gitCommit':'1bb1a71','route':'canvas','engine':'r20-c4','preprocess':'raw','numHands':'fixed-2'},
     'totalFrames':len(frames),'trackedFrames':sum(1 for f in frames if f['lm']),
     'undoWindowMs':[155800,168000],
     'undoWindowNote':'Owner only tried Undo here (fist->one, 5 UNDO fired). Original build drew 2 false strokes (17 @157.29s, 18 @158.61s) from fist->pinch misreads. Expected after fix: 0 STROKE_START inside this window.',
     'videoOffsetMs':87850,
     'originalEvents':[{'t':e['t'],'type':e['type'],'data':{k:v for k,v in (e.get('data') or {}).items() if k in ('strokeId','points','endReason','via','reason','gapMs')}} for e in E],
     'frames':frames}
json.dump(out,open(sys.argv[2],'w'),separators=(',',':'))
print(out['totalFrames'],out['trackedFrames'],len(out['originalEvents']))
