const fs = require('fs');
const cssPath = './implementation/app/globals.css';
let css = fs.readFileSync(cssPath, 'utf8');

const decisionChipStyles = `
.decision-chip[data-decision-type="accept"] {
  background: var(--color-accept-soft);
  color: var(--color-accept);
  border-color: var(--color-accept);
}

.decision-chip[data-decision-type="correct"] {
  background: var(--color-correct-soft);
  color: var(--color-correct);
  border-color: var(--color-correct);
}

.decision-chip[data-decision-type="override"] {
  background: var(--color-override-soft);
  color: var(--color-override);
  border-color: var(--color-override);
}
`;
css = css.replace('.decision-chip {', decisionChipStyles + '\n.decision-chip {');

const stageContainerStyles = `
.stage-container {
  position: relative;
  width: 100%;
  margin-top: 16px;
  background: var(--surface-canvas);
  border: 4px solid var(--ink-border);
  border-radius: var(--radius-md);
  box-shadow: 6px 6px 0 rgba(0,0,0,0.06);
  padding: 8px;
  /* Cutout storybook window look */
  background-image: 
    linear-gradient(var(--ink-line-subtle) 1px, transparent 1px),
    linear-gradient(90deg, var(--ink-line-subtle) 1px, transparent 1px);
  background-size: 20px 20px;
}

/* Paper-tape corners & registration marks */
.stage-container::before, .stage-container::after {
  content: "";
  position: absolute;
  width: 24px;
  height: 24px;
  border: 2px solid var(--ink-border);
  pointer-events: none;
  z-index: 5;
}

.stage-container::before {
  top: -6px;
  left: -6px;
  border-right: none;
  border-bottom: none;
}

.stage-container::after {
  bottom: -6px;
  right: -6px;
  border-left: none;
  border-top: none;
}

.stage-container canvas.game-canvas {
  border: 2px solid var(--ink-primary);
  border-radius: 4px;
  box-shadow: none;
  margin: 0;
  display: block;
}
`;
css = css.replace('.game-canvas, #game-canvas {', stageContainerStyles + '\n.game-canvas, #game-canvas {');

const overlayAnimStyles = `
@keyframes slideUpCard {
  0% { transform: translateY(40px); opacity: 0; }
  100% { transform: translateY(0); opacity: 1; }
}
`;

css = css.replace('.overlay {', overlayAnimStyles + '\n.overlay {\n  animation: slideUpCard 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;\n');

fs.writeFileSync(cssPath, css);
