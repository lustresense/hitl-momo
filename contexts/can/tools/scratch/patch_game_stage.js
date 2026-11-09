const fs = require('fs');
const tsxPath = './implementation/src/components/game/GameStage.tsx';
let code = fs.readFileSync(tsxPath, 'utf8');

// Add data-decision-type to decision-chip
code = code.replace(
  '<p className="decision-chip">',
  '<p className="decision-chip" data-decision-type={decision.type}>'
);

// Wrap canvas in stage-container
code = code.replace(
  /<canvas[\s\S]*?\/>/,
  `<div className="stage-container">
        $&
      </div>`
);

fs.writeFileSync(tsxPath, code);
