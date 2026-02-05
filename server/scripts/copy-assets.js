const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, '../src/maps');
const destDir = path.join(__dirname, '../dist/maps');

function copyDir(src, dest) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }

  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

if (fs.existsSync(srcDir)) {
    try {
        console.log(`Copying maps from ${srcDir} to ${destDir}...`);
        copyDir(srcDir, destDir);
        console.log('Maps copied successfully!');
    } catch (err) {
        console.error('Error copying maps:', err);
        process.exit(1);
    }
} else {
    console.warn(`Source directory not found: ${srcDir}`);
}
