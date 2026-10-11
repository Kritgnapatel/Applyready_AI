const fs = require('fs');
const path = require('path');

const logPath = 'C:\\Users\\patel\\.gemini\\antigravity\\brain\\90a0395d-6872-4841-9dfe-cf6cda910cf0\\.system_generated\\logs\\transcript_full.jsonl';

const vfs = {};

// 1. Get initial style.css from step 28
const lines = fs.readFileSync(logPath, 'utf8').split('\n');

for (const line of lines) {
  if (!line.trim()) continue;
  try {
    const obj = JSON.parse(line);
    if (obj.step_index === 28) {
      const content = obj.content;
      const marker = 'The following code has been modified to include a line number before every line, in the format: <line_number>: <original_line>. Please note that any changes targeting the original code should remove the line number, colon, and leading space.\n';
      const idx = content.indexOf(marker);
      if (idx !== -1) {
        let rawLines = content.slice(idx + marker.length).split('\n');
        // Filter out any "The above content shows..."
        rawLines = rawLines.filter(l => !l.startsWith('The above content'));
        const codeLines = rawLines.map(l => {
          const colonIdx = l.indexOf(': ');
          return colonIdx !== -1 ? l.slice(colonIdx + 2) : l;
        });
        vfs['frontend/style.css'] = codeLines.join('\n').replace(/\r\n/g, '\n');
        console.log('Loaded initial style.css from step 28, length:', vfs['frontend/style.css'].length);
      }
    }
  } catch (e) {}
}

let successCount = 0;
let failCount = 0;

for (const line of lines) {
  if (!line.trim()) continue;
  try {
    const obj = JSON.parse(line);
    if (obj.step_index >= 2247) continue;

    if (obj.tool_calls) {
      for (const tc of obj.tool_calls) {
        if (tc.name === 'write_to_file') {
          const tf = tc.args.TargetFile || '';
          const norm = tf.replace(/\\/g, '/');
          if (norm.toLowerCase().includes('/frontend/')) {
            const rel = norm.toLowerCase().split('/frontend/')[1];
            const key = 'frontend/' + rel;
            vfs[key] = (tc.args.CodeContent || '').replace(/\r\n/g, '\n');
            console.log(`[Step ${obj.step_index}] write_to_file: ${key} (${vfs[key].length} bytes)`);
            successCount++;
          }
        } else if (tc.name === 'replace_file_content') {
          const tf = tc.args.TargetFile || '';
          const norm = tf.replace(/\\/g, '/');
          if (norm.toLowerCase().includes('/frontend/')) {
            const rel = norm.toLowerCase().split('/frontend/')[1];
            const key = 'frontend/' + rel;
            if (vfs[key] !== undefined) {
              const target = (tc.args.TargetContent || '').replace(/\r\n/g, '\n');
              const repl = (tc.args.ReplacementContent || '').replace(/\r\n/g, '\n');
              if (vfs[key].includes(target)) {
                if (tc.args.AllowMultiple) {
                  vfs[key] = vfs[key].split(target).join(repl);
                } else {
                  vfs[key] = vfs[key].replace(target, repl);
                }
                console.log(`[Step ${obj.step_index}] replace_file_content SUCCESS: ${key}`);
                successCount++;
              } else {
                console.error(`[Step ${obj.step_index}] replace_file_content FAILED in ${key}. Target preview:\n${target.slice(0, 100)}...`);
                failCount++;
              }
            } else {
              console.error(`[Step ${obj.step_index}] File not in vfs: ${key}`);
              failCount++;
            }
          }
        }
      }
    }
  } catch (e) {}
}

console.log(`\nReconstruction finished! Successes: ${successCount}, Failures: ${failCount}`);

const outDir = path.join(__dirname, '..', 'temp_restore');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

for (const [k, content] of Object.entries(vfs)) {
  const filename = k.split('/')[1];
  const outPath = path.join(outDir, filename);
  fs.writeFileSync(outPath, content, 'utf8');
  console.log(`Wrote: ${outPath} (${content.length} chars)`);
}
