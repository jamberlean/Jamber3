const fs = require('fs');

// Create a simple 64x64 PNG icon programmatically
function createSimplePNG() {
    const width = 64;
    const height = 64;
    
    // PNG file signature
    const signature = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
    
    // IHDR chunk
    const ihdrData = Buffer.alloc(13);
    ihdrData.writeUInt32BE(width, 0);    // Width
    ihdrData.writeUInt32BE(height, 4);   // Height
    ihdrData.writeUInt8(8, 8);           // Bit depth
    ihdrData.writeUInt8(2, 9);           // Color type (RGB)
    ihdrData.writeUInt8(0, 10);          // Compression method
    ihdrData.writeUInt8(0, 11);          // Filter method
    ihdrData.writeUInt8(0, 12);          // Interlace method
    
    const ihdr = createChunk('IHDR', ihdrData);
    
    // Create image data (RGB format)
    const imageData = Buffer.alloc(width * height * 3);
    
    // Fill with a simple pattern - blue background with guitar shape
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = (y * width + x) * 3;
            const centerX = width / 2;
            const centerY = height / 2;
            const dist = Math.sqrt((x - centerX) ** 2 + (y - centerY) ** 2);
            
            if (dist < 30) {
                // Blue background
                imageData[idx] = 52;     // R
                imageData[idx + 1] = 152; // G  
                imageData[idx + 2] = 219; // B
                
                // Simple guitar shape
                if (x >= 28 && x <= 36 && y >= 35 && y <= 55) {
                    // Guitar body - brown
                    imageData[idx] = 139;     // R
                    imageData[idx + 1] = 69;  // G
                    imageData[idx + 2] = 19;  // B
                }
                
                if (x >= 30 && x <= 34 && y >= 15 && y <= 35) {
                    // Guitar neck - tan
                    imageData[idx] = 210;     // R
                    imageData[idx + 1] = 180; // G
                    imageData[idx + 2] = 140; // B
                }
                
                // Sound hole
                if (dist < 5 && y >= 35 && y <= 45) {
                    imageData[idx] = 0;       // R
                    imageData[idx + 1] = 0;   // G
                    imageData[idx + 2] = 0;   // B
                }
            } else {
                // White background outside circle
                imageData[idx] = 255;     // R
                imageData[idx + 1] = 255; // G
                imageData[idx + 2] = 255; // B
            }
        }
    }
    
    // Compress image data (simplified)
    const zlib = require('zlib');
    const rows = [];
    
    for (let y = 0; y < height; y++) {
        const row = Buffer.alloc(width * 3 + 1);
        row[0] = 0; // No filter
        for (let x = 0; x < width; x++) {
            const srcIdx = (y * width + x) * 3;
            const dstIdx = x * 3 + 1;
            row[dstIdx] = imageData[srcIdx];
            row[dstIdx + 1] = imageData[srcIdx + 1];
            row[dstIdx + 2] = imageData[srcIdx + 2];
        }
        rows.push(row);
    }
    
    const rawData = Buffer.concat(rows);
    const compressedData = zlib.deflateSync(rawData);
    const idat = createChunk('IDAT', compressedData);
    
    // IEND chunk
    const iend = createChunk('IEND', Buffer.alloc(0));
    
    // Combine all parts
    return Buffer.concat([signature, ihdr, idat, iend]);
}

function createChunk(type, data) {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length, 0);
    
    const typeBuffer = Buffer.from(type, 'ascii');
    const crc = require('zlib').crc32(Buffer.concat([typeBuffer, data]));
    const crcBuffer = Buffer.alloc(4);
    crcBuffer.writeUInt32BE(crc, 0);
    
    return Buffer.concat([length, typeBuffer, data, crcBuffer]);
}

// Create the PNG file
try {
    const pngData = createSimplePNG();
    fs.writeFileSync('./assets/icon.png', pngData);
    console.log('PNG icon created successfully: assets/icon.png');
} catch (error) {
    console.error('Error creating PNG icon:', error);
    
    // Fallback: Create a very basic bitmap-style icon
    console.log('Creating fallback text-based icon...');
    const fallbackIcon = `data:image/svg+xml,${encodeURIComponent(`
        <svg width="64" height="64" xmlns="http://www.w3.org/2000/svg">
            <circle cx="32" cy="32" r="30" fill="#3498db"/>
            <rect x="28" y="10" width="8" height="25" fill="#8B4513"/>
            <ellipse cx="32" cy="42" rx="12" ry="16" fill="#8B4513"/>
            <circle cx="32" cy="42" r="4" fill="#000"/>
        </svg>
    `)}`;</pre>`;
    
    // Save as SVG instead
    const svgContent = `
        <svg width="64" height="64" xmlns="http://www.w3.org/2000/svg">
            <circle cx="32" cy="32" r="30" fill="#3498db"/>
            <rect x="28" y="10" width="8" height="25" fill="#8B4513"/>
            <ellipse cx="32" cy="42" rx="12" ry="16" fill="#8B4513"/>
            <circle cx="32" cy="42" r="4" fill="#000"/>
            <text x="32" y="55" text-anchor="middle" fill="white" font-size="8">SL</text>
        </svg>
    `;
    fs.writeFileSync('./assets/icon-simple.svg', svgContent);
    console.log('Fallback SVG created: assets/icon-simple.svg');
}